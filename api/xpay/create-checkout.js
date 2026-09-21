const { orderTotal, admin } = require('../_lib/firestore');

const required = ['XPAY_CHECKOUT_URL', 'XPAY_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) return res.status(503).json({ error: 'Payment service is not configured on the server.', missing });

  const body = req.body || {};
  const orderNumber = String(body.orderNumber || '').trim();
  const submittedOrder = body.orderData || null;
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required.' });

  try {
    const orderData = submittedOrder;
    if (!orderData) return res.status(404).json({ error: 'Order not found.' });
    const amount = orderTotal(orderData);
    if (!amount) return res.status(422).json({ error: 'Order total is invalid.' });
    const currentStatus = String(orderData.payment?.status || '').toLowerCase();
    if (['paid', 'succeeded', 'completed'].includes(currentStatus)) return res.status(409).json({ error: 'This order is already paid.' });

    // Keep a server-side pending copy before payment starts. If the browser is
    // closed after a successful card charge, XPay's webhook can still promote
    // this record into the orders collection.
    const pendingOrder = {
      ...orderData,
      orderNumber,
      date: orderData.date || new Date().toISOString(),
      payment: { ...(orderData.payment || {}), method: 'visa', status: 'awaiting_payment' },
      updatedAt: admin().firestore.FieldValue.serverTimestamp()
    };
    await admin().firestore().collection('pendingOrders').doc(orderNumber).set(pendingOrder, { merge: true });

    const origin = process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    const payload = {
      uiMode: 'custom',
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
    if (!data.clientSecret) return res.status(502).json({ error: 'XPay response did not include a client secret.' });

    // Do not create an order here. This endpoint only creates a temporary
    // XPay checkout session. The client saves the order after XPay confirms
    // the payment, so unpaid/abandoned checkouts never appear as orders.
    const reference = String(data.reference || orderNumber);
    return res.status(200).json({ clientSecret: data.clientSecret, sessionId: data.id || null, reference });
  } catch (error) {
    console.error('[XPay create-checkout]', error);
    return res.status(502).json({ error: 'Could not create the payment checkout.' });
  }
};
