const crypto = require('crypto');
const { admin } = require('../_lib/firestore');

function tokenId(token) {
  return `device_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = String(req.headers.authorization || '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = String(req.body?.token || '').trim();
  if (!idToken || !token) return res.status(401).json({ error: 'Authentication and notification token are required.' });

  try {
    const decoded = await admin().auth().verifyIdToken(idToken);
    const db = admin().firestore();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });

    await db.collection('notificationTokens').doc(tokenId(token)).set({
      token,
      uid: decoded.uid,
      active: true,
      userAgent: String(req.body?.userAgent || '').slice(0, 500),
      updatedAt: admin().firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return res.status(200).json({ registered: true });
  } catch (error) {
    console.error('[register notification token]', error);
    return res.status(401).json({ error: 'Could not authenticate admin device.' });
  }
};
