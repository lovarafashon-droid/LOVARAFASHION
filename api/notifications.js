'use strict';

const crypto = require('crypto');
const { admin, findOrderByNumber } = require('./_lib/firestore');

function tokenId(token) {
  return `device_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}
function clean(value, fallback = '') {
  return String(value == null ? fallback : value).replace(/[<>]/g, '').trim();
}
function amountText(order) {
  const raw = order?.totals?.total || '';
  const amount = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? `EGP ${amount.toFixed(2)}` : clean(raw, 'غير محدد');
}
function matchesInternalSecret(provided, expected) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

async function sendNewOrder(req, res) {
  if (!matchesInternalSecret(req.headers['x-lovara-internal-key'], process.env.XPAY_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid internal notification signature.' });
  }
  const orderNumber = clean(req.body?.orderNumber);
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderNumber)) return res.status(400).json({ error: 'Missing or invalid order number.' });
  try {
    const found = await findOrderByNumber(orderNumber);
    if (!found) return res.status(404).json({ error: 'Order not found.' });
    const order = found.data;
    if (order.payment?.status !== 'paid' || order.payment?.paid !== true) {
      return res.status(409).json({ error: 'Order payment is not confirmed.' });
    }
    const db = admin().firestore();
    const orderRef = found.ref;
    if (order.notifications?.newOrder?.sentAt) return res.status(200).json({ sent: false, duplicate: true });

    const tokenSnapshot = await db.collection('notificationTokens').where('active', '==', true).limit(500).get();
    const tokenDocs = tokenSnapshot.docs.filter(doc => doc.data()?.token);
    const tokens = tokenDocs.map(doc => doc.data().token);
    if (!tokens.length) {
      await orderRef.set({ notifications: { ...(order.notifications || {}), newOrder: { sentAt: null, reason: 'no_registered_devices' } } }, { merge: true });
      return res.status(200).json({ sent: false, reason: 'no_registered_devices' });
    }
    const customer = order.customer || {};
    const customerName = clean(`${customer.firstName || ''} ${customer.lastName || ''}`, 'عميل جديد');
    const siteUrl = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const message = {
      tokens,
      notification: { title: 'طلب جديد - LOVARA', body: `${customerName} • ${amountText(order)}` },
      data: { orderNumber, title: 'طلب جديد - LOVARA', body: `${customerName} • ${amountText(order)}`, url: '/orders.html' },
      webpush: {
        ...(siteUrl ? { fcmOptions: { link: `${siteUrl}/orders.html` } } : {}),
        notification: { icon: '/LOVARA.jpeg', badge: '/LOVARA.jpeg', tag: orderNumber, requireInteraction: true }
      }
    };
    let result = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await admin().messaging().sendEachForMulticast(message);
        if (result.successCount > 0) break;
      } catch (error) { lastError = error; }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!result) throw lastError || new Error('Firebase did not return a notification result.');
    const invalidCodes = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
    const cleanup = [];
    result.responses.forEach((response, index) => {
      if (!response.success && invalidCodes.has(response.error?.code)) cleanup.push(tokenDocs[index].ref);
    });
    await Promise.all(cleanup.map(ref => ref.delete()));
    if (result.successCount === 0) {
      await orderRef.set({ notifications: { ...(order.notifications || {}), newOrder: { sentAt: null, lastAttemptAt: admin().firestore.FieldValue.serverTimestamp(), successCount: 0, failureCount: result.failureCount } } }, { merge: true });
      return res.status(503).json({ sent: false, successCount: 0, failureCount: result.failureCount, error: 'No registered device accepted the notification.' });
    }
    await orderRef.set({ notifications: { ...(order.notifications || {}), newOrder: { sentAt: admin().firestore.FieldValue.serverTimestamp(), successCount: result.successCount, failureCount: result.failureCount } } }, { merge: true });
    return res.status(200).json({ sent: true, successCount: result.successCount, failureCount: result.failureCount });
  } catch (error) {
    console.error('[new-order notification]', error);
    return res.status(500).json({ error: 'Could not send notification.' });
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = String(req.query?.action || req.body?.action || '').trim().toLowerCase();
  if (action === 'new-order') return sendNewOrder(req, res);
  if (!['register', 'unregister'].includes(action)) return res.status(400).json({ error: 'Unsupported notification action.' });

  const authHeader = String(req.headers.authorization || '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = String(req.body?.token || '').trim();
  if (!idToken || !token) return res.status(401).json({ error: 'Authentication and notification token are required.' });
  try {
    const app = admin();
    const decoded = await app.auth().verifyIdToken(idToken);
    const db = app.firestore();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    const tokenRef = db.collection('notificationTokens').doc(tokenId(token));
    if (action === 'register') {
      await tokenRef.set({ token, uid: decoded.uid, active: true, userAgent: String(req.body?.userAgent || '').slice(0, 500), updatedAt: app.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ registered: true });
    }
    await tokenRef.set({ active: false, updatedAt: app.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return res.status(200).json({ disabled: true });
  } catch (error) {
    console.error(`[${action} notification token]`, error);
    return res.status(401).json({ error: action === 'register' ? 'Could not authenticate admin device.' : 'Could not disable this device.' });
  }
};
