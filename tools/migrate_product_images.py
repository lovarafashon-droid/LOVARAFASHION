#!/usr/bin/env python3
"""Migrate Base64 product images from Firebase Firestore to ImageKit.

Modes:
  --dry-run  Inspect products and report what would be migrated.
  --migrate  Upload Base64 images and update Firestore only after all uploads for a product succeed.
  --verify   Verify ImageKit URLs stored in products.
  --cleanup  Remove Base64 values only for products already migrated and verified.

Required environment variables:
  IMAGEKIT_PRIVATE_KEY
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY (with literal or escaped newlines)

Alternatively, set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account JSON file.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import mimetypes
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests
from firebase_admin import credentials, firestore, initialize_app, get_app

DATA_URL_RE = re.compile(r"^data:(?P<mime>[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,(?P<data>.+)$", re.DOTALL)
IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"
DEFAULT_FOLDER = "/lovara/products-migrated"


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def json_default(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "seconds"):
        return {"seconds": value.seconds, "nanos": getattr(value, "nanos", 0)}
    return str(value)


def init_firestore():
    try:
        app = get_app()
    except ValueError:
        credentials_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if credentials_file:
            app = initialize_app(credentials.Certificate(credentials_file))
        else:
            private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
            required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]
            missing = [name for name in required if not os.getenv(name)]
            if missing:
                raise RuntimeError("Missing Firebase configuration: " + ", ".join(missing))
            app = initialize_app(credentials.Certificate({
                "type": "service_account",
                "project_id": os.environ["FIREBASE_PROJECT_ID"],
                "client_email": os.environ["FIREBASE_CLIENT_EMAIL"],
                "private_key": private_key,
                "token_uri": "https://oauth2.googleapis.com/token",
            }))
    return firestore.client(app)


def parse_data_url(value: Any) -> tuple[bytes, str] | None:
    if not isinstance(value, str):
        return None
    match = DATA_URL_RE.match(value)
    if not match:
        return None
    try:
        return base64.b64decode(match.group("data"), validate=True), match.group("mime")
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"Invalid Base64 image data: {exc}") from exc


def extension_for_mime(mime: str) -> str:
    return mimetypes.guess_extension(mime) or ".jpg"


def iter_image_values(product: dict[str, Any]) -> Iterable[tuple[str, int, str]]:
    image_url = product.get("imageUrl")
    if parse_data_url(image_url):
        yield "imageUrl", 0, image_url
    images = product.get("images")
    if isinstance(images, list):
        for index, value in enumerate(images):
            if parse_data_url(value):
                yield "images", index, value


def backup_products(products: list[dict[str, Any]], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"products-backup-{now_stamp()}.json"
    path.write_text(json.dumps(products, ensure_ascii=False, indent=2, default=json_default), encoding="utf-8")
    return path


def discover_products(db, limit: int | None = None):
    query = db.collection("products")
    docs = query.stream()
    for index, doc in enumerate(docs):
        if limit is not None and index >= limit:
            break
        yield doc


def product_images_to_upload(product: dict[str, Any]) -> list[tuple[str, int, str, bytes, str]]:
    result = []
    seen: set[str] = set()
    for field, index, value in iter_image_values(product):
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        parsed = parse_data_url(value)
        assert parsed is not None
        content, mime = parsed
        result.append((field, index, value, content, mime))
    return result


def upload_image(session: requests.Session, private_key: str, content: bytes, mime: str, file_name: str, folder: str) -> str:
    response = session.post(
        IMAGEKIT_UPLOAD_URL,
        auth=(private_key, ""),
        files={"file": (file_name, content, mime)},
        data={"fileName": file_name, "folder": folder, "useUniqueFileName": "true"},
        timeout=60,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"ImageKit upload failed ({response.status_code}): {response.text[:500]}")
    result = response.json()
    url = result.get("url")
    if not url:
        raise RuntimeError("ImageKit response did not contain a URL")
    return url


def verify_url(session: requests.Session, url: str) -> bool:
    try:
        response = session.get(url, stream=True, timeout=30)
        response.close()
        return 200 <= response.status_code < 300
    except requests.RequestException:
        return False


def migrate(args, db, products: list[dict[str, Any]], report: dict[str, Any]):
    private_key = os.getenv("IMAGEKIT_PRIVATE_KEY")
    if not private_key:
        raise RuntimeError("IMAGEKIT_PRIVATE_KEY is required for --migrate")
    session = requests.Session()

    for product in products:
        product_id = product["id"]
        to_upload = product_images_to_upload(product)
        report["images_seen"] += len(to_upload)
        if not to_upload:
            report["skipped_products"] += 1
            continue
        if args.dry_run:
            report["planned_products"] += 1
            report["planned_bytes"] += sum(len(item[3]) for item in to_upload)
            continue

        replacements: dict[tuple[str, int], str] = {}
        try:
            for field, index, _old_value, content, mime in to_upload:
                suffix = extension_for_mime(mime)
                file_name = f"{product_id}-{field}-{index + 1}-{hashlib.sha1(content).hexdigest()[:12]}{suffix}"
                url = upload_image(session, private_key, content, mime, file_name, f"{args.folder}/{product_id}")
                replacements[(field, index)] = url

            new_images = list(product.get("images") or [])
            new_image_url = product.get("imageUrl")
            for (field, index), url in replacements.items():
                if field == "imageUrl":
                    new_image_url = url
                else:
                    while len(new_images) <= index:
                        new_images.append("")
                    new_images[index] = url

            update = {"imageUrl": new_image_url, "images": new_images,
                      "imageMigration": {"provider": "imagekit", "migratedAt": firestore.SERVER_TIMESTAMP}}
            db.collection("products").document(product_id).update(update)
            report["migrated_products"] += 1
            report["migrated_images"] += len(replacements)
        except Exception as exc:
            report["failed_products"].append({"id": product_id, "error": str(exc)})


def verify_products(products: list[dict[str, Any]], report: dict[str, Any]):
    session = requests.Session()
    for product in products:
        urls = []
        if isinstance(product.get("imageUrl"), str) and product["imageUrl"].startswith("https://ik.imagekit.io/"):
            urls.append(product["imageUrl"])
        urls.extend(value for value in product.get("images", []) if isinstance(value, str) and value.startswith("https://ik.imagekit.io/"))
        for url in urls:
            report["urls_checked"] += 1
            if verify_url(session, url):
                report["urls_ok"] += 1
            else:
                report["urls_failed"].append({"id": product["id"], "url": url})


def cleanup_products(db, products: list[dict[str, Any]], report: dict[str, Any]):
    session = requests.Session()
    for product in products:
        if not product.get("imageMigration", {}).get("provider") == "imagekit":
            continue
        images = product.get("images")
        urls = [value for value in (images or []) if isinstance(value, str) and value.startswith("https://ik.imagekit.io/")]
        image_url = product.get("imageUrl")
        if isinstance(image_url, str) and image_url.startswith("https://ik.imagekit.io/"):
            urls.append(image_url)
        if urls and all(verify_url(session, url) for url in urls):
            updates = {"imageMigration.cleanupAt": firestore.SERVER_TIMESTAMP}
            if parse_data_url(image_url):
                updates["imageUrl"] = urls[0]
            if isinstance(images, list) and any(parse_data_url(value) for value in images):
                updates["images"] = [value for value in images if not parse_data_url(value)]
            if len(updates) > 1:
                db.collection("products").document(product["id"]).update(updates)
                report["cleanup_marked"] += 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--migrate", action="store_true")
    mode.add_argument("--verify", action="store_true")
    mode.add_argument("--cleanup", action="store_true", help="Mark verified products as clean; does not delete backup files")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--folder", default=DEFAULT_FOLDER)
    parser.add_argument("--backup-dir", default="migration-backups")
    args = parser.parse_args()

    if args.migrate and not os.getenv("IMAGEKIT_PRIVATE_KEY"):
        parser.error("--migrate requires IMAGEKIT_PRIVATE_KEY")
    db = init_firestore()
    products = [{"id": doc.id, **doc.to_dict()} for doc in discover_products(db, args.limit)]
    report = {"startedAt": datetime.now(timezone.utc).isoformat(), "products_seen": len(products),
              "images_seen": 0, "planned_products": 0, "planned_bytes": 0, "migrated_products": 0,
              "migrated_images": 0, "skipped_products": 0, "failed_products": [], "urls_checked": 0,
              "urls_ok": 0, "urls_failed": [], "cleanup_marked": 0}

    backup = backup_products(products, Path(args.backup_dir))
    report["backup"] = str(backup)
    if args.dry_run or args.migrate:
        migrate(args, db, products, report)
    elif args.verify:
        verify_products(products, report)
    elif args.cleanup:
        verify_products(products, report)
        if report["urls_failed"]:
            raise RuntimeError("Cleanup stopped because one or more ImageKit URLs failed verification")
        cleanup_products(db, products, report)

    report_path = Path(args.backup_dir) / f"migration-report-{now_stamp()}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(report_path), **report}, ensure_ascii=False, indent=2))
    return 1 if report["failed_products"] or report["urls_failed"] else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
