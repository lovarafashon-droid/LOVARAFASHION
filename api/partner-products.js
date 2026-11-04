'use strict';

const { admin } = require('./_lib/firestore');
const { getPartnerPlan } = require('./_lib/partner-plans');

const ALLOWED_STORE_ID = /^[a-z0-9-]{1,60}$/i;
const MAX_PRICE = 10000000;

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function asDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value || 0);
}

function cleanProduct(body, uid, current = {}) {
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  const description = String(body.description || '').trim();
  const imageUrl = String(body.imageUrl || '').trim();
  const price = Number(body.price);
  const salePrice = Number(body.salePrice || 0);
  const saleEndsAt = Number(body.saleEndsAt || 0);
  if (name.length < 1 || name.length > 120) throw Object.assign(new Error('اسم المنتج يجب أن يكون من 1 إلى 120 حرفًا.'), { statusCode: 400 });
  if (category.length > 60 || description.length > 1000) throw Object.assign(new Error('بيانات المنتج تتجاوز الحد المسموح.'), { statusCode: 400 });
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) throw Object.assign(new Error('سعر المنتج غير صالح.'), { statusCode: 400 });
  if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > MAX_PRICE) throw Object.assign(new Error('سعر الخصم غير صالح.'), { statusCode: 400 });
  if (salePrice > 0 && (salePrice >= price || !Number.isFinite(saleEndsAt) || saleEndsAt <= Date.now())) {
    throw Object.assign(new Error('الخصم يتطلب سعرًا أقل من السعر الأصلي وموعد انتهاء مستقبلي.'), { statusCode: 400 });
  }
  if (salePrice === 0 && saleEndsAt !== 0) throw Object.assign(new Error('لا يمكن تحديد نهاية عرض من دون سعر خصم.'), { statusCode: 400 });
  if (!imageUrl.startsWith('https://ik.imagekit.io/')) throw Object.assign(new Error('صورة المنتج غير صالحة.'), { statusCode: 400 });
  return {
    name, category, price, salePrice, saleEndsAt, description, imageUrl,
    ownerUid: uid,
    createdAt: current.createdAt || null,
    updatedAt: null
  };
}

function validateStore(shop, uid) {
  const expiry = asDate(shop.expiresAt);
  if (shop.ownerUid !== uid) throw Object.assign(new Error('لا تملكين صلاحية إدارة هذا المتجر.'), { statusCode: 403 });
  if (shop.active !== true || !Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
    throw Object.assign(new Error('المتجر غير نشط أو انتهى اشتراكه.'), { statusCode: 403 });
  }
  const plan = getPartnerPlan(shop.subscriptionPlan);
  if (!plan || plan.productLimit < 1) throw Object.assign(new Error('تعذر التحقق من باقة المتجر. تواصلي مع إدارة LOVARA.'), { statusCode: 403 });
  return plan;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return sendError(res, 405, 'Method not allowed.');
  }
  res.setHeader?.('Cache-Control', 'no-store');
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return sendError(res, 401, 'سجّلي الدخول أولاً.');
  const storeId = String(req.body?.storeId || '').trim();
  const action = String(req.body?.action || '').trim();
  if (!ALLOWED_STORE_ID.test(storeId)) return sendError(res, 400, 'معرّف المتجر غير صالح.');
  if (!['create', 'update', 'delete', 'update-settings'].includes(action)) return sendError(res, 400, 'عملية غير مدعومة.');

  try {
    const app = admin();
    let decoded;
    try { decoded = await app.auth().verifyIdToken(token); }
    catch (_) { return sendError(res, 401, 'انتهت جلسة الدخول. سجّلي الدخول مرة أخرى.'); }
    const uid = decoded.uid;
    const db = app.firestore();
    const shopRef = db.collection('shops').doc(storeId);
    const productsRef = shopRef.collection('products');
    const productId = String(req.body?.productId || '').trim();
    if (['update', 'delete'].includes(action) && (!productId || productId.includes('/') || productId.length > 150)) {
      return sendError(res, 400, 'معرّف المنتج غير صالح.');
    }
    const productRef = productId ? productsRef.doc(productId) : productsRef.doc();

    if (action === 'update-settings') {
      const patch = req.body?.settings;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return sendError(res, 400, 'إعدادات المتجر غير صالحة.');
      const allowedKeys = ['themeColor', 'announcementText', 'heroTitle', 'heroDescription'];
      if (!Object.keys(patch).length || Object.keys(patch).some(key => !allowedKeys.includes(key))) return sendError(res, 400, 'إعداد غير مدعوم.');
      const color = String(patch.themeColor || '').trim();
      const announcementText = String(patch.announcementText ?? '').trim();
      const heroTitle = String(patch.heroTitle ?? '').trim();
      const heroDescription = String(patch.heroDescription ?? '').trim();
      if (patch.themeColor !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) return sendError(res, 400, 'اختاري لونًا صالحًا.');
      if (patch.announcementText !== undefined && announcementText.length > 80) return sendError(res, 400, 'رسالة المتجر لا تتجاوز 80 حرفًا.');
      if (patch.heroTitle !== undefined && heroTitle.length > 80) return sendError(res, 400, 'عنوان الواجهة لا يتجاوز 80 حرفًا.');
      if (patch.heroDescription !== undefined && heroDescription.length > 240) return sendError(res, 400, 'وصف الواجهة لا يتجاوز 240 حرفًا.');
      await db.runTransaction(async transaction => {
        const shopSnap = await transaction.get(shopRef);
        if (!shopSnap.exists) throw Object.assign(new Error('المتجر غير موجود.'), { statusCode: 404 });
        const plan = validateStore(shopSnap.data() || {}, uid);
        if ((patch.themeColor !== undefined || patch.announcementText !== undefined) && !plan.storeBranding) {
          throw Object.assign(new Error('تخصيص اللون ورسالة المتجر متاح في باقة 3 أشهر أو 6 أشهر.'), { statusCode: 403 });
        }
        if ((patch.heroTitle !== undefined || patch.heroDescription !== undefined) && !plan.advancedStorefront) {
          throw Object.assign(new Error('تخصيص واجهة المتجر متاح في باقة 6 أشهر.'), { statusCode: 403 });
        }
        const safePatch = { updatedAt: app.firestore.FieldValue.serverTimestamp() };
        if (patch.themeColor !== undefined) safePatch.themeColor = color;
        if (patch.announcementText !== undefined) safePatch.announcementText = announcementText;
        if (patch.heroTitle !== undefined) safePatch.heroTitle = heroTitle;
        if (patch.heroDescription !== undefined) safePatch.heroDescription = heroDescription;
        transaction.update(shopRef, safePatch);
      });
      return res.status(200).json({ success: true });
    }

    const bodyProduct = req.body?.product;
    let sanitized;
    if (action !== 'delete') {
      if (!bodyProduct || typeof bodyProduct !== 'object' || Array.isArray(bodyProduct)) return sendError(res, 400, 'بيانات المنتج مطلوبة.');
      sanitized = cleanProduct(bodyProduct, uid, {});
    }

    let resultCount = 0;
    await db.runTransaction(async transaction => {
      const shopSnap = await transaction.get(shopRef);
      if (!shopSnap.exists) throw Object.assign(new Error('المتجر غير موجود.'), { statusCode: 404 });
      const shop = shopSnap.data() || {};
      const plan = validateStore(shop, uid);
      let existingProduct = null;
      if (action === 'update' || action === 'delete') {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) throw Object.assign(new Error('المنتج غير موجود.'), { statusCode: 404 });
        existingProduct = productSnap.data() || {};
        if (existingProduct.ownerUid !== uid) throw Object.assign(new Error('لا تملكين صلاحية تعديل هذا المنتج.'), { statusCode: 403 });
      }
      if (action === 'create' && sanitized.salePrice > 0 && !plan.discounts) {
        throw Object.assign(new Error('إنشاء العروض والخصومات متاح في باقة 6 أشهر فقط.'), { statusCode: 403 });
      }
      if (action === 'update' && sanitized.salePrice > 0 && !plan.discounts) {
        throw Object.assign(new Error('إدارة العروض والخصومات متاحة في باقة 6 أشهر فقط.'), { statusCode: 403 });
      }
      let productCount = Number.isInteger(shop.productCount) && shop.productCount >= 0 ? shop.productCount : null;
      if (productCount === null) {
        const existing = await transaction.get(productsRef);
        productCount = existing.size;
      }
      if (action === 'create') {
        if (productCount >= plan.productLimit) {
          throw Object.assign(new Error(`وصلتِ إلى حد باقتك وهو ${plan.productLimit} منتجًا. احذفي منتجًا أو غيّري الباقة.`), { statusCode: 409 });
        }
        transaction.create(productRef, {
          ...sanitized,
          createdAt: app.firestore.FieldValue.serverTimestamp(),
          updatedAt: app.firestore.FieldValue.serverTimestamp()
        });
        productCount += 1;
      } else if (action === 'update') {
        transaction.update(productRef, {
          ...sanitized,
          ownerUid: uid,
          createdAt: existingProduct.createdAt || app.firestore.FieldValue.serverTimestamp(),
          updatedAt: app.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.delete(productRef);
        productCount = Math.max(0, productCount - 1);
      }
      transaction.set(shopRef, { productCount, updatedAt: app.firestore.FieldValue.serverTimestamp() }, { merge: true });
      resultCount = productCount;
    });
    return res.status(200).json({ success: true, productId: productRef.id, productCount: resultCount });
  } catch (error) {
    if (error?.statusCode) return sendError(res, error.statusCode, error.message);
    console.error('[LOVARA partner products]', error);
    return sendError(res, 500, 'تعذر حفظ التغيير. حاولي مرة أخرى.');
  }
};
