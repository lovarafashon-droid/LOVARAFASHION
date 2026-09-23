#!/usr/bin/env python3
"""Find duplicate images safely. Dry-run is the default.

Examples:
  python3 tools/deduplicate_images.py /path/to/export
  python3 tools/deduplicate_images.py /path/to/export --similarity 8
  python3 tools/deduplicate_images.py /path/to/export --move-duplicates
  python3 tools/deduplicate_images.py /path/to/export --delete --yes
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from collections import defaultdict
from pathlib import Path

try:
    from PIL import Image, UnidentifiedImageError
except ImportError:
    print("Install Pillow first: python3 -m pip install Pillow", file=sys.stderr)
    raise SystemExit(2)

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def files(folder: Path):
    return sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSIONS)


def exact_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fingerprint(path: Path):
    with Image.open(path) as image:
        size = image.size
        gray = image.convert("L").resize((16, 16), Image.Resampling.LANCZOS)
        pixels = list(gray.get_flattened_data() if hasattr(gray, "get_flattened_data") else gray.getdata())
    average = sum(pixels) / len(pixels)
    return exact_hash(path), "".join("1" if pixel >= average else "0" for pixel in pixels), size


def distance(left: str, right: str) -> int:
    return sum(a != b for a, b in zip(left, right))


def better(item):
    path, _hash, dimensions = item
    return (dimensions[0] * dimensions[1], path.stat().st_size, path.name.lower())


def unique_target(folder: Path, source: Path) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / source.name
    number = 2
    while target.exists():
        target = folder / f"{source.stem}_{number}{source.suffix}"
        number += 1
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Find and clean duplicate Telegram-exported images.")
    parser.add_argument("folder", type=Path)
    parser.add_argument("--similarity", type=int, default=0, metavar="BITS", help="also group visually similar images within this hash distance (default: exact only)")
    parser.add_argument("--move-duplicates", action="store_true", help="move duplicates to a reversible sibling folder")
    parser.add_argument("--delete", action="store_true", help="permanently delete duplicates")
    parser.add_argument("--yes", action="store_true", help="confirm permanent deletion")
    args = parser.parse_args()

    folder = args.folder.expanduser().resolve()
    if not folder.is_dir():
        print(f"Folder not found: {folder}", file=sys.stderr)
        return 2
    if not 0 <= args.similarity <= 256:
        print("--similarity must be from 0 to 256", file=sys.stderr)
        return 2
    if args.delete and not args.yes:
        print("Deletion needs both --delete and --yes.", file=sys.stderr)
        return 2
    if args.delete and args.move_duplicates:
        print("Choose --delete or --move-duplicates, not both.", file=sys.stderr)
        return 2

    exact_groups = defaultdict(list)
    unreadable = []
    all_files = files(folder)
    for path in all_files:
        try:
            exact, perceptual, dimensions = fingerprint(path)
            exact_groups[exact].append((path, perceptual, dimensions))
        except (OSError, ValueError, UnidentifiedImageError) as error:
            unreadable.append((path, str(error)))

    groups = [group for group in exact_groups.values() if len(group) > 1]
    if args.similarity:
        near_groups = []
        for group in exact_groups.values():
            if len(group) != 1:
                continue
            item = group[0]
            for candidate in near_groups:
                if distance(item[1], candidate[0][1]) <= args.similarity:
                    candidate.append(item)
                    break
            else:
                near_groups.append([item])
        groups.extend(group for group in near_groups if len(group) > 1)

    duplicates = []
    print(f"Scanned {len(all_files)} image files; found {len(groups)} duplicate groups.")
    for number, group in enumerate(groups, 1):
        keeper = max(group, key=better)
        print(f"\nGroup {number}: KEEP {keeper[0].name}")
        for item in sorted(group, key=lambda value: value[0].name.lower()):
            path, _perceptual, dimensions = item
            marker = "KEEP" if path == keeper[0] else "DUPLICATE"
            print(f"  {marker}: {path.relative_to(folder)} ({dimensions[0]}x{dimensions[1]}, {path.stat().st_size:,} bytes)")
            if path != keeper[0]:
                duplicates.append(path)

    if unreadable:
        print(f"\nUnreadable files skipped: {len(unreadable)}")
    print(f"\nDuplicate files: {len(duplicates)}")
    if not duplicates:
        return 0

    if args.move_duplicates:
        destination = folder.parent / f"{folder.name}_duplicates"
        for source in duplicates:
            shutil.move(str(source), str(unique_target(destination, source)))
        print(f"Moved duplicates to {destination}")
    elif args.delete:
        for source in duplicates:
            source.unlink()
        print("Permanently deleted duplicate files.")
    else:
        print("Preview only; no files changed. Use --move-duplicates for reversible cleanup.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

