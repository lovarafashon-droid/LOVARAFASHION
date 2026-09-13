const required = ['XPAY_CHECKOUT_URL', 'XPAY_API_KEY'];

function missingConfig() {
  return required.filter((key) => !process.env[key]);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const missing = missingConfig();
  if (missing.length) {
    return res.status(503).json({
      error: 'XPay is not configured on the server yet.',
      missing
    });
  }

  const body = req.body || {};
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !body.orderNumber) {
    return res.status(400).json({ error: 'A valid amount and orderNumber are required.' });
  }

  const origin = process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const payload = {
    amount: amount.toFixed(2),
    currency: process.env.XPAY_CURRENCY || 'EGP',
    reference: String(body.orderNumber),
    customer: body.customer || {},
    callback_url: `${origin}/api/xpay/webhook`,
    return_url: `${origin}/checkout.html?payment=return&order=${encodeURIComponent(body.orderNumber)}`,
    metadata: { orderNumber: String(body.orderNumber) }
  };

  try {
    const response = await fetch(process.env.XPAY_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XPAY_API_KEY}`,
        ...(process.env.XPAY_MERCHANT_ID ? { 'X-Merchant-Id': process.env.XPAY_MERCHANT_ID } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: 'XPay rejected the checkout request.', details: data });

    const redirectUrl = data.checkout_url || data.payment_url || data.redirect_url || data.url;
    if (!redirectUrl) return res.status(502).json({ error: 'XPay response did not include a checkout URL.' });
    return res.status(200).json({ redirectUrl, reference: data.reference || body.orderNumber });
  } catch (error) {
    return res.status(502).json({ error: 'Could not reach XPay.', details: error.message });
  }
};
