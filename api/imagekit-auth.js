const crypto = require('crypto');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

function getAdminAuth() {
  if (!getApps().length) {
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
  }
  return getAuth();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Environment managers can preserve accidental surrounding whitespace.
  const privateKey = String(process.env.IMAGEKIT_PRIVATE_KEY || '').trim();
  if (!privateKey) return res.status(500).json({ error: 'ImageKit is not configured on the server.' });

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const decoded = await getAdminAuth().verifyIdToken(authorization.slice(7));
    let isAdmin = decoded.admin === true || decoded.role === 'admin';
    if (!isAdmin) {
      const userDoc = await getFirestore().collection('users').doc(decoded.uid).get();
      isAdmin = userDoc.exists && userDoc.data().role === 'admin';
    }
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  } catch (error) {
    console.error('[ImageKit auth]', error.message);
    return res.status(401).json({ error: 'Invalid authentication.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expire = Math.floor(Date.now() / 1000) + 600;
  // ImageKit requires HMAC-SHA1(token + expire, privateKey), not plain SHA1.
  const signature = crypto.createHmac('sha1', privateKey).update(token + expire).digest('hex');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ token, expire, signature });
};
