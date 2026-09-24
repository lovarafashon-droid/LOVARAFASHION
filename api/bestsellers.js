const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function getDb() {
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
  return getFirestore();
}

function isCancelled(order) {
  const status = String(order.status || order.confirmationStatus || '').toLowerCase();
  return ['cancelled', 'canceled', 'rejected', 'deleted'].includes(status);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  try {
    const snapshot = await getDb().collection('orders').get();
    const totals = new Map();
    snapshot.forEach(doc => {
      const order = doc.data() || {};
      if (isCancelled(order)) return;
      (Array.isArray(order.items) ? order.items : []).forEach(item => {
        const id = String(item.productId || item.id || '').trim();
        const name = String(item.name || '').trim();
        const key = id ? `id:${id}` : (name ? `name:${name.toLowerCase()}` : '');
        if (!key) return;
        const previous = totals.get(key) || { productId: id, name, quantity: 0 };
        previous.quantity += Math.max(1, Number(item.quantity) || 1);
        if (!previous.name && name) previous.name = name;
        totals.set(key, previous);
      });
    });
    const bestsellers = Array.from(totals.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
    return res.status(200).json({ bestsellers });
  } catch (error) {
    console.error('[Bestsellers API]', error);
    return res.status(500).json({ error: 'Could not load bestseller data.' });
  }
};
