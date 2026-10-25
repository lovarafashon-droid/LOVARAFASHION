const crypto = require('crypto');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const jpeg = require('jpeg-js');

function initializeFirebase() {
  if (getApps().length) return;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  return JSON.parse(raw);
}

async function authorizeAndReserve(db, uid, kind, id) {
  const quotaRef = db.collection('imageUploadQuotas').doc(uid);
  const requestRef = db.collection('storeRequests').doc(uid);
  const shopRef = db.collection('shops').doc(id);
  const today = new Date().toISOString().slice(0, 10);

  await db.runTransaction(async transaction => {
    const quotaSnap = await transaction.get(quotaRef);
    const quota = quotaSnap.exists && quotaSnap.data().day === today ? Number(quotaSnap.data().count || 0) : 0;
    if (quota >= 20) throw new Error('تم الوصول إلى الحد اليومي وهو 20 صورة. حاولي مرة أخرى غدًا.');

    if (kind === 'store-application') {
      if (id !== uid) throw new Error('طلب غير مصرح به.');
      const requestSnap = await transaction.get(requestRef);
      const request = requestSnap.exists ? requestSnap.data() : {};
      const uploadStarted = request.uploadStartedAt?.toDate ? request.uploadStartedAt.toDate().getTime() : 0;
      const expiredUploadLock = request.status === 'uploading' && Date.now() - uploadStarted > 10 * 60 * 1000;
      if (request.ownerUid !== uid || (request.status !== 'draft' && !expiredUploadLock) || request.imageUrl) {
        throw new Error('طلب المتجر غير جاهز لرفع الصورة أو سبق إرساله.');
      }
      transaction.update(requestRef, {
        status: 'uploading',
        uploadStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else if (kind === 'store-product') {
      if (!/^[a-z0-9-]{1,60}$/i.test(id)) throw new Error('معرّف متجر غير صالح.');
      const shopSnap = await transaction.get(shopRef);
      const shop = shopSnap.exists ? shopSnap.data() : {};
      const expiresAt = shop.expiresAt instanceof Timestamp ? shop.expiresAt.toDate() : null;
      if (shop.ownerUid !== uid || shop.active !== true || !expiresAt || expiresAt.getTime() <= Date.now()) {
        throw new Error('المتجر غير نشط أو لا تملكين صلاحية رفع الصور إليه.');
      }
    } else {
      throw new Error('نوع رفع غير صالح.');
    }

    transaction.set(quotaRef, { day: today, count: quota + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  return { requestRef };
}

const handler = async function (req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  if (Number(req.headers['content-length'] || 0) > 3.5 * 1024 * 1024) {
    return res.status(413).json({ error: 'The image request is too large.' });
  }

  const privateKey = String(process.env.IMAGEKIT_PRIVATE_KEY || '').trim();
  if (!privateKey) return res.status(500).json({ error: 'ImageKit is not configured on the server.' });
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });

  let decoded;
  let body;
  let bytes;
  try {
    initializeFirebase();
    decoded = await getAuth().verifyIdToken(authorization.slice(7));
    body = readBody(req);
    if (!body || typeof body.dataUrl !== 'string' || body.dataUrl.length > 3.2 * 1024 * 1024) {
      return res.status(413).json({ error: 'The image must be 2 MB or smaller.' });
    }
    const match = body.dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(415).json({ error: 'Only compressed JPEG images are accepted.' });
    bytes = Buffer.from(match[1], 'base64');
    if (!bytes.length || bytes.length > 2 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return res.status(415).json({ error: 'The file is not a valid JPEG image or exceeds 2 MB.' });
    }
    let decodedImage;
    try {
      decodedImage = jpeg.decode(bytes, {
        useTArray: true,
        tolerantDecoding: false,
        maxResolutionInMP: 12,
        maxMemoryUsageInMB: 64
      });
    } catch (_) {
      return res.status(415).json({ error: 'The JPEG file is damaged or incomplete.' });
    }
    if (!decodedImage.width || !decodedImage.height || !decodedImage.data?.length || decodedImage.width * decodedImage.height > 12 * 1000 * 1000) {
      return res.status(415).json({ error: 'The JPEG image dimensions are not supported.' });
    }
  } catch (error) {
    console.error('[LOVARA store image] Request validation failed:', error.message);
    return res.status(400).json({ error: 'Invalid image upload request.' });
  }

  const kind = body.kind;
  const id = String(body.id || '');
  const db = getFirestore();
  let requestRef;
  try {
    ({ requestRef } = await authorizeAndReserve(db, decoded.uid, kind, id));
  } catch (error) {
    return res.status(error.message.includes('limit') || error.message.includes('الحد اليومي') ? 429 : 403).json({ error: error.message });
  }

  const fileName = `${kind === 'store-application' ? 'store' : 'product'}-${crypto.randomUUID()}.jpg`;
  const folder = kind === 'store-application' ? '/lovara/store-applications' : `/lovara/stores/${id}`;
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/jpeg' }), fileName);
    form.append('fileName', fileName);
    form.append('folder', folder);
    form.append('useUniqueFileName', 'false');
    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}` },
      body: form
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.url !== 'string' || !result.url.startsWith('https://ik.imagekit.io/')) {
      console.error('[LOVARA store image] ImageKit upload failed:', result.message || response.status);
      throw new Error('Image hosting rejected the upload.');
    }

    if (kind === 'store-application') {
      await db.runTransaction(async transaction => {
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists || requestSnap.data().ownerUid !== decoded.uid || requestSnap.data().status !== 'uploading') {
          throw new Error('The store request changed during upload.');
        }
        transaction.update(requestRef, {
          imageUrl: result.url,
          status: 'pending',
          uploadStartedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });
    }
    return res.status(200).json({ imageUrl: result.url });
  } catch (error) {
    if (kind === 'store-application' && requestRef) {
      try {
        await db.runTransaction(async transaction => {
          const requestSnap = await transaction.get(requestRef);
          if (requestSnap.exists && requestSnap.data().ownerUid === decoded.uid && requestSnap.data().status === 'uploading') {
            transaction.update(requestRef, { status: 'draft', uploadStartedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
          }
        });
      } catch (releaseError) {
        console.error('[LOVARA store image] Could not release draft:', releaseError.message);
      }
    }
    console.error('[LOVARA store image] Upload failed:', error.message);
    return res.status(502).json({ error: 'Could not upload this image. Try again later.' });
  }
};

module.exports = handler;
module.exports.config = { api: { bodyParser: { sizeLimit: '3.5mb' } } };
