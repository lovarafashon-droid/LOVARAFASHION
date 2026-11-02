const { admin } = require('./firestore');
const {
  canTransitionSellerStatus,
  normalizeSellerStatus,
  isPaidPayment,
  normalizeCancellationReason
} = require('./seller-order-status');

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = async function updateSellerOrderStatus(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'طريقة الطلب غير مدعومة.');

  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const orderId = String(req.body?.orderId || '').trim();
  const nextStatus = normalizeSellerStatus(req.body?.status);
  if (!token) return sendError(res, 401, 'سجّل الدخول مرة أخرى لتحديث الطلب.');
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderId)) return sendError(res, 400, 'رقم الطلب غير صالح.');
  if (!nextStatus) return sendError(res, 400, 'حالة الطلب غير صالحة.');

  const reason = nextStatus === 'cancelled' ? normalizeCancellationReason(req.body?.reason) : '';
  if (nextStatus === 'cancelled' && !reason) {
    return sendError(res, 422, 'اكتب سببًا واضحًا للإلغاء بين 5 و300 حرف.');
  }

  try {
    const app = admin();
    let user;
    try { user = await app.auth().verifyIdToken(token); }
    catch (_) { return sendError(res, 401, 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.'); }
    if (!user?.uid) return sendError(res, 401, 'تعذر التحقق من حسابك.');

    const db = app.firestore();
    const userSnapshot = await db.collection('users').doc(user.uid).get();
    const storeId = String(userSnapshot.data()?.storeId || '').trim();
    if (!userSnapshot.exists || !storeId || storeId.includes('/') || storeId.length > 150) {
      return sendError(res, 403, 'هذا الحساب غير مرتبط بمتجر شريك.');
    }

    const shopRef = db.collection('shops').doc(storeId);
    const shopSnapshot = await shopRef.get();
    if (!shopSnapshot.exists || String(shopSnapshot.data()?.ownerUid || '') !== user.uid) {
      return sendError(res, 403, 'ليس لديك صلاحية إدارة طلبات هذا المتجر.');
    }

    const childRef = shopRef.collection('orders').doc(orderId);
    const parentRef = db.collection('orders').doc(orderId);
    const timestamp = app.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async transaction => {
      const [currentShopSnapshot, childSnapshot, parentSnapshot] = await Promise.all([
        transaction.get(shopRef),
        transaction.get(childRef),
        transaction.get(parentRef)
      ]);
      if (!currentShopSnapshot.exists || String(currentShopSnapshot.data()?.ownerUid || '') !== user.uid) {
        throw Object.assign(new Error('لم تعد تملك صلاحية إدارة هذا المتجر.'), { statusCode: 403 });
      }
      if (!childSnapshot.exists || !parentSnapshot.exists) {
        throw Object.assign(new Error('الطلب غير موجود أو لم يعد مرتبطًا بهذا المتجر.'), { statusCode: 404 });
      }

      const child = childSnapshot.data() || {};
      const parent = parentSnapshot.data() || {};
      if (String(child.storeId || '') !== storeId
        || String(child.orderNumber || orderId) !== orderId
        || (child.parentOrderId && String(child.parentOrderId) !== parentSnapshot.id)
        || (parent.orderNumber && String(parent.orderNumber) !== orderId)) {
        throw Object.assign(new Error('ليس لديك صلاحية تحديث هذا الطلب.'), { statusCode: 403 });
      }

      const parentItems = Array.isArray(parent.items) ? parent.items : [];
      if (!parentItems.length || parentItems.some(item => String(item?.storeId || '').trim() !== storeId)) {
        throw Object.assign(new Error('هذا الطلب لا يخص متجرًا واحدًا فقط. تواصل مع إدارة LOVARA لمتابعته.'), { statusCode: 409 });
      }

      const currentStatus = normalizeSellerStatus(child.sellerStatus || child.status || 'new');
      if (!currentStatus || !canTransitionSellerStatus(currentStatus, nextStatus)) {
        throw Object.assign(new Error('لا يمكن نقل الطلب من حالته الحالية إلى الحالة المطلوبة.'), { statusCode: 409 });
      }
      const parentStatus = String(parent.status || 'pending').trim().toLowerCase();
      if (parentStatus === 'cancelled') {
        throw Object.assign(new Error('تم إلغاء هذا الطلب بالفعل.'), { statusCode: 409 });
      }

      const childUpdate = { sellerStatus: nextStatus, updatedAt: timestamp };
      const parentUpdate = { status: nextStatus, updatedAt: timestamp };
      if (nextStatus === 'cancelled') {
        const payment = parent.payment || child.payment || {};
        if (String(payment.method || '').toLowerCase() !== 'cod' || isPaidPayment(payment)) {
          throw Object.assign(new Error('لا يمكن إلغاء طلب مدفوع إلكترونيًا من لوحة المتجر. تواصل مع إدارة LOVARA للمساعدة.'), { statusCode: 409 });
        }
        if (!['pending', 'confirmed', 'preparing'].includes(parentStatus)) {
          throw Object.assign(new Error('لا يمكن إلغاء الطلب بعد بدء الشحن أو إتمامه.'), { statusCode: 409 });
        }
        Object.assign(childUpdate, { cancellationReason: reason, cancelledBy: 'seller', cancelledAt: timestamp });
        Object.assign(parentUpdate, {
          confirmationStatus: 'cancelled',
          cancellationReason: reason,
          cancelledBy: 'seller',
          cancelledAt: timestamp
        });
      } else if (nextStatus === 'confirmed') {
        Object.assign(parentUpdate, { confirmationStatus: 'confirmed', confirmedAt: timestamp });
      } else if (nextStatus === 'preparing') {
        parentUpdate.confirmationStatus = 'confirmed';
      } else if (nextStatus === 'shipped') {
        Object.assign(parentUpdate, { confirmationStatus: 'confirmed', shippedAt: timestamp });
      } else if (nextStatus === 'delivered') {
        Object.assign(parentUpdate, { confirmationStatus: 'confirmed', deliveredAt: timestamp });
      }

      transaction.update(childRef, childUpdate);
      transaction.update(parentRef, parentUpdate);
    });

    return res.status(200).json({ updated: true, orderId, status: nextStatus });
  } catch (error) {
    if (error?.statusCode) return sendError(res, error.statusCode, error.message);
    console.error('[update-partner-order-status]', error);
    return sendError(res, 500, 'تعذر تحديث الطلب الآن. حاول مرة أخرى.');
  }
};
