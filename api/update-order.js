const { admin } = require('./_lib/firestore');
const { canonicalizeCheckoutOrder, buildPartnerOrderRecords } = require('./_lib/partner-orders');

function sendError(res, status, message) { return res.status(status).json({ error: message }); }
function millis(value) { return value?.toMillis ? value.toMillis() : Number(value) || 0; }
function isPaidPayment(payment = {}) {
  return payment.paid === true || ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(String(payment.status || '').toLowerCase());
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed.');
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const orderId = String(req.body?.orderId || '').trim();
  const edits = req.body?.items;
  if (!token) return sendError(res, 401, 'سجّل الدخول مرة أخرى لتعديل الطلب.');
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderId)) return sendError(res, 400, 'رقم الطلب غير صالح.');
  if (!Array.isArray(edits) || !edits.length || edits.length > 60) return sendError(res, 400, 'تفاصيل التعديل غير صالحة.');

  try {
    const app = admin();
    let user;
    try { user = await app.auth().verifyIdToken(token); }
    catch (_) { return sendError(res, 401, 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.'); }
    const db = app.firestore();
    const orderRef = db.collection('orders').doc(orderId);
    const initialSnapshot = await orderRef.get();
    if (!initialSnapshot.exists) return sendError(res, 404, 'الطلب غير موجود.');
    const initialOrder = initialSnapshot.data() || {};
    const emailMatches = user.email_verified === true && user.email
      && String(initialOrder.customer?.email || '').trim().toLowerCase() === String(user.email).trim().toLowerCase();
    if (initialOrder.userId !== user.uid && !emailMatches) return sendError(res, 403, 'ليس لديك صلاحية تعديل هذا الطلب.');
    if (String(initialOrder.payment?.method || '').toLowerCase() !== 'cod' || isPaidPayment(initialOrder.payment)) {
      return sendError(res, 409, 'تعديل الطلبات المدفوعة إلكترونيًا غير متاح. تواصل مع خدمة العملاء للمساعدة.');
    }
    if (String(initialOrder.status || 'pending').toLowerCase() !== 'pending') {
      return sendError(res, 409, 'لا يمكن تعديل الطلب بعد بدء مراجعته أو تجهيزه.');
    }

    const originalItems = Array.isArray(initialOrder.items) ? initialOrder.items : [];
    if (edits.length !== originalItems.length) return sendError(res, 400, 'أرسلي تفاصيل كل منتجات الطلب قبل حفظ التعديل.');
    const seenIndexes = new Set();
    const proposedItems = [];
    const variantCache = new Map();
    const catalogReadSet = new Map();
    for (const edit of edits) {
      const index = Number(edit?.itemIndex);
      if (!Number.isInteger(index) || index < 0 || index >= originalItems.length || seenIndexes.has(index)) {
        return sendError(res, 400, 'أحد المنتجات في التعديل غير صالح.');
      }
      seenIndexes.add(index);
      const original = originalItems[index] || {};
      const quantity = Math.floor(Number(edit.quantity));
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > 99) return sendError(res, 422, 'الكمية يجب أن تكون من صفر إلى 99.');
      if (!quantity) continue;
      const productId = String(original.productId || original.id || '').trim();
      const storeId = String(original.storeId || '').trim();
      if (!productId || productId.includes('/') || productId.length > 150 || (storeId && (storeId.includes('/') || storeId.length > 150))) {
        return sendError(res, 422, 'بيانات أحد المنتجات غير صالحة.');
      }
      const catalogKey = `${storeId || 'lovara'}:${productId}`;
      let catalogProduct = variantCache.get(catalogKey);
      if (!catalogProduct) {
        const productRef = storeId
          ? db.collection('shops').doc(storeId).collection('products').doc(productId)
          : db.collection('products').doc(productId);
        const productSnapshot = await productRef.get();
        if (!productSnapshot.exists) return sendError(res, 409, 'أحد المنتجات لم يعد متاحًا. حدّث صفحة الطلبات وحاول مرة أخرى.');
        catalogProduct = productSnapshot.data() || {};
        variantCache.set(catalogKey, catalogProduct);
        catalogReadSet.set(productRef.path, { ref: productRef, snapshot: productSnapshot, kind: 'product' });
        if (storeId) {
          const shopRef = db.collection('shops').doc(storeId);
          const shopSnapshot = await shopRef.get();
          if (!shopSnapshot.exists) return sendError(res, 409, 'المتجر المرتبط بأحد المنتجات لم يعد متاحًا.');
          catalogReadSet.set(shopRef.path, { ref: shopRef, snapshot: shopSnapshot, kind: 'shop' });
        }
      }
      const availableColors = Array.isArray(catalogProduct.colors)
        ? [...new Set(catalogProduct.colors.map(value => String(value || '').trim()).filter(Boolean))]
        : [];
      let color;
      if (availableColors.length) {
        color = Array.isArray(edit.colors) ? edit.colors.map(value => String(value || '').trim()) : [];
        if (color.length !== quantity || color.some(value => !value || value.length > 80)) {
          return sendError(res, 422, 'اختاري لونًا لكل قطعة قبل حفظ التعديل.');
        }
      } else {
        const oldColor = Array.isArray(original.color) ? (original.color[0] || '-') : (original.color || '-');
        color = String(edit.color ?? oldColor).trim();
      }
      const availableSizes = Array.isArray(catalogProduct.sizes)
        ? [...new Set(catalogProduct.sizes.map(value => String(value || '').trim()).filter(Boolean))]
        : [];
      const requestedSize = String(edit.size ?? original.size ?? '-').trim();
      if (requestedSize.length > 80 || (!Array.isArray(color) && color.length > 80)) {
        return sendError(res, 422, 'خيار المنتج غير صالح.');
      }
      if (availableSizes.length && !availableSizes.includes(requestedSize)) {
        return sendError(res, 422, 'اختاري مقاسًا متاحًا لهذا المنتج.');
      }
      proposedItems.push({
        itemIndex: index,
        productId,
        id: productId,
        ...(storeId ? { storeId } : {}),
        quantity, qty: quantity,
        size: requestedSize,
        color,
        price: 0,
        pricingUnit: original.pricingUnit === 'dozen' ? 'dozen' : 'piece'
      });
    }
    if (!proposedItems.length) return sendError(res, 422, 'احتفظ بمنتج واحد على الأقل في الطلب.');

    const canonicalizedAt = Date.now();
    const canonical = await canonicalizeCheckoutOrder({
      items: proposedItems,
      customer: initialOrder.customer || {},
      payment: initialOrder.payment || { method: 'cod' },
      totals: {},
      promoCode: initialOrder.promoCode || '',
      promoId: initialOrder.promoId || '',
      orderNumber: initialOrder.orderNumber || orderId,
      userId: initialOrder.userId || user.uid
    }, db, { recalculateTotals: true, useCanonicalPrices: true });

    const updatedOrder = {
      ...initialOrder,
      items: canonical.items,
      totals: canonical.totals,
      profit: canonical.profit,
      employeeId: canonical.employeeId,
      employeeDiscount: canonical.employeeDiscount,
      employeeCommission: canonical.employeeCommission,
      promoCode: canonical.promoCode,
      promoId: canonical.promoId
    };
    const partnerRecords = buildPartnerOrderRecords(updatedOrder, orderId, db);
    const nextShopIds = new Set(partnerRecords.map(record => record.ref.parent.parent.id));
    const oldShopIds = [...new Set(originalItems.map(item => String(item?.storeId || '').trim()).filter(id => id && !id.includes('/') && id.length <= 150))];
    const shopIds = [...new Set([...oldShopIds, ...nextShopIds])];
    const childOrderId = String(updatedOrder.orderNumber || orderId);
    const childRefs = shopIds.map(shopId => db.collection('shops').doc(shopId).collection('orders').doc(childOrderId));
    const recordByShop = new Map(partnerRecords.map(record => [record.ref.parent.parent.id, record]));
    const timestamp = app.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async transaction => {
      const currentSnapshot = await transaction.get(orderRef);
      if (!currentSnapshot.exists) throw Object.assign(new Error('الطلب غير موجود.'), { statusCode: 404 });
      if (millis(currentSnapshot.updateTime) !== millis(initialSnapshot.updateTime)) {
        throw Object.assign(new Error('تم تحديث الطلب في جهاز آخر. حدّث الصفحة ثم أعد المحاولة.'), { statusCode: 409 });
      }
      const current = currentSnapshot.data() || {};
      const ownerMatches = current.userId === user.uid
        || (user.email_verified === true && user.email
          && String(current.customer?.email || '').trim().toLowerCase() === String(user.email).trim().toLowerCase());
      if (!ownerMatches || String(current.payment?.method || '').toLowerCase() !== 'cod'
        || String(current.status || 'pending').toLowerCase() !== 'pending'
        || isPaidPayment(current.payment)) {
        throw Object.assign(new Error('لم يعد هذا الطلب مؤهلًا للتعديل.'), { statusCode: 409 });
      }
      const catalogCurrentSnapshots = await Promise.all([...catalogReadSet.values()].map(entry => transaction.get(entry.ref)));
      [...catalogReadSet.values()].forEach((entry, index) => {
        const currentCatalog = catalogCurrentSnapshots[index];
        if (!currentCatalog.exists || millis(currentCatalog.updateTime) !== millis(entry.snapshot.updateTime)) {
          throw Object.assign(new Error('تغيرت بيانات المنتج أو المتجر أثناء تعديل الطلب. حدّث الصفحة وحاول مرة أخرى.'), { statusCode: 409 });
        }
        if (entry.kind === 'shop') {
          const shop = currentCatalog.data() || {};
          const expiryValue = shop.expiresAt;
          const expiresAt = expiryValue?.toMillis ? expiryValue.toMillis()
            : expiryValue?.toDate ? expiryValue.toDate().getTime() : new Date(expiryValue || 0).getTime();
          if (shop.active !== true || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            throw Object.assign(new Error('المتجر المرتبط بهذا الطلب متوقف أو انتهى اشتراكه.'), { statusCode: 409 });
          }
        } else {
          const product = currentCatalog.data() || {};
          const salePrice = Number(product.salePrice) || 0;
          const saleEndsAt = product.saleEndsAt?.toMillis ? product.saleEndsAt.toMillis()
            : product.saleEndsAt?.toDate ? product.saleEndsAt.toDate().getTime() : Number(product.saleEndsAt) || 0;
          if (salePrice > 0 && saleEndsAt > canonicalizedAt && saleEndsAt <= Date.now()) {
            throw Object.assign(new Error('انتهى عرض أحد المنتجات أثناء تعديل الطلب. حدّث الصفحة وحاول مرة أخرى.'), { statusCode: 409 });
          }
        }
      });
      const childSnapshots = await Promise.all(childRefs.map(ref => transaction.get(ref)));
      for (const snapshot of childSnapshots) {
        if (!snapshot.exists) continue;
        const sellerStatus = String(snapshot.data()?.sellerStatus || 'new').toLowerCase();
        if (sellerStatus !== 'new') {
          throw Object.assign(new Error('بدأ أحد المتاجر تجهيز الطلب، لذلك لا يمكن تعديله.'), { statusCode: 409 });
        }
      }
      transaction.update(orderRef, {
        items: canonical.items,
        totals: canonical.totals,
        profit: canonical.profit,
        employeeId: canonical.employeeId,
        employeeDiscount: canonical.employeeDiscount,
        employeeCommission: canonical.employeeCommission,
        promoCode: canonical.promoCode,
        promoId: canonical.promoId,
        updatedAt: timestamp
      });
      childSnapshots.forEach((snapshot, index) => {
        const shopId = shopIds[index];
        const record = recordByShop.get(shopId);
        if (!record) {
          if (snapshot.exists) transaction.set(childRefs[index], {
            sellerStatus: 'cancelled', status: 'cancelled', removedByCustomer: true,
            cancellationReason: 'أزال العميل منتجات هذا المتجر أثناء تعديل الطلب.',
            cancelledBy: 'customer', cancelledAt: timestamp,
            items: [], totals: { subtotal: 'EGP 0.00', shipping: 'EGP 0.00', discount: 'EGP 0.00', total: 'EGP 0.00' },
            updatedAt: timestamp
          }, { merge: true });
          return;
        }
        const data = { ...record.data };
        if (snapshot.exists) {
          const oldData = snapshot.data() || {};
          if (oldData.createdAt) delete data.createdAt;
          if (oldData.sellerStatus) data.sellerStatus = oldData.sellerStatus;
        }
        data.updatedAt = timestamp;
        transaction.set(childRefs[index], data, { merge: true });
      });
    });

    return res.status(200).json({ updated: true, totals: canonical.totals, items: canonical.items });
  } catch (error) {
    if (error?.statusCode) return sendError(res, error.statusCode, error.message);
    if (error?.name === 'PartnerOrderError') return sendError(res, error.statusCode || 422, error.message);
    console.error('[update-order]', error);
    return sendError(res, 500, 'تعذر تعديل الطلب الآن. حاول مرة أخرى.');
  }
};
