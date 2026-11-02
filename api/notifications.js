const crypto = require('crypto');
const { admin } = require('./_lib/firestore');

function tokenId(token) {
  return `device_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = String(req.query?.action || req.body?.action || '').trim().toLowerCase();
  if (!['register', 'unregister'].includes(action)) {
    return res.status(400).json({ error: 'Unsupported notification action.' });
  }

  const authHeader = String(req.headers.authorization || '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = String(req.body?.token || '').trim();
  if (!idToken || !token) {
    return res.status(401).json({ error: 'Authentication and notification token are required.' });
  }

  try {
    const app = admin();
    const decoded = await app.auth().verifyIdToken(idToken);
    const db = app.firestore();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const tokenRef = db.collection('notificationTokens').doc(tokenId(token));
    if (action === 'register') {
      await tokenRef.set({
        token,
        uid: decoded.uid,
        active: true,
        userAgent: String(req.body?.userAgent || '').slice(0, 500),
        updatedAt: app.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).json({ registered: true });
    }

    await tokenRef.set({ active: false, updatedAt: app.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return res.status(200).json({ disabled: true });
  } catch (error) {
    console.error(`[${action} notification token]`, error);
    return res.status(401).json({
      error: action === 'register'
        ? 'Could not authenticate admin device.'
        : 'Could not disable this device.'
    });
  }
};
