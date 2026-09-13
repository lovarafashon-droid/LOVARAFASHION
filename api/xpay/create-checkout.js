const { findOrderByNumber, orderTotal } = require('../_lib/firestore');

const required = ['XPAY_CHECKOUT_URL', 'XPAY_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) return res.status(503).json({ error: 'Payment service is not configured on the server.', missing });

  const orderNumber = String((req.body || {}).orderNumber || '').trim();
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required.' });

  try {
    const order = await findOrderByNumber(orderNumber);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const amount = orderTotal(order.data);
    if (!amount) return res.status(422).json({ error: 'Order total is invalid.' });
    const currentStatus = String(order.data.payment?.status || '').toLowerCase();
    if (['paid', 'succeeded', 'completed'].includes(currentStatus)) return res.status(409).json({ error: 'This order is already paid.' });

    const origin = process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    const payload = {
      afterCompletion: {
        type: 'redirect',
        redirect: { url: `${origin}/checkout.html?payment=return&order=${encodeURIComponent(orderNumber)}` }
      },
      lineItems: [{
        priceData: {
          currency: process.env.XPAY_CURRENCY || 'EGP',
          unitAmount: Math.round(amount * 100),
          productData: { name: `LOVARA order ${orderNumber}` }
        },
        quantity: 1
      }],
      metadata: { orderNumber }
    };
    const response = await fetch(process.env.XPAY_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XPAY_API_KEY}`, ...(process.env.XPAY_MERCHANT_ID ? { 'X-Merchant-Id': process.env.XPAY_MERCHANT_ID } : {}) },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.error?.message || data.message || data.error || data.code;
      return res.status(502).json({ error: 'XPay rejected the checkout request.', ...(detail ? { detail: String(detail) } : {}) });
    }
    const redirectUrl = data.checkout_url || data.payment_url || data.redirect_url || data.url;
    if (!redirectUrl) return res.status(502).json({ error: 'XPay response did not include a checkout URL.' });

    const reference = String(data.reference || orderNumber);
    await order.ref.update({ payment: { ...(order.data.payment || {}), method: 'visa', status: 'awaiting_payment', checkoutReference: reference }, updatedAt: new Date() });
    return res.status(200).json({ redirectUrl, reference });
  } catch (error) {
    console.error('[XPay create-checkout]', error);
    return res.status(502).json({ error: 'Could not create the payment checkout.' });
  }
};
