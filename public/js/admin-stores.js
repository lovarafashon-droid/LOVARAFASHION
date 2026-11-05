(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const asDate = value => value?.toDate ? value.toDate() : new Date(value || 0);
  let currentAdmin = null;
  const waLink = (phone, message) => {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };
  function slugify(name, uid) {
    const base = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'shop';
    const suffix = String(uid || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 28) || 'store';
    return `${base}-${suffix}`.slice(0, 60);
  }
  function addDuration(start, months, days) {
    const date = new Date(start);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    date.setDate(date.getDate() + days);
    return date;
  }
  function showLogin() { $('loginPanel').classList.remove('hidden'); $('dashboard').classList.add('hidden'); }
  function showDashboard(user) { $('loginPanel').classList.add('hidden'); $('dashboard').classList.remove('hidden'); $('logoutButton').classList.remove('hidden'); $('adminIdentity').textContent = user.email || 'Admin'; loadRequests(); loadShops(); }
  function dateLabel(value) { const date = asDate(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString('ar-EG') : 'غير محدد'; }
  const planInfo = Object.fromEntries(Object.values(window.LovaraPartnerPlans || {}).map(plan => [plan.id, {
    id: plan.id, name: plan.name, days: plan.durationDays, months: plan.durationMonths, price: plan.amount,
    productLimit: plan.productLimit, storeBranding: plan.storeBranding, advancedStorefront: plan.advancedStorefront,
    discounts: plan.discounts, prioritySupport24h: plan.prioritySupport24h
  }]));
  function canApproveRequest(request) {
    if (request.planId === 'free_trial') return request.paymentStatus === 'free_trial';
    if (request.paymentMethod === 'visa') return request.paymentStatus === 'paid';
    return request.paymentMethod === 'vodafone_cash' && request.paymentStatus === 'manual_review';
  }
  function financialsForRequest(request, plan) {
    const saved = request.adminFinancials && typeof request.adminFinancials === 'object' ? request.adminFinancials : {};
    const planAmount = Math.max(0, Math.round(Number(plan.price || 0) * 100));
    const requestAmount = Number(request.amountMinor);
    const due = saved.amountDueMinor !== undefined ? Number(saved.amountDueMinor)
      : Number.isFinite(requestAmount) ? requestAmount : planAmount;
    const paidByStatus = ['paid', 'paid_manual'].includes(String(request.paymentStatus || ''));
    const received = saved.amountReceivedMinor !== undefined ? Number(saved.amountReceivedMinor) : (paidByStatus ? due : 0);
    const amountDueMinor = Number.isFinite(due) ? Math.max(0, Math.round(due)) : planAmount;
    const amountReceivedMinor = Number.isFinite(received) ? Math.max(0, Math.round(received)) : 0;
    return { amountDueMinor, amountReceivedMinor, balanceDueMinor: Math.max(0, amountDueMinor - amountReceivedMinor) };
  }
  function moneyText(minor) { return (Math.max(0, Number(minor) || 0) / 100).toFixed(2).replace(/\.00$/, ''); }
  function financialsForShop(shop) {
    const saved = shop.adminFinancials && typeof shop.adminFinancials === 'object' ? shop.adminFinancials : {};
    const plan = planInfo[shop.subscriptionPlan] || { price: 0 };
    const defaultDue = Math.max(0, Math.round(Number(plan.price || 0) * 100));
    const due = saved.amountDueMinor !== undefined ? Number(saved.amountDueMinor) : defaultDue;
    const paid = ['paid', 'paid_manual'].includes(String(shop.paymentStatus || ''));
    const received = saved.amountReceivedMinor !== undefined ? Number(saved.amountReceivedMinor) : (paid ? due : 0);
    const amountDueMinor = Number.isFinite(due) ? Math.max(0, Math.round(due)) : defaultDue;
    const amountReceivedMinor = Number.isFinite(received) ? Math.max(0, Math.round(received)) : 0;
    return { amountDueMinor, amountReceivedMinor, balanceDueMinor: Math.max(0, amountDueMinor - amountReceivedMinor) };
  }
  function renderRequest(request) {
    const plan = planInfo[request.planId] || { name: 'غير محددة', days: 0, months: 0, price: Number(request.amountMinor || 0) / 100 };
    const finances = financialsForRequest(request, plan);
    const payment = request.paymentStatus === 'paid' ? 'مدفوع عبر Visa'
      : request.paymentStatus === 'paid_manual' ? 'تم تأكيد التحويل يدويًا'
      : request.paymentStatus === 'partial_manual' ? 'تم تفعيل المتجر يدويًا مع رصيد مستحق'
      : request.paymentStatus === 'admin_activated_unpaid' ? 'تم التفعيل يدويًا — لم يُسجل مبلغ مستلم'
      : request.paymentStatus === 'manual_review' ? 'فودافون كاش — بانتظار مراجعة الإيصال'
      : request.paymentStatus === 'free_trial' ? 'تجربة مجانية — بلا دفع'
      : request.paymentStatus === 'awaiting_payment' || request.paymentStatus === 'creating_checkout' ? 'Visa — الدفع قيد الانتظار'
      : request.paymentStatus === 'checkout_error' || request.paymentStatus === 'failed' ? 'تعذر الدفع — يلزم إعادة المحاولة'
      : 'لم تُسجّل طريقة دفع';
    const eligible = canApproveRequest(request);
    const paymentInProgress = ['creating_checkout', 'awaiting_payment', 'manual_review'].includes(String(request.paymentStatus || ''));
    const visaInProgress = ['creating_checkout', 'awaiting_payment'].includes(String(request.paymentStatus || '')) && request.paymentMethod === 'visa';
    const cannotReject = paymentInProgress || request.paymentStatus === 'paid' || request.paymentStatus === 'paid_manual' || finances.amountReceivedMinor > 0;
    const approvalLabel = request.planId === 'free_trial' ? 'موافقة — 7 أيام'
      : request.paymentMethod === 'vodafone_cash' ? 'تأكيد التحويل والموافقة'
      : 'موافقة بعد الدفع';
    const term = plan.days ? `${plan.days} أيام` : `${plan.months || 0} ${Number(plan.months) === 1 ? 'شهر' : 'أشهر'}`;
    const manualActivationDisabled = !plan.id || request.planId === 'free_trial' || visaInProgress || ['paid', 'paid_manual'].includes(String(request.paymentStatus || ''));
    return `<article class="card"><img src="${escapeHtml(request.imageUrl || '')}" alt="${escapeHtml(request.storeName)}"><div><h2>${escapeHtml(request.storeName)}</h2><div class="meta">صاحب الطلب: ${escapeHtml(request.ownerEmail || request.ownerUid)}<br>رقم الدعم: ${escapeHtml(request.supportPhone)}<br>تاريخ الطلب: ${dateLabel(request.createdAt)}<br>الباقة: ${escapeHtml(plan.name)} — ${escapeHtml(term)} — ${escapeHtml(plan.price)} جنيه<br>الحد: ${escapeHtml(plan.productLimit || 0)} منتجًا<br>طريقة الدفع والحالة: ${escapeHtml(payment)}<br>المطلوب: ${moneyText(finances.amountDueMinor)} جنيه · المستلم: ${moneyText(finances.amountReceivedMinor)} جنيه · المتبقي: ${moneyText(finances.balanceDueMinor)} جنيه</div><div class="finance-editor" data-finance-editor="${escapeHtml(request.id)}"><label>المبلغ المطلوب (جنيه)<input type="number" min="0" step="0.01" data-finance-due="${escapeHtml(request.id)}" value="${moneyText(finances.amountDueMinor)}" ${visaInProgress ? 'disabled' : ''}></label><label>المبلغ المستلم (جنيه)<input type="number" min="0" step="0.01" data-finance-received="${escapeHtml(request.id)}" value="${moneyText(finances.amountReceivedMinor)}" ${visaInProgress ? 'disabled' : ''}></label><strong>المتبقي: <span data-finance-balance="${escapeHtml(request.id)}">${moneyText(finances.balanceDueMinor)}</span> جنيه</strong><button class="btn dark" data-save-finance="${escapeHtml(request.id)}" ${visaInProgress ? 'disabled title="انتظري نتيجة جلسة Visa قبل تعديل المبالغ"' : ''}>حفظ المبالغ</button></div><div class="subscription"><strong>Visa يفعّل المتجر تلقائيًا بعد تأكيد XPay؛ الدفع غير المكتمل لا ينشئ متجرًا.</strong></div><div class="card-actions"><button class="btn" data-approve="${escapeHtml(request.id)}" ${eligible ? '' : 'disabled'}>${escapeHtml(approvalLabel)}</button><button class="btn dark" data-manual-activate="${escapeHtml(request.id)}" ${manualActivationDisabled ? 'disabled title="لا يمكن التفعيل اليدوي أثناء جلسة Visa أو لطلب تجربة مجانية"' : ''}>تفعيل يدويًا بالمبالغ المسجلة</button><button class="btn red" data-reject="${escapeHtml(request.id)}" ${cannotReject ? 'disabled title="لا يمكن رفض طلب أثناء الدفع أو بعد تسجيل مبلغ مستلم"' : ''}>رفض</button><a class="btn green" href="${escapeHtml(waLink(request.supportPhone, `مرحبًا ${request.storeName}، نتواصل معك بخصوص طلب الشراكة في LOVARA.`))}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب</a></div>${eligible ? '' : '<div class="meta">الاعتماد المعتاد يحتاج إلى اختيار باقة وتأكيد الدفع أو مراجعة التحويل. التفعيل اليدوي متاح للأدمن خارج جلسة Visa.</div>'}</div></article>`;
  }

  async function loadRequests() {
    const container = $('requestsList');
    container.innerHTML = '<div class="notice">جارٍ تحميل الطلبات…</div>';
    try {
      const snapshot = await db.collection('storeRequests').get();
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(req => req.status === 'pending').sort((a,b) => asDate(b.createdAt) - asDate(a.createdAt));
      $('pendingCount').textContent = String(requests.length);
      if (!requests.length) { container.innerHTML = '<div class="empty">لا توجد طلبات معلّقة حاليًا.</div>'; return; }
      container.innerHTML = requests.map(renderRequest).join('');
      container.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => approveRequest(button.dataset.approve, button)));
      container.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => rejectRequest(button.dataset.reject, button)));
      container.querySelectorAll('[data-finance-due], [data-finance-received]').forEach(input => input.addEventListener('input', () => updateFinancialBalance(input.dataset.financeDue || input.dataset.financeReceived)));
      container.querySelectorAll('[data-save-finance]').forEach(button => button.addEventListener('click', () => saveRequestFinancials(button.dataset.saveFinance, button)));
      container.querySelectorAll('[data-manual-activate]').forEach(button => button.addEventListener('click', () => activateRequestManually(button.dataset.manualActivate, button)));
    } catch (error) {
      console.error('[LOVARA admin requests]', error);
      container.innerHTML = `<div class="empty">تعذر تحميل الطلبات: ${escapeHtml(error.message)}</div>`;
    }
  }

  function readFinancialInputs(uid) {
    const escaped = CSS.escape(uid);
    const due = Number(document.querySelector(`[data-finance-due="${escaped}"]`)?.value);
    const received = Number(document.querySelector(`[data-finance-received="${escaped}"]`)?.value);
    if (!Number.isFinite(due) || due < 0 || !Number.isFinite(received) || received < 0) {
      throw new Error('أدخلي مبلغًا مطلوبًا ومبلغًا مستلمًا صالحين.');
    }
    const amountDueMinor = Math.round(due * 100);
    const amountReceivedMinor = Math.round(received * 100);
    if (!Number.isSafeInteger(amountDueMinor) || !Number.isSafeInteger(amountReceivedMinor) || amountReceivedMinor > amountDueMinor) {
      throw new Error('المبلغ المستلم لا يمكن أن يتجاوز المطلوب.');
    }
    return { amountDueMinor, amountReceivedMinor, balanceDueMinor: amountDueMinor - amountReceivedMinor };
  }

  function updateFinancialBalance(uid) {
    const escaped = CSS.escape(uid);
    const due = Number(document.querySelector(`[data-finance-due="${escaped}"]`)?.value);
    const received = Number(document.querySelector(`[data-finance-received="${escaped}"]`)?.value);
    const balance = document.querySelector(`[data-finance-balance="${escaped}"]`);
    if (!balance) return;
    balance.textContent = Number.isFinite(due) && Number.isFinite(received) && due >= received && received >= 0
      ? moneyText(Math.round((due - received) * 100)) : 'تحققي من المبالغ';
  }

  function readShopFinancialInputs(shopId) {
    const escaped = CSS.escape(shopId);
    const due = Number(document.querySelector(`[data-shop-finance-due="${escaped}"]`)?.value);
    const received = Number(document.querySelector(`[data-shop-finance-received="${escaped}"]`)?.value);
    if (!Number.isFinite(due) || due < 0 || !Number.isFinite(received) || received < 0) throw new Error('أدخلي مبالغ صالحة.');
    const amountDueMinor = Math.round(due * 100);
    const amountReceivedMinor = Math.round(received * 100);
    if (!Number.isSafeInteger(amountDueMinor) || !Number.isSafeInteger(amountReceivedMinor) || amountReceivedMinor > amountDueMinor) {
      throw new Error('المبلغ المستلم لا يمكن أن يتجاوز المطلوب.');
    }
    return { amountDueMinor, amountReceivedMinor, balanceDueMinor: amountDueMinor - amountReceivedMinor };
  }

  function updateShopFinancialBalance(shopId) {
    const escaped = CSS.escape(shopId);
    const due = Number(document.querySelector(`[data-shop-finance-due="${escaped}"]`)?.value);
    const received = Number(document.querySelector(`[data-shop-finance-received="${escaped}"]`)?.value);
    const balance = document.querySelector(`[data-shop-finance-balance="${escaped}"]`);
    if (!balance) return;
    balance.textContent = Number.isFinite(due) && Number.isFinite(received) && due >= received && received >= 0
      ? moneyText(Math.round((due - received) * 100)) : 'تحققي من المبالغ';
  }

  async function saveShopFinancials(shopId, button) {
    button.disabled = true;
    try {
      const ref = db.collection('shops').doc(shopId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error('المتجر غير موجود.');
      const amounts = readShopFinancialInputs(shopId);
      const shop = snapshot.data() || {};
      await ref.update({
        adminFinancials: {
          ...amounts, currency: 'EGP', paymentMethod: 'admin_manual',
          paymentId: shop.adminFinancials?.paymentId || shop.paymentId || '',
          transactionId: shop.adminFinancials?.transactionId || shop.paymentTransactionId || '',
          recordedBy: currentAdmin.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذر حفظ سجل المبالغ.'); button.disabled = false; }
  }

  async function saveRequestFinancials(uid, button) {
    button.disabled = true;
    try {
      const requestRef = db.collection('storeRequests').doc(uid);
      const snapshot = await requestRef.get();
      if (!snapshot.exists || snapshot.data().status !== 'pending') throw new Error('الطلب لم يعد معلقًا.');
      const request = snapshot.data();
      if (request.paymentMethod === 'visa' && ['creating_checkout', 'awaiting_payment'].includes(String(request.paymentStatus || ''))) {
        throw new Error('انتظري نتيجة جلسة Visa قبل تعديل المبالغ المسجلة.');
      }
      const amounts = readFinancialInputs(uid);
      await requestRef.update({
        adminFinancials: { ...amounts, currency: 'EGP', recordedBy: currentAdmin.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await loadRequests();
    } catch (error) { alert(error.message || 'تعذر حفظ المبالغ.'); button.disabled = false; }
  }

  async function activateStoreRequest(uid, request, options = {}) {
    const requestRef = db.collection('storeRequests').doc(uid);
    await db.runTransaction(async transaction => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'pending') throw new Error('الطلب لم يعد معلقًا.');
      const current = requestSnapshot.data() || {};
      const plan = planInfo[current.planId];
      if (!plan) throw new Error('اختاري باقة صحيحة قبل تفعيل المتجر.');
      if (options.manualActivation) {
        if (current.planId === 'free_trial') throw new Error('استخدمي موافقة التجربة المجانية بدل التفعيل اليدوي.');
        if (['paid', 'paid_manual'].includes(String(current.paymentStatus || ''))) throw new Error('الطلب مدفوع بالفعل؛ استخدمي زر الاعتماد المعتاد.');
        if (current.paymentMethod === 'visa' && ['creating_checkout', 'awaiting_payment'].includes(String(current.paymentStatus || ''))) {
          throw new Error('جلسة Visa ما زالت قائمة؛ انتظري نتيجتها قبل التفعيل اليدوي.');
        }
      } else if (!canApproveRequest(current)) {
        throw new Error('لا يمكن اعتماد الطلب قبل التحقق من الدفع أو التحويل.');
      }
      if (options.manualTransfer && (current.paymentMethod !== 'vodafone_cash' || current.paymentStatus !== 'manual_review')) {
        throw new Error('حالة تحويل فودافون كاش تغيرت؛ أعيدي تحميل الطلب.');
      }

      let slug = slugify(current.storeName, uid);
      const base = slug.slice(0, 54);
      let suffix = 2;
      let existingShop = null;
      let shopRef;
      while (true) {
        shopRef = db.collection('shops').doc(slug);
        const existing = await transaction.get(shopRef);
        if (!existing.exists) break;
        const data = existing.data() || {};
        if (data.ownerUid === uid && data.deleted !== true && data.status !== 'deleted') { existingShop = data; break; }
        slug = `${base}-${suffix++}`.slice(0, 60);
      }

      const timestamp = firebase.firestore.FieldValue.serverTimestamp();
      const paymentMethod = options.paymentMethod || current.paymentMethod || 'admin_manual';
      const paymentStatus = options.paymentStatus || current.paymentStatus || 'admin_activated_unpaid';
      const amounts = options.financials || financialsForRequest(current, plan);
      if (!Number.isSafeInteger(amounts.amountDueMinor) || !Number.isSafeInteger(amounts.amountReceivedMinor)
        || !Number.isSafeInteger(amounts.balanceDueMinor) || amounts.amountDueMinor < 0
        || amounts.amountReceivedMinor < 0 || amounts.amountReceivedMinor > amounts.amountDueMinor
        || amounts.balanceDueMinor !== amounts.amountDueMinor - amounts.amountReceivedMinor) {
        throw new Error('بيانات المبالغ غير متطابقة؛ راجعي المطلوب والمستلم والمتبقي.');
      }
      const financials = {
        ...amounts,
        currency: 'EGP',
        paymentMethod,
        paymentId: current.paymentId || '',
        recordedBy: currentAdmin.uid,
        ...(current.paymentTransactionId ? { transactionId: current.paymentTransactionId } : {}),
        updatedAt: timestamp
      };
      const paidAt = paymentMethod === 'visa' && current.paidAt ? asDate(current.paidAt) : new Date();
      const startAt = Number.isFinite(paidAt.getTime()) ? paidAt : new Date();
      const expiresAt = addDuration(startAt, plan.months, plan.days);
      transaction.set(shopRef, {
        slug, ownerUid: uid, ownerEmail: current.ownerEmail || '', storeName: current.storeName,
        supportPhone: current.supportPhone, imageUrl: current.imageUrl,
        active: true, status: 'active', subscriptionStatus: 'active', subscriptionPlan: current.planId,
        durationDays: plan.days, durationMonths: plan.months, productLimit: plan.productLimit,
        freeTrialUsed: current.planId === 'free_trial' || current.freeTrialUsed === true || existingShop?.freeTrialUsed === true,
        storeBranding: plan.storeBranding, advancedStorefront: plan.advancedStorefront,
        discounts: plan.discounts, prioritySupport24h: plan.prioritySupport24h,
        paymentMethod, paymentStatus, paymentId: current.paymentId || '', adminFinancials: financials,
        ...(options.manualActivation ? { manualActivation: { by: currentAdmin.uid, at: timestamp, balanceDueMinor: amounts.balanceDueMinor } } : {}),
        ...(plan.months ? { subscriptionFirstPaymentAt: firebase.firestore.Timestamp.fromDate(startAt) } : {}),
        approvedAt: timestamp,
        expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
        createdAt: existingShop?.createdAt || current.createdAt || timestamp
      }, { merge: true });
      transaction.update(requestRef, {
        status: 'approved', shopId: slug, paymentMethod, paymentStatus, adminFinancials: financials,
        ...(options.manualTransfer ? { paymentVerifiedAt: timestamp, paymentVerifiedBy: currentAdmin.uid } : {}),
        ...(options.manualActivation ? { manualActivatedAt: timestamp, manualActivatedBy: currentAdmin.uid } : {}),
        reviewedAt: timestamp, reviewedBy: currentAdmin.uid, updatedAt: timestamp
      });
      transaction.set(db.collection('users').doc(uid), { storeId: slug }, { merge: true });
    });
  }

  async function activateRequestManually(uid, button) {
    button.disabled = true;
    try {
      const requestRef = db.collection('storeRequests').doc(uid);
      const snapshot = await requestRef.get();
      if (!snapshot.exists || snapshot.data().status !== 'pending') throw new Error('الطلب لم يعد معلقًا.');
      const request = snapshot.data();
      if (request.paymentMethod === 'visa' && ['creating_checkout', 'awaiting_payment'].includes(String(request.paymentStatus || ''))) {
        throw new Error('لا يمكن التفعيل اليدوي أثناء جلسة Visa؛ انتظري نتيجتها حتى لا يتفعّل المتجر قبل حسم الدفع.');
      }
      if (['paid', 'paid_manual'].includes(String(request.paymentStatus || ''))) {
        throw new Error('الطلب مدفوع بالفعل؛ استخدمي زر الاعتماد المعتاد.');
      }
      if (request.planId === 'free_trial') throw new Error('استخدمي زر موافقة التجربة المجانية لتفعيلها بعد مراجعة الطلب.');
      const plan = planInfo[request.planId];
      if (!plan) throw new Error('اختاري باقة صحيحة قبل التفعيل اليدوي.');
      const amounts = readFinancialInputs(uid);
      const paymentStatus = amounts.amountDueMinor === 0 ? 'admin_waived'
        : amounts.balanceDueMinor === 0 ? 'paid_manual'
          : amounts.amountReceivedMinor > 0 ? 'partial_manual' : 'admin_activated_unpaid';
      const confirmation = `تفعيل متجر ${request.storeName} يدويًا؟\nالمطلوب: ${moneyText(amounts.amountDueMinor)} جنيه\nالمستلم: ${moneyText(amounts.amountReceivedMinor)} جنيه\nالمتبقي: ${moneyText(amounts.balanceDueMinor)} جنيه\nسيُفتح المتجر الآن حتى لو بقي رصيد مستحق، ويُسجل الرصيد في لوحة الإدارة.`;
      if (!confirm(confirmation)) { button.disabled = false; return; }
      await activateStoreRequest(uid, request, { manualActivation: true, paymentMethod: 'admin_manual', paymentStatus, financials: amounts });
      await Promise.all([loadRequests(), loadShops()]);
    } catch (error) { alert(error.message || 'تعذر تفعيل المتجر يدويًا.'); button.disabled = false; }
  }

  async function approveRequest(uid, button) {
    const requestRef = db.collection('storeRequests').doc(uid);
    button.disabled = true;
    try {
      const snapshot = await requestRef.get();
      if (!snapshot.exists || snapshot.data().status !== 'pending') throw new Error('الطلب لم يعد معلقًا.');
      const request = snapshot.data();
      const plan = planInfo[request.planId];
      if (!plan || !canApproveRequest(request)) throw new Error('لا يمكن اعتماد الطلب قبل اختيار باقة والتحقق من الدفع أو التحويل.');
      const manualTransfer = request.paymentMethod === 'vodafone_cash' && request.paymentStatus === 'manual_review';
      let amounts = financialsForRequest(request, plan);
      if (manualTransfer) {
        const hasSavedReceipt = request.adminFinancials?.amountReceivedMinor !== undefined;
        if (amounts.amountDueMinor === 0) throw new Error('المبلغ المطلوب صفر؛ استخدمي التفعيل اليدوي لتسجيل الإعفاء بدل تأكيد تحويل مدفوع.');
        if (hasSavedReceipt && amounts.amountReceivedMinor < amounts.amountDueMinor) {
          throw new Error('المبلغ المسجل مستلم جزئيًا. استخدمي التفعيل اليدوي لتسجيل الرصيد المتبقي بدل تأكيد دفع كامل.');
        }
        if (!confirm(`بعد مراجعة الإيصال، تأكيد استلام ${moneyText(amounts.amountDueMinor)} جنيه من فودافون كاش والموافقة على المتجر؟`)) { button.disabled = false; return; }
        amounts = { amountDueMinor: amounts.amountDueMinor, amountReceivedMinor: amounts.amountDueMinor, balanceDueMinor: 0 };
      } else if (request.planId === 'free_trial') {
        amounts = { amountDueMinor: 0, amountReceivedMinor: 0, balanceDueMinor: 0 };
      } else if (request.paymentStatus === 'paid') {
        amounts = { amountDueMinor: amounts.amountDueMinor, amountReceivedMinor: amounts.amountDueMinor, balanceDueMinor: 0 };
      }
      await activateStoreRequest(uid, request, {
        paymentMethod: request.paymentMethod,
        paymentStatus: manualTransfer ? 'paid_manual' : request.paymentStatus,
        financials: amounts,
        manualTransfer
      });
      await Promise.all([loadRequests(), loadShops()]);
    } catch (error) {
      console.error('[LOVARA approve]', error);
      alert(error.message || 'تعذرت الموافقة على الطلب.');
      button.disabled = false;
    }
  }

  async function rejectRequest(uid, button) {
    if (!confirm('تأكيد رفض طلب المتجر؟')) return;
    button.disabled = true;
    try {
      const requestRef = db.collection('storeRequests').doc(uid);
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(requestRef);
        if (!snapshot.exists || snapshot.data().status !== 'pending') throw new Error('الطلب لم يعد معلقًا.');
        const request = snapshot.data();
        if (['creating_checkout', 'awaiting_payment', 'manual_review', 'paid', 'paid_manual'].includes(String(request.paymentStatus || ''))) {
          throw new Error('لا يمكن رفض الطلب أثناء الدفع أو مراجعة التحويل. انتظري اكتمال الحالة أولًا.');
        }
        if (Number(request.adminFinancials?.amountReceivedMinor || 0) > 0) {
          throw new Error('سُجل مبلغ مستلم لهذا الطلب. عالجي المبلغ أو فعّلي المتجر يدويًا قبل الرفض.');
        }
        transaction.update(requestRef, { status: 'rejected', reviewedAt: firebase.firestore.FieldValue.serverTimestamp(), reviewedBy: currentAdmin.uid });
      });
      await loadRequests();
    } catch (error) { alert(error.message || 'تعذر رفض الطلب.'); button.disabled = false; }
  }

  async function loadShops() {
    const container = $('shopsList');
    container.innerHTML = '<div class="notice">جارٍ تحميل المتاجر…</div>';
    try {
      const snapshot = await db.collection('shops').get();
      const shops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => String(a.storeName).localeCompare(String(b.storeName), 'ar'));
      if (!shops.length) { container.innerHTML = '<div class="empty">لا توجد متاجر معتمدة بعد.</div>'; return; }
      container.innerHTML = shops.map(shop => {
        const expiry = asDate(shop.expiresAt);
        const expired = !Number.isFinite(expiry.getTime()) || expiry <= new Date();
        const isDeleted = shop.deleted === true || shop.status === 'deleted';
        const statusClass = isDeleted ? 'deleted-status' : !shop.active ? 'paused-status' : expired ? 'expired-status' : 'active-status';
        const statusText = isDeleted ? 'محذوف من الموقع' : !shop.active ? 'موقوف' : expired ? 'منتهي الاشتراك' : 'نشط';
        const link = `${location.origin}/store/${encodeURIComponent(shop.slug || shop.id)}`;
        const finance = financialsForShop(shop);
        const financeSummary = `<br>المطلوب: ${moneyText(finance.amountDueMinor)} جنيه · المستلم: ${moneyText(finance.amountReceivedMinor)} جنيه · المتبقي: ${moneyText(finance.balanceDueMinor)} جنيه`;
        const financeControls = `<div class="finance-editor" data-shop-finance="${escapeHtml(shop.id)}"><label>المبلغ المطلوب (جنيه)<input type="number" min="0" step="0.01" data-shop-finance-due="${escapeHtml(shop.id)}" value="${moneyText(finance.amountDueMinor)}"></label><label>المبلغ المستلم (جنيه)<input type="number" min="0" step="0.01" data-shop-finance-received="${escapeHtml(shop.id)}" value="${moneyText(finance.amountReceivedMinor)}"></label><strong>المتبقي: <span data-shop-finance-balance="${escapeHtml(shop.id)}">${moneyText(finance.balanceDueMinor)}</span> جنيه</strong><button class="btn dark" data-save-shop-finance="${escapeHtml(shop.id)}">حفظ سجل المبالغ</button></div>`;
        const subscriptionControls = isDeleted ? '' : `<div class="subscription"><label>تمديد: <input type="number" min="0" max="60" value="1" data-extend-months="${escapeHtml(shop.id)}"> شهر</label><label><input type="number" min="0" max="365" value="0" data-extend-days="${escapeHtml(shop.id)}"> يوم</label><button class="btn" data-extend="${escapeHtml(shop.id)}"><i class="fas fa-calendar-plus"></i> تمديد الاشتراك</button></div>`;
        const statusControls = isDeleted
          ? `<button class="btn" data-restore="${escapeHtml(shop.id)}">استعادة كمتجر موقوف</button>`
          : `<button class="btn ${shop.active ? 'red' : ''}" data-toggle="${escapeHtml(shop.id)}" data-active="${shop.active === true}"><i class="fas ${shop.active ? 'fa-ban' : 'fa-play'}"></i> ${shop.active ? 'إيقاف المتجر' : 'تفعيل المتجر'}</button><button class="btn red" data-delete-shop="${escapeHtml(shop.id)}">حذف المتجر</button>`;
        return `<article class="card"><img src="${escapeHtml(shop.imageUrl || '')}" alt="${escapeHtml(shop.storeName)}"><div><h2>${escapeHtml(shop.storeName)} <span class="status ${statusClass}">${statusText}</span></h2><div class="meta">المالك: ${escapeHtml(shop.ownerEmail || shop.ownerUid)}<br>الدعم: ${escapeHtml(shop.supportPhone)}<br>ينتهي الاشتراك: ${dateLabel(shop.expiresAt)}${financeSummary}<br><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a></div>${financeControls}${subscriptionControls}<div class="card-actions">${statusControls}<a class="btn green" href="${escapeHtml(waLink(shop.supportPhone, `مرحبًا ${shop.storeName}، بخصوص متجر LOVARA الخاص بك.`))}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب</a></div>${isDeleted ? '<div class="meta">المتجر مخفي عن العملاء؛ تم الاحتفاظ بسجلات الطلبات والمنتجات.</div>' : ''}</div></article>`;
      }).join('');
      container.querySelectorAll('[data-extend]').forEach(button => button.addEventListener('click', () => extendSubscription(button.dataset.extend, button)));
      container.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => toggleShop(button.dataset.toggle, button)));
      container.querySelectorAll('[data-delete-shop]').forEach(button => button.addEventListener('click', () => deleteShop(button.dataset.deleteShop, button)));
      container.querySelectorAll('[data-restore]').forEach(button => button.addEventListener('click', () => restoreShop(button.dataset.restore, button)));
      container.querySelectorAll('[data-shop-finance-due], [data-shop-finance-received]').forEach(input => input.addEventListener('input', () => updateShopFinancialBalance(input.dataset.shopFinanceDue || input.dataset.shopFinanceReceived)));
      container.querySelectorAll('[data-save-shop-finance]').forEach(button => button.addEventListener('click', () => saveShopFinancials(button.dataset.saveShopFinance, button)));
    } catch (error) {
      console.error('[LOVARA admin shops]', error);
      container.innerHTML = `<div class="empty">تعذر تحميل المتاجر: ${escapeHtml(error.message)}</div>`;
    }
  }

  async function extendSubscription(shopId, button) {
    button.disabled = true;
    try {
      const ref = db.collection('shops').doc(shopId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error('المتجر غير موجود.');
      const shop = snapshot.data();
      if (shop.deleted === true || shop.status === 'deleted') throw new Error('استعيدي المتجر أولًا قبل تمديد اشتراكه.');
      const months = Math.min(60, Math.max(0, Number(document.querySelector(`[data-extend-months="${CSS.escape(shopId)}"]`)?.value || 0)));
      const days = Math.min(365, Math.max(0, Number(document.querySelector(`[data-extend-days="${CSS.escape(shopId)}"]`)?.value || 0)));
      if (months === 0 && days === 0) throw new Error('حددي مدة تمديد أكبر من صفر.');
      const oldExpiry = asDate(shop.expiresAt);
      const now = new Date();
      const start = oldExpiry > now ? oldExpiry : now;
      const keepActive = shop.active === true && shop.status === 'active' && oldExpiry > now
        && !['suspended', 'cancelled'].includes(String(shop.subscriptionStatus || ''));
      const expiresAt = addDuration(start, months, days);
      await ref.update({ expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt), active: keepActive, status: keepActive ? 'active' : 'suspended', subscriptionStatus: keepActive ? 'active' : 'suspended', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذر تمديد الاشتراك.'); button.disabled = false; }
  }

  async function toggleShop(shopId, button) {
    const isActive = button.dataset.active === 'true';
    if (isActive && !confirm('هل تريد إيقاف المتجر الآن؟')) return;
    button.disabled = true;
    try {
      const ref = db.collection('shops').doc(shopId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error('المتجر غير موجود.');
      const shop = snapshot.data();
      if (shop.deleted === true || shop.status === 'deleted') throw new Error('استعيدي المتجر قبل تفعيله.');
      if (!isActive) {
        const expiry = asDate(shop.expiresAt);
        if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) throw new Error('انتهى الاشتراك؛ مددي الاشتراك أولًا ثم فعّلي المتجر.');
      }
      await ref.update({ active: !isActive, status: !isActive ? 'active' : 'suspended', subscriptionStatus: !isActive ? 'active' : 'suspended', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذر تحديث حالة المتجر.'); button.disabled = false; }
  }

  async function deleteShop(shopId, button) {
    const snapshot = await db.collection('shops').doc(shopId).get();
    if (!snapshot.exists) { alert('المتجر غير موجود.'); return; }
    const shop = snapshot.data();
    if (!confirm(`حذف متجر ${shop.storeName || shopId} من الموقع؟\nسيُخفى عن العملاء، مع الاحتفاظ بسجلات الطلبات والمنتجات للرجوع إليها.`)) return;
    button.disabled = true;
    try {
      await db.collection('shops').doc(shopId).update({
        deleted: true, active: false, status: 'deleted', subscriptionStatus: 'cancelled',
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: currentAdmin.uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذر حذف المتجر.'); button.disabled = false; }
  }

  async function restoreShop(shopId, button) {
    button.disabled = true;
    try {
      await db.collection('shops').doc(shopId).update({
        deleted: false, active: false, status: 'suspended', subscriptionStatus: 'suspended',
        restoredAt: firebase.firestore.FieldValue.serverTimestamp(), restoredBy: currentAdmin.uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذرت استعادة المتجر.'); button.disabled = false; }
  }

  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${button.dataset.tab}Panel`));
  }));
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); $('loginError').textContent = '';
    try { await auth.signInWithEmailAndPassword($('adminEmail').value.trim(), $('adminPassword').value); }
    catch (_) { $('loginError').textContent = 'بيانات الدخول غير صحيحة.'; }
  });
  $('logoutButton').addEventListener('click', () => auth.signOut());
  auth.onAuthStateChanged(async user => {
    if (!user) { currentAdmin = null; $('dashboard').classList.add('hidden'); $('logoutButton').classList.add('hidden'); $('loginPanel').classList.remove('hidden'); return; }
    try {
      const profile = await db.collection('users').doc(user.uid).get();
      if (!profile.exists || profile.data().role !== 'admin') { await auth.signOut(); $('loginError').textContent = 'هذا الحساب ليس لديه صلاحية أدمن.'; return; }
      currentAdmin = user;
      showDashboard(user);
    } catch (error) { console.error(error); $('loginError').textContent = 'تعذر التحقق من صلاحية الأدمن.'; }
  });
})();
