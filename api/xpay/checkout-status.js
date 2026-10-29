const crypto = require('crypto');
const { admin } = require('../_lib/firestore');

const paidStatuses = new Set(['paid', 'succeeded', 'success', 'completed', 'approved']);
const failedStatuses = new Set(['failed', 'cancelled', 'canceled', 'declined', 'expired']);

function statusOf(order) {
  const payment = order?.payment || {};
  const status = String(payment.status || '').toLowerCase();
  if (payment.paid === true || paidStatuses.has(status)) return 'paid';
  if (failedStatuses.has(status)) return 'failed';
  return 'pending';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const orderNumber = String(req.query?.order || '').trim();
  const storeId = String(req.query?.storeId || '').trim();
  const returnToken = String(req.headers['x-checkout-return-token'] || '');
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderNumber) || storeId.includes('/') || storeId.length > 150) {
    return res.status(400).json({ error: 'Order reference or store is invalid.' });
  }

  try {
    const app = admin();
    const authorization = String(req.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    let uid = '';
    if (token) {
      try { uid = (await app.auth().verifyIdToken(token)).uid; }
      catch (_) { return res.status(401).json({ error: 'Authentication token is invalid.' }); }
    }

    const db = app.firestore();
    let snapshot = await db.collection('orders').doc(orderNumber).get();
    let order = snapshot.exists ? snapshot.data() || {} : null;
    if (!order) {
      snapshot = await db.collection('pendingOrders').doc(orderNumber).get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Order not found.' });
      order = snapshot.data() || {};
    }

    if (String(order.payment?.method || '').toLowerCase() !== 'visa') {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (String(order.storeId || '') !== storeId) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const ownerUid = String(order.userId || 'guest');
    if (ownerUid !== 'guest' && uid !== ownerUid) {
      return res.status(403).json({ error: 'This order belongs to another account.' });
    }
    if (ownerUid === 'guest') {
      const storedHash = String(order.returnTokenHash || '');
      const submittedHash = /^[a-f0-9]{64}$/.test(returnToken)
        ? crypto.createHash('sha256').update(returnToken).digest('hex')
        : '';
      const hashMatches = /^[a-f0-9]{64}$/.test(storedHash) && !!submittedHash
        && crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(submittedHash, 'hex'));
      if (!hashMatches) {
        return res.status(403).json({ error: 'Payment return token is invalid.' });
      }
    }
    return res.status(200).json({ status: statusOf(order), orderNumber });
  } catch (error) {
    console.error('[XPay checkout status]', error);
    return res.status(500).json({ error: 'Could not check the payment status.' });
  }
};
