const { admin } = require('./_lib/firestore');

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed.');

  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const orderId = String(req.body?.orderId || '').trim();
  if (!token) return sendError(res, 401, 'سجّل الدخول مرة أخرى لإلغاء الطلب.');
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderId)) return sendError(res, 400, 'رقم الطلب غير صالح.');

  try {
    const app = admin();
    let user;
    try {
      user = await app.auth().verifyIdToken(token);
    } catch (error) {
      return sendError(res, 401, 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
    }
    const db = app.firestore();
    const orderRef = db.collection('orders').doc(orderId);
    const timestamp = app.firestore.FieldValue.serverTimestamp();
    let alreadyCancelled = false;

    await db.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) throw Object.assign(new Error('الطلب غير موجود.'), { statusCode: 404 });
      const order = orderSnapshot.data() || {};
      const emailMatches = user.email && String(order.customer?.email || '').trim().toLowerCase() === String(user.email).trim().toLowerCase();
      if (order.userId !== user.uid && !emailMatches) {
        throw Object.assign(new Error('ليس لديك صلاحية إلغاء هذا الطلب.'), { statusCode: 403 });
      }
      if (order.status === 'cancelled') {
        alreadyCancelled = true;
        return;
      }
      if (!['pending', 'confirmed'].includes(String(order.status || 'pending').toLowerCase())) {
        throw Object.assign(new Error('لا يمكن إلغاء الطلب بعد بدء الشحن أو إتمامه.'), { statusCode: 409 });
      }
      const payment = order.payment || {};
      const paymentStatus = String(payment.status || '').toLowerCase();
      if (String(payment.method || '').toLowerCase() === 'visa'
        && (payment.paid === true || ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(paymentStatus))) {
        throw Object.assign(new Error('الطلب مدفوع إلكترونيًا. تواصل مع خدمة العملاء لطلب الإلغاء والاسترداد.'), { statusCode: 409 });
      }

      const storeIds = [...new Set((Array.isArray(order.items) ? order.items : [])
        .map(item => String(item?.storeId || '').trim())
        .filter(storeId => storeId && !storeId.includes('/') && storeId.length <= 150))];
      const childOrderId = String(order.orderNumber || orderId);
      const childRefs = storeIds.map(storeId => db.collection('shops').doc(storeId).collection('orders').doc(childOrderId));
      const childSnapshots = await Promise.all(childRefs.map(ref => transaction.get(ref)));
      for (const snapshot of childSnapshots) {
        if (!snapshot.exists) continue;
        const sellerStatus = String(snapshot.data()?.sellerStatus || 'new').toLowerCase();
        if (['shipped', 'delivered'].includes(sellerStatus)) {
          throw Object.assign(new Error('بدأ أحد المتاجر شحن الطلب، لذلك تعذر إلغاؤه.'), { statusCode: 409 });
        }
      }

      transaction.update(orderRef, {
        status: 'cancelled',
        cancellationReason: 'Cancelled by customer',
        cancelledBy: 'customer',
        cancelledAt: timestamp,
        updatedAt: timestamp
      });
      childRefs.forEach((ref, index) => {
        if (childSnapshots[index].exists) {
          transaction.update(ref, { sellerStatus: 'cancelled', updatedAt: timestamp });
        }
      });
    });

    return res.status(200).json({ cancelled: true, alreadyCancelled });
  } catch (error) {
    if (error?.statusCode) return sendError(res, error.statusCode, error.message);
    console.error('[cancel-order]', error);
    return sendError(res, 500, 'تعذر إلغاء الطلب الآن. حاول مرة أخرى.');
  }
};
