const { orderTotal, admin } = require('../_lib/firestore');
const { canonicalizeCheckoutOrder } = require('../_lib/partner-orders');

const required = ['XPAY_CHECKOUT_URL', 'XPAY_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) return res.status(503).json({ error: 'Payment service is not configured on the server.', missing });

  const submittedOrder = req.body?.orderData || null;
  const orderNumber = String(req.body?.orderNumber || '').trim();
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderNumber) || !submittedOrder) {
    return res.status(400).json({ error: 'Order data is invalid.' });
  }
  if (String(submittedOrder.orderNumber || '') !== orderNumber
    || String(submittedOrder.payment?.method || '').toLowerCase() !== 'visa') {
    return res.status(400).json({ error: 'Order reference or payment method is invalid.' });
  }

  try {
    const adminApp = admin();
    const authorization = String(req.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    let userId = 'guest';
    if (token) {
      const decoded = await adminApp.auth().verifyIdToken(token);
      userId = decoded.uid;
      if (submittedOrder.userId && submittedOrder.userId !== userId) {
        return res.status(403).json({ error: 'Account does not match this order.' });
      }
    } else if (submittedOrder.userId && submittedOrder.userId !== 'guest') {
      return res.status(401).json({ error: 'Please sign in again before paying.' });
    }

    const db = adminApp.firestore();
    const orderData = await canonicalizeCheckoutOrder({
      ...submittedOrder,
      orderNumber,
      userId,
      date: new Date().toISOString(),
      status: 'pending',
      confirmationStatus: 'pending',
      payment: {
        ...(submittedOrder.payment || {}),
        method: 'visa',
        status: 'awaiting_payment',
        transactionId: ''
      }
    }, db);
    const amount = orderTotal(orderData);
    if (!amount) return res.status(422).json({ error: 'Order total is invalid.' });
    const expectedAmountMinor = Math.round(amount * 100);
    const orderRef = db.collection('pendingOrders').doc(orderNumber);
    const pendingOrder = {
      ...orderData,
      orderNumber,
      status: 'pending',
      confirmationStatus: 'pending',
      payment: { ...orderData.payment, method: 'visa', status: 'awaiting_payment', expectedAmountMinor },
      createdAt: adminApp.firestore.FieldValue.serverTimestamp(),
      updatedAt: adminApp.firestore.FieldValue.serverTimestamp()
    };
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(orderRef);
      if (existing.exists) throw Object.assign(new Error('This payment session already exists. Refresh checkout to create a new one.'), { statusCode: 409 });
      transaction.create(orderRef, pendingOrder);
    });

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
          unitAmount: expectedAmountMinor,
          productData: { name: `LOVARA order ${orderNumber}` }
        },
        quantity: 1
      }],
      metadata: { orderNumber }
    };
    const response = await fetch(process.env.XPAY_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XPAY_API_KEY}`,
        ...(process.env.XPAY_MERCHANT_ID ? { 'X-Merchant-Id': process.env.XPAY_MERCHANT_ID } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.error?.message || data.message || data.error || data.code;
      return res.status(502).json({ error: 'XPay rejected the checkout request.', ...(detail ? { detail: String(detail) } : {}) });
    }
    if (!data.clientSecret) return res.status(502).json({ error: 'XPay response did not include a client secret.' });

    const reference = String(data.reference || orderNumber);
    await orderRef.set({
      payment: { ...pendingOrder.payment, sessionId: String(data.id || ''), providerReference: reference },
      updatedAt: adminApp.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return res.status(200).json({ clientSecret: data.clientSecret, sessionId: data.id || null, reference });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error?.code === 6 || error?.code === 'already-exists') return res.status(409).json({ error: 'This payment session already exists. Refresh checkout to create a new one.' });
    console.error('[XPay create-checkout]', error);
    return res.status(502).json({ error: 'Could not create the payment checkout.' });
  }
};
