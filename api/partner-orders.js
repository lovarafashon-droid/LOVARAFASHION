const crypto = require('crypto');
const { admin } = require('./_lib/firestore');
const {
  PartnerOrderError,
  canonicalizeCheckoutOrder,
  buildPartnerOrderRecords
} = require('./_lib/partner-orders');

function sendError(res, error) {
  const status = error?.statusCode || 500;
  if (status >= 500) console.error('[checkout-order]', error);
  return res.status(status).json({
    error: status >= 500 ? 'تعذر حفظ الطلب حاليًا. حاول مرة أخرى.' : (error.message || 'بيانات الطلب غير صالحة.')
  });
}

function validOrderNumber(value) {
  return /^LOV-[A-Z0-9]{5,40}$/.test(String(value || ''));
}

function orderFingerprint(orderData) {
  const customer = orderData.customer || {};
  const fingerprintData = {
    userId: String(orderData.userId || 'guest'),
    paymentMethod: String(orderData.payment?.method || ''),
    customer: Object.fromEntries(['firstName', 'lastName', 'email', 'phone', 'phone2', 'address', 'city', 'governorate', 'notes']
      .map(key => [key, String(customer[key] || '')])),
    items: orderData.items.map(item => ({
      productId: String(item.productId || ''),
      storeId: String(item.storeId || ''),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
      pricingUnit: String(item.pricingUnit || 'piece'),
      size: item.size ?? '-',
      color: item.color ?? '-'
    })),
    totals: {
      subtotal: orderData.totals?.subtotal || '',
      shipping: orderData.totals?.shipping || '',
      discount: orderData.totals?.discount || '',
      total: orderData.totals?.total || ''
    },
    promoCode: String(orderData.promoCode || '')
  };
  return crypto.createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const submitted = req.body?.orderData;
  const orderNumber = String(submitted?.orderNumber || '').trim();
  if (!submitted || !validOrderNumber(orderNumber)) {
    return res.status(400).json({ error: 'بيانات الطلب أو رقم الطلب غير صالح.' });
  }
  if (String(submitted.payment?.method || '').toLowerCase() !== 'cod') {
    return res.status(400).json({ error: 'طريقة الدفع غير مدعومة لهذا المسار.' });
  }

  try {
    const adminApp = admin();
    let userId = 'guest';
    const authorization = String(req.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token) {
      const decoded = await adminApp.auth().verifyIdToken(token);
      userId = decoded.uid;
      if (submitted.userId && submitted.userId !== userId) {
        throw new PartnerOrderError('حساب المستخدم لا يطابق الطلب.', 403);
      }
    } else if (submitted.userId && submitted.userId !== 'guest') {
      throw new PartnerOrderError('سجّل الدخول مرة أخرى لإتمام الطلب.', 401);
    }

    const db = adminApp.firestore();
    const orderData = await canonicalizeCheckoutOrder({
      ...submitted,
      orderNumber,
      userId,
      date: new Date().toISOString(),
      status: 'pending',
      confirmationStatus: 'pending',
      payment: {
        ...(submitted.payment || {}),
        method: 'cod',
        status: 'cash_on_delivery',
        transactionId: ''
      }
    }, db);
    const orderRef = db.collection('orders').doc(orderNumber);
    const partnerOrders = buildPartnerOrderRecords(orderData, orderRef.id, db);
    const requestHash = orderFingerprint(orderData);
    const savedOrder = {
      ...orderData,
      status: 'pending',
      confirmationStatus: 'pending',
      requestHash,
      createdAt: adminApp.firestore.FieldValue.serverTimestamp(),
      updatedAt: adminApp.firestore.FieldValue.serverTimestamp()
    };

    let duplicate = false;
    await db.runTransaction(async transaction => {
      const [existing, childSnapshots] = await Promise.all([
        transaction.get(orderRef),
        Promise.all(partnerOrders.map(record => transaction.get(record.ref)))
      ]);
      if (existing.exists) {
        const prior = existing.data() || {};
        if (prior.payment?.method !== 'cod' || prior.requestHash !== requestHash) {
          throw new PartnerOrderError('رقم الطلب مستخدم بالفعل. أعد المحاولة من صفحة Checkout.', 409);
        }
        duplicate = true;
        partnerOrders.forEach((record, index) => {
          if (!childSnapshots[index].exists) transaction.set(record.ref, record.data);
        });
        return;
      }
      transaction.create(orderRef, savedOrder);
      partnerOrders.forEach(record => transaction.create(record.ref, record.data));
    });

    return res.status(200).json({ saved: true, duplicate, orderNumber });
  } catch (error) {
    return sendError(res, error);
  }
};
