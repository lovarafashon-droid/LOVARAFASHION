const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const missing = ['XPAY_CHECKOUT_URL', 'XPAY_API_KEY'].filter(key => !process.env[key]);
  if (missing.length) return res.status(503).json({ error: 'بوابة الدفع غير مفعّلة حالياً.' });
  const storeName = String(req.body?.storeName || '').trim();
  if (storeName.length < 2 || storeName.length > 80) return res.status(400).json({ error: 'اسم المتجر مطلوب.' });

  const reference = `LOV-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const origin = String(process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`).replace(/\/+$/, '');
  const payload = {
    uiMode: 'custom',
    afterCompletion: { type: 'redirect', redirect: { url: `${origin}/partnership.html?payment=return&reference=${reference}` } },
    lineItems: [{ priceData: { currency: process.env.XPAY_CURRENCY || 'EGP', unitAmount: 5500, productData: { name: `اشتراك شراكة LOVARA - ${storeName}` } }, quantity: 1 }],
    metadata: { reference, storeName, type: 'partner_subscription' }
  };

  try {
    const response = await fetch(process.env.XPAY_CHECKOUT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XPAY_API_KEY}`, ...(process.env.XPAY_MERCHANT_ID ? { 'X-Merchant-Id': process.env.XPAY_MERCHANT_ID } : {}) }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.clientSecret) return res.status(502).json({ error: 'تعذر تجهيز بوابة الدفع.' });
    return res.status(200).json({ clientSecret: data.clientSecret, reference });
  } catch (error) {
    console.error('[XPAY partnership checkout]', error);
    return res.status(502).json({ error: 'تعذر الاتصال ببوابة الدفع.' });
  }
};
