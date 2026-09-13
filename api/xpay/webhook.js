const crypto = require('crypto');
const { findOrderByNumber, admin } = require('../_lib/firestore');

function isValidSignature(req) {
  const secret = process.env.XPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-xpay-signature'] || req.headers['x-webhook-signature'] || '';
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isValidSignature(req)) return res.status(401).json({ error: 'Invalid webhook signature.' });

  const event = req.body || {};
  const status = String(event.status || event.payment_status || '').toLowerCase();
  const orderNumber = event.orderNumber || event.reference || event.metadata?.orderNumber;
  if (!orderNumber) return res.status(400).json({ error: 'Missing order reference.' });

  const paid = ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(status);
  const failed = ['failed', 'cancelled', 'canceled', 'declined', 'expired'].includes(status);
  const transactionId = event.transaction_id || event.transactionId || event.id || null;
  try {
    const order = await findOrderByNumber(orderNumber);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const previous = order.data.payment || {};
    const nextStatus = paid ? 'paid' : failed ? 'failed' : 'payment_update';
    const update = {
      payment: { ...previous, status: nextStatus, providerStatus: status, paid, ...(transactionId ? { transactionId: String(transactionId) } : {}) },
      updatedAt: admin().firestore.FieldValue.serverTimestamp()
    };
    if (paid) update.payment.paidAt = admin().firestore.FieldValue.serverTimestamp();
    await order.ref.update(update);
    console.log(JSON.stringify({ source: 'xpay', orderNumber, status, paid, transactionId }));
    return res.status(200).json({ received: true, orderNumber, paid });
  } catch (error) {
    console.error('[XPay webhook]', error);
    return res.status(500).json({ error: 'Could not update the order.' });
  }
};
