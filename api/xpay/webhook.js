const crypto = require('crypto');

function isValidSignature(req) {
  const secret = process.env.XPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-xpay-signature'] || req.headers['x-webhook-signature'] || '';
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return provided && crypto.timingSafeEqual(Buffer.from(String(provided)), Buffer.from(expected));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isValidSignature(req)) return res.status(401).json({ error: 'Invalid webhook signature.' });

  const event = req.body || {};
  const status = String(event.status || event.payment_status || '').toLowerCase();
  const orderNumber = event.orderNumber || event.reference || event.metadata?.orderNumber;
  if (!orderNumber) return res.status(400).json({ error: 'Missing order reference.' });

  // XPay's exact success status names should be confirmed from the merchant docs.
  const paid = ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(status);
  console.log(JSON.stringify({ source: 'xpay', orderNumber, status, paid, transactionId: event.transaction_id || event.id || null }));

  // TODO: update Firestore here using Firebase Admin credentials stored only in env:
  // FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
  // Do not trust the browser redirect as proof of payment; trust this signed callback.
  return res.status(200).json({ received: true, orderNumber, paid });
};
