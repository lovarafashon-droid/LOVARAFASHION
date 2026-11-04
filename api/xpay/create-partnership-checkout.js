'use strict';

const crypto = require('crypto');
const { admin } = require('../_lib/firestore');
const { getPartnerPlan } = require('../_lib/partner-plans');

const FIREBASE_REQUIRED = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const XPAY_REQUIRED = ['XPAY_API_KEY', 'XPAY_WEBHOOK_SECRET'];
const XPAY_CHECKOUT_URL = process.env.XPAY_CHECKOUT_URL || 'https://api.xpay.app/checkout/sessions';

function missingEnvironment(keys) {
  return keys.filter(key => !process.env[key]);
}

function isPaidStatus(status) {
  return ['paid', 'paid_manual'].includes(String(status || '').toLowerCase());
}

function isPendingRequest(request, uid) {
  return request && request.ownerUid === uid && request.status === 'pending'
    && typeof request.imageUrl === 'string' && request.imageUrl.startsWith('https://ik.imagekit.io/');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  res.setHeader?.('Cache-Control', 'no-store');

  const missingFirebase = missingEnvironment(FIREBASE_REQUIRED);
  if (missingFirebase.length) return res.status(503).json({ error: 'تعذر التحقق من حسابك حاليًا.' });

  const authorization = String(req.headers.authorization || '');
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'سجّلي الدخول إلى حساب LOVARA أولاً.' });

  const action = String(req.body?.action || 'create-checkout');
  const plan = getPartnerPlan(req.body?.planId);
  if (!plan) return res.status(400).json({ error: 'اختاري باقة صحيحة.' });
  if (!['free-trial', 'manual-vodafone', 'create-checkout'].includes(action)) {
    return res.status(400).json({ error: 'طريقة الدفع غير مدعومة.' });
  }
  if (action === 'free-trial' && plan.id !== 'free_trial') {
    return res.status(400).json({ error: 'اختاري الباقة المجانية لإرسال طلب التجربة.' });
  }
  if (action !== 'free-trial' && plan.id === 'free_trial') {
    return res.status(400).json({ error: 'الباقة المجانية لا تحتاج إلى تحويل أو بوابة دفع.' });
  }

  if (action === 'create-checkout') {
    const missingXpay = missingEnvironment(XPAY_REQUIRED);
    if (missingXpay.length) return res.status(503).json({ error: 'بوابة XPay غير مهيأة على الخادم.' });
  }

  let app;
  let uid;
  try {
    app = admin();
    const decoded = await app.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (error) {
    if (error?.code === 'auth/argument-error' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'انتهت جلسة الدخول. سجّلي الدخول مرة أخرى.' });
    }
    console.error('[LOVARA partner checkout auth]', error.message);
    return res.status(503).json({ error: 'تعذر التحقق من حسابك حاليًا.' });
  }

  const db = app.firestore();
  const requestRef = db.collection('storeRequests').doc(uid);
  try {
    const requestSnapshot = await requestRef.get();
    if (!requestSnapshot.exists) return res.status(404).json({ error: 'أكملي بيانات المتجر والصورة أولاً.' });
    const request = requestSnapshot.data() || {};
    if (!isPendingRequest(request, uid)) return res.status(409).json({ error: 'طلب الشراكة غير جاهز للدفع أو تمت مراجعته بالفعل.' });

    if (action === 'free-trial') {
      if (isPaidStatus(request.paymentStatus)) return res.status(409).json({ error: 'تم دفع اشتراك لهذا الطلب بالفعل.' });
      if (request.paymentStatus === 'awaiting_payment' || request.paymentStatus === 'creating_checkout' || request.paymentStatus === 'manual_review') {
        return res.status(409).json({ error: 'هناك طريقة دفع أخرى مسجلة لهذا الطلب. تواصلي مع إدارة LOVARA قبل تغييرها.' });
      }
      await requestRef.update({
        planId: plan.id,
        paymentMethod: 'free_trial',
        paymentStatus: 'free_trial',
        amountMinor: 0,
        currency: 'EGP',
        durationDays: plan.durationDays,
        durationMonths: 0,
        updatedAt: app.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true, planId: plan.id, paymentStatus: 'free_trial' });
    }

    if (action === 'manual-vodafone') {
      if (isPaidStatus(request.paymentStatus)) return res.status(409).json({ error: 'تم تأكيد دفع هذه الباقة بالفعل.' });
      if (request.paymentStatus === 'awaiting_payment' || request.paymentStatus === 'creating_checkout') {
        return res.status(409).json({ error: 'هناك عملية Visa قيد الانتظار. انتظري نتيجتها قبل التحويل بطريقة أخرى.' });
      }
      if (request.paymentStatus === 'manual_review' && request.paymentMethod === 'vodafone_cash' && request.planId === plan.id) {
        return res.status(200).json({ success: true, planId: plan.id, paymentStatus: 'manual_review' });
      }
      if (request.paymentStatus === 'manual_review' || request.paymentMethod === 'visa') {
        return res.status(409).json({ error: 'توجد طريقة دفع أخرى مسجلة لهذا الطلب. تواصلي مع إدارة LOVARA قبل تغييرها.' });
      }
      await requestRef.update({
        planId: plan.id,
        paymentMethod: 'vodafone_cash',
        paymentStatus: 'manual_review',
        amountMinor: plan.amountMinor,
        currency: 'EGP',
        durationDays: plan.durationDays,
        durationMonths: plan.durationMonths,
        paymentSubmittedAt: app.firestore.FieldValue.serverTimestamp(),
        updatedAt: app.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true, planId: plan.id, amount: plan.amount, paymentStatus: 'manual_review' });
    }

    if (isPaidStatus(request.paymentStatus)) return res.status(409).json({ error: 'تم تأكيد الدفع لهذا الطلب بالفعل.' });
    if (request.paymentStatus === 'manual_review') return res.status(409).json({ error: 'تم تسجيل تحويل فودافون كاش لهذا الطلب. لا تبدئي دفعًا آخر قبل مراجعة الإدارة.' });
    if (request.paymentStatus === 'awaiting_payment') {
      if (request.paymentMethod !== 'visa' || request.planId !== plan.id || !request.paymentId) {
        return res.status(409).json({ error: 'توجد عملية دفع مختلفة قيد الانتظار. لا تبدئي عملية جديدة.' });
      }
      const existingPayment = await db.collection('pendingStoreSubscriptions').doc(request.paymentId).get();
      const payment = existingPayment.exists ? existingPayment.data() || {} : {};
      const expiresAt = payment.expiresAt?.toDate ? payment.expiresAt.toDate() : new Date(payment.expiresAt || 0);
      if (payment.status !== 'awaiting_payment' || payment.planId !== plan.id || !payment.clientSecret) {
        return res.status(409).json({ error: 'جلسة الدفع السابقة لا يمكن استئنافها. تواصلي مع إدارة LOVARA قبل أي تحويل أو محاولة أخرى.' });
      }
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
        return res.status(409).json({ error: 'انتهت جلسة الدفع السابقة. تواصلي مع إدارة LOVARA لإغلاقها بأمان قبل بدء دفع جديد.' });
      }
      return res.status(200).json({ clientSecret: payment.clientSecret, paymentId: request.paymentId, planId: plan.id, amount: plan.amount, currency: 'EGP', resumed: true });
    }
    if (request.paymentStatus === 'creating_checkout') {
      return res.status(409).json({ error: 'جارٍ تجهيز جلسة Visa الحالية. انتظري لحظة ثم أعيدي المحاولة.' });
    }

    const retryingCheckout = request.paymentStatus === 'checkout_error'
      && request.paymentMethod === 'visa' && request.planId === plan.id && /^SUB-[A-F0-9]{24}$/.test(String(request.paymentId || ''));
    const paymentId = retryingCheckout ? request.paymentId : `SUB-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    const paymentRef = db.collection('pendingStoreSubscriptions').doc(paymentId);
    const timestamp = app.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async transaction => {
      const [currentSnapshot, existingPaymentSnapshot] = await Promise.all([
        transaction.get(requestRef),
        retryingCheckout ? transaction.get(paymentRef) : Promise.resolve(null)
      ]);
      if (!currentSnapshot.exists || !isPendingRequest(currentSnapshot.data() || {}, uid)) {
        throw Object.assign(new Error('طلب الشراكة غير متاح.'), { statusCode: 409 });
      }
      const current = currentSnapshot.data() || {};
      const retryStillValid = retryingCheckout && current.paymentStatus === 'checkout_error'
        && current.paymentMethod === 'visa' && current.planId === plan.id && current.paymentId === paymentId
        && existingPaymentSnapshot?.exists && existingPaymentSnapshot.data()?.requestUid === uid
        && existingPaymentSnapshot.data()?.planId === plan.id;
      if (isPaidStatus(current.paymentStatus) || ['awaiting_payment', 'creating_checkout', 'manual_review'].includes(String(current.paymentStatus || ''))
        || (retryingCheckout && !retryStillValid)) {
        throw Object.assign(new Error('توجد عملية دفع أو مراجعة أخرى لهذا الطلب.'), { statusCode: 409 });
      }
      const paymentData = {
        type: 'store_subscription',
        paymentId,
        requestUid: uid,
        ownerUid: uid,
        storeName: String(current.storeName || 'متجر شريك').slice(0, 100),
        planId: plan.id,
        planName: plan.name,
        amountMinor: plan.amountMinor,
        currency: 'EGP',
        durationDays: plan.durationDays,
        durationMonths: plan.durationMonths,
        status: 'creating_checkout',
        paid: false,
        updatedAt: timestamp
      };
      if (retryingCheckout) transaction.set(paymentRef, paymentData, { merge: true });
      else transaction.create(paymentRef, { ...paymentData, createdAt: timestamp });
      transaction.update(requestRef, {
        planId: plan.id,
        paymentMethod: 'visa',
        paymentStatus: 'creating_checkout',
        paymentId,
        amountMinor: plan.amountMinor,
        currency: 'EGP',
        durationDays: plan.durationDays,
        durationMonths: plan.durationMonths,
        updatedAt: timestamp
      });
    });

    const origin = String(process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`).replace(/\/$/, '');
    const payload = {
      uiMode: 'custom',
      afterCompletion: {
        type: 'redirect',
        redirect: { url: `${origin}/partnership.html?payment=return&paymentId=${encodeURIComponent(paymentId)}` }
      },
      lineItems: [{
        priceData: {
          currency: 'EGP',
          unitAmount: plan.amountMinor,
          productData: { name: `اشتراك LOVARA ${plan.name} - ${String(request.storeName || '').slice(0, 80)}` }
        },
        quantity: 1
      }],
      metadata: { type: 'store_subscription', paymentId, requestUid: uid, ownerUid: uid, planId: plan.id }
    };

    let response;
    let data;
    try {
      response = await fetch(XPAY_CHECKOUT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.XPAY_API_KEY}`,
          'Idempotency-Key': paymentId,
          ...(process.env.XPAY_MERCHANT_ID ? { 'X-Merchant-Id': process.env.XPAY_MERCHANT_ID } : {})
        },
        body: JSON.stringify(payload)
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok || !data.clientSecret) throw new Error('XPay did not create a valid checkout session.');
    } catch (error) {
      await db.runTransaction(async transaction => {
        const [currentSnapshot, paymentSnapshot] = await Promise.all([transaction.get(requestRef), transaction.get(paymentRef)]);
        const currentPaid = currentSnapshot.exists && isPaidStatus(currentSnapshot.data()?.paymentStatus);
        const paymentPaid = paymentSnapshot.exists && (paymentSnapshot.data()?.paid === true || isPaidStatus(paymentSnapshot.data()?.status));
        if (!currentPaid && !paymentPaid && currentSnapshot.exists && currentSnapshot.data()?.paymentId === paymentId) {
          transaction.update(requestRef, { paymentStatus: 'checkout_error', updatedAt: app.firestore.FieldValue.serverTimestamp() });
          transaction.set(paymentRef, { status: 'checkout_error', updatedAt: app.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      });
      console.error('[LOVARA partner checkout] XPay request failed:', error.message);
      return res.status(502).json({ error: 'تعذر فتح بوابة XPay. حاولي مرة أخرى لاحقًا.' });
    }

    let alreadyPaid = false;
    await db.runTransaction(async transaction => {
      const [currentSnapshot, paymentSnapshot] = await Promise.all([transaction.get(requestRef), transaction.get(paymentRef)]);
      const current = currentSnapshot.exists ? currentSnapshot.data() || {} : {};
      const payment = paymentSnapshot.exists ? paymentSnapshot.data() || {} : {};
      if (isPaidStatus(current.paymentStatus) || payment.paid === true || isPaidStatus(payment.status)) {
        alreadyPaid = true;
        return;
      }
      transaction.set(paymentRef, {
        sessionId: String(data.id || ''),
        providerReference: String(data.reference || paymentId),
        clientSecret: String(data.clientSecret),
        expiresAt: data.expiresAt ? app.firestore.Timestamp.fromDate(new Date(data.expiresAt)) : app.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        status: 'awaiting_payment',
        updatedAt: app.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (currentSnapshot.exists && current.paymentId === paymentId && current.paymentStatus === 'creating_checkout') {
        transaction.update(requestRef, { paymentStatus: 'awaiting_payment', updatedAt: app.firestore.FieldValue.serverTimestamp() });
      }
    });

    if (alreadyPaid) return res.status(409).json({ error: 'تم تأكيد الدفع بالفعل. لا حاجة لبدء جلسة أخرى.' });

    return res.status(200).json({ clientSecret: data.clientSecret, paymentId, planId: plan.id, amount: plan.amount, currency: 'EGP' });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error?.code === 6 || error?.code === 'already-exists') return res.status(409).json({ error: 'توجد عملية دفع قائمة لهذا الطلب.' });
    console.error('[LOVARA partner checkout]', error);
    return res.status(500).json({ error: 'تعذر تجهيز طلب الشراكة الآن.' });
  }
};
