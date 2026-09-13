const admin = require('firebase-admin');

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error('Firebase Admin credentials are not configured.');
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
  }
  return admin;
}

async function findOrderByNumber(orderNumber) {
  const db = getFirebaseAdmin().firestore();
  const snapshot = await db.collection('orders')
    .where('orderNumber', '==', String(orderNumber))
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { ref: doc.ref, data: doc.data() };
}

function orderTotal(order) {
  const raw = order && order.totals && order.totals.total;
  const amount = Number(String(raw == null ? '' : raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

module.exports = { admin: getFirebaseAdmin, findOrderByNumber, orderTotal };
