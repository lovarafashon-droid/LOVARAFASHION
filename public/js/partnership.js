(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const plans = window.LovaraPartnerPlans || {};
  const storeName = $('storeName');
  const supportPhone = $('supportPhone');
  const storeImage = $('storeImage');
  const notice = $('notice');
  const paymentMethods = $('paymentMethods');
  const visaMethod = $('visaMethod');
  const vodafoneMethod = $('vodafoneMethod');
  const visaPanel = $('visaPanel');
  const vodafonePanel = $('vodafonePanel');
  const freePanel = $('freePanel');
  const whatsappLink = $('whatsappLink');
  const whatsappNumber = '201066730225';
  let selectedPlan = null;
  let selectedMethod = 'visa';
  let currentUser = null;
  let currentApplication = null;
  let applicationSubmitted = false;
  let checkout = null;
  let paymentElement = null;
  let paymentReady = false;
  let lockedPlan = false;
  let trialUsed = false;
  let trialEligibilityError = false;

  function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.style.background = isError ? '#fff0ed' : '#eef8f1';
    notice.style.color = isError ? '#a64f43' : '#276b42';
    notice.classList.add('show');
  }

  function clearNotice() {
    notice.textContent = '';
    notice.classList.remove('show');
  }

  function updateTrialCard() {
    const button = document.querySelector('[data-plan="free_trial"]');
    if (!button) return;
    const selected = selectedPlan?.id === 'free_trial';
    const unavailable = trialUsed || trialEligibilityError;
    button.disabled = unavailable || (lockedPlan && !selected);
    if (trialUsed) {
      button.querySelector('small').textContent = 'تم استخدام التجربة المجانية لهذا الحساب';
      button.title = 'التجربة المجانية متاحة مرة واحدة فقط لكل حساب';
    } else if (trialEligibilityError) {
      button.querySelector('small').textContent = 'تعذر التحقق من أهلية التجربة؛ أعيدي تحميل الصفحة';
      button.title = 'تعذر التحقق من أهلية التجربة';
    }
  }

  function amountText(plan) {
    return `${Number(plan?.amount || 0)} جنيه`;
  }

  function renderSummary(plan) {
    $('summaryPrice').textContent = amountText(plan);
    if (plan.id === 'free_trial') $('summaryTerm').textContent = `تجربة مجانية · ${plan.productLimit} منتج · 7 أيام`;
    else $('summaryTerm').textContent = `${plan.durationMonths} ${plan.durationMonths === 1 ? 'شهر' : 'أشهر'} · حتى ${plan.productLimit} منتج`;
    const perks = $('summaryPerks');
    if (perks) perks.textContent = (plan.perks || []).join(' · ');
    if (plan.id !== 'free_trial') {
      $('startVisa').textContent = `افتحي بوابة Visa — ${amountText(plan)}`;
      $('vodafoneInstructions').textContent = `حوّلي ${amountText(plan)} إلى الرقم الموضح، احتفظي بصورة التحويل، ثم أرسليها على واتساب لمراجعتها.`;
    }
  }

  function selectMethod(method) {
    selectedMethod = method;
    const visa = method === 'visa';
    visaMethod.classList.toggle('active', visa);
    vodafoneMethod.classList.toggle('active', !visa);
    visaPanel.hidden = !visa;
    vodafonePanel.hidden = visa;
    clearNotice();
  }

  function selectPlan(planId, clear = true) {
    const plan = plans[planId];
    if (!plan || (lockedPlan && selectedPlan && selectedPlan.id !== planId)) return;
    if (planId === 'free_trial' && trialUsed && selectedPlan?.id !== 'free_trial') {
      showNotice('تم استخدام التجربة المجانية لهذا الحساب من قبل. يمكنك اختيار إحدى الباقات المدفوعة.', true);
      return;
    }
    selectedPlan = plan;
    document.querySelectorAll('[data-plan]').forEach(button => {
      const active = button.dataset.plan === planId;
      button.setAttribute('aria-pressed', String(active));
      button.disabled = lockedPlan && !active;
    });
    updateTrialCard();
    $('paymentArea').classList.remove('hidden');
    renderSummary(plan);
    if (plan.id === 'free_trial') {
      paymentMethods.hidden = true;
      visaPanel.hidden = true;
      vodafonePanel.hidden = true;
      freePanel.hidden = false;
    } else {
      paymentMethods.hidden = false;
      freePanel.hidden = true;
      selectMethod(selectedMethod || 'visa');
    }
    if (clear) clearNotice();
  }

  function describeApplication(application) {
    const paymentStatus = String(application.paymentStatus || '');
    if (application.status === 'approved') return 'تمت الموافقة على طلبك. يمكنك فتح لوحة الشريك لإدارة متجرك.';
    if (application.status === 'rejected') return 'تم رفض الطلب السابق. يمكنك تعديل البيانات وإرسال طلب جديد.';
    if (paymentStatus === 'paid') return 'تم تأكيد الدفع الإلكتروني. طلبك بانتظار مراجعة إدارة LOVARA.';
    if (paymentStatus === 'manual_review') return 'تم تسجيل تحويل فودافون كاش. أرسلي صورة الإيصال على واتساب وانتظري مراجعة الإدارة.';
    if (paymentStatus === 'free_trial') return 'تم إرسال طلب الباقة المجانية لمدة 7 أيام. ينتظر مراجعة الإدارة.';
    if (paymentStatus === 'awaiting_payment' || paymentStatus === 'creating_checkout') return 'هناك عملية دفع Visa قيد الانتظار. لا تبدئي عملية دفع أخرى حتى تتضح حالتها.';
    return 'بيانات متجرك محفوظة. اختاري الباقة وطريقة الدفع لإكمال الطلب.';
  }

  function lockApplicationFields() {
    storeName.readOnly = true;
    supportPhone.readOnly = true;
    storeImage.disabled = true;
    storeImage.required = false;
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem('lovara_partner_application_draft') || 'null');
    if (draft && typeof draft === 'object') {
      if (draft.storeName) storeName.value = String(draft.storeName).slice(0, 80);
      if (draft.supportPhone) supportPhone.value = String(draft.supportPhone).slice(0, 20);
    }
  } catch (_) { /* Ignore malformed local data and allow manual entry. */ }

  async function loadApplication(user) {
    if (!window.LovaraPartnerOnboarding?.getApplication) return;
    try {
      const application = await window.LovaraPartnerOnboarding.getApplication(user);
      if (!application) return;
      currentApplication = application;
      if (application.status === 'pending' && application.imageUrl) {
        applicationSubmitted = true;
        storeName.value = application.storeName || '';
        supportPhone.value = application.supportPhone || '';
        lockApplicationFields();
        const hasPaymentState = ['awaiting_payment', 'creating_checkout', 'manual_review', 'paid', 'paid_manual', 'free_trial'].includes(String(application.paymentStatus || ''));
        if (hasPaymentState) lockedPlan = true;
        if (plans[application.planId]) selectPlan(application.planId, false);
        if (application.paymentMethod === 'vodafone_cash') selectMethod('vodafone');
        if (application.paymentStatus === 'free_trial') {
          $('activateFreeTrial').disabled = true;
          $('activateFreeTrial').textContent = 'تم إرسال طلب التجربة';
        }
        showNotice(describeApplication(application), false);
      } else if (application.status === 'approved') {
        currentApplication = application;
        storeName.value = application.storeName || '';
        supportPhone.value = application.supportPhone || '';
        showNotice(describeApplication(application), false);
      } else if (application.status === 'rejected') {
        currentApplication = application;
        showNotice(describeApplication(application), true);
      }
    } catch (error) {
      console.warn('[LOVARA partnership] Could not load existing request:', error.message);
    }
  }

  async function loadTrialEligibility(user) {
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/xpay/create-partnership-checkout', {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trial-status' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'تعذر التحقق من أهلية التجربة.');
      trialUsed = data.used === true;
      trialEligibilityError = false;
      updateTrialCard();
      if (trialUsed && currentApplication?.paymentStatus === 'free_trial') {
        $('activateFreeTrial').disabled = true;
        $('activateFreeTrial').textContent = 'تم إرسال طلب التجربة';
      } else if (trialUsed && selectedPlan?.id === 'free_trial') {
        $('activateFreeTrial').disabled = true;
        $('activateFreeTrial').textContent = 'التجربة مستخدمة سابقًا';
      } else if (trialUsed && (!currentApplication || currentApplication.status === 'rejected')) {
        showNotice('تم استخدام التجربة المجانية لهذا الحساب من قبل. يمكنك اختيار إحدى الباقات المدفوعة.', true);
      }
    } catch (error) {
      trialEligibilityError = true;
      updateTrialCard();
      if (selectedPlan?.id === 'free_trial' && currentApplication?.paymentStatus !== 'free_trial') {
        $('activateFreeTrial').disabled = true;
        $('activateFreeTrial').textContent = 'تعذر التحقق من الأهلية';
      }
      if (!currentApplication || currentApplication.status !== 'approved') {
        showNotice(error.message || 'تعذر التحقق من أهلية التجربة. أعيدي المحاولة لاحقًا.', true);
      }
    }
  }

  async function ensureApplication() {
    if (!selectedPlan) {
      showNotice('اختاري باقة أولاً.', true);
      return false;
    }
    if (currentApplication?.status === 'approved') {
      showNotice('طلبك تمت الموافقة عليه بالفعل. افتحي لوحة الشريك.', true);
      return false;
    }
    if (applicationSubmitted && currentApplication?.status === 'pending' && currentApplication.imageUrl) return true;
    const user = firebase.auth().currentUser || currentUser;
    if (!user) {
      showNotice('سجّلي الدخول إلى حساب LOVARA أولاً لإرسال طلب الشراكة.', true);
      return false;
    }
    const file = storeImage.files?.[0];
    if (!file) {
      showNotice('اختاري صورة للمتجر أولاً.', true);
      return false;
    }
    if (!window.LovaraPartnerOnboarding?.submitApplication) {
      showNotice('تعذر تجهيز طلب المتجر. أعيدي تحميل الصفحة.', true);
      return false;
    }
    try {
      await window.LovaraPartnerOnboarding.submitApplication(storeName.value, supportPhone.value, file);
      currentApplication = await window.LovaraPartnerOnboarding.getApplication(user);
      applicationSubmitted = !!currentApplication?.imageUrl;
      if (applicationSubmitted) lockApplicationFields();
      try { sessionStorage.removeItem('lovara_partner_application_draft'); } catch (_) { /* no-op */ }
      return applicationSubmitted;
    } catch (error) {
      showNotice(error.message || 'تعذر تسجيل طلب المتجر.', true);
      return false;
    }
  }

  async function sendAction(action) {
    const user = firebase.auth().currentUser || currentUser;
    if (!user) throw new Error('سجّلي الدخول إلى حساب LOVARA أولاً.');
    if (!selectedPlan) throw new Error('اختاري باقة أولاً.');
    const token = await user.getIdToken();
    const response = await fetch('/api/xpay/create-partnership-checkout', {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, planId: selectedPlan.id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'تعذر حفظ طريقة الدفع.');
    return data;
  }

  function updateWhatsapp() {
    const name = storeName.value.trim() || '[اسم المتجر]';
    const planName = selectedPlan?.name || '[اسم الباقة]';
    const amount = selectedPlan ? amountText(selectedPlan) : '[المبلغ]';
    const message = `انا اشتركت في متجر ودفعت واسم متجري ${name}، الباقة ${planName}، المبلغ ${amount}. سأرسل صورة التحويل.`;
    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  async function beginVisaCheckout() {
    if (!selectedPlan || selectedPlan.id === 'free_trial') return showNotice('اختاري باقة مدفوعة لاستخدام Visa.', true);
    if (!(await ensureApplication())) return;
    clearNotice();
    $('loading').classList.add('show');
    $('startVisa').disabled = true;
    try {
      const data = await sendAction('create-checkout');
      if (!data.clientSecret) throw new Error('لم تُرجع بوابة XPay بيانات الدفع المطلوبة.');
      if (typeof XPay !== 'function') throw new Error('تعذر تحميل بوابة الدفع. أعيدي تحميل الصفحة.');
      const xpay = XPay('pk_live_VXKBtN5Mi6kkRICZvZPA3UFmfykPwXm5');
      checkout = await xpay.initCheckout({ clientSecret: data.clientSecret, appearance: { colorMode: 'light', borderStyle: 'rounded', colors: { primary: '#c9a87c' } }, locale: 'ar' });
      if (paymentElement?.unmount) paymentElement.unmount();
      paymentElement = checkout.getElements().create('payment');
      paymentElement.mount('#xpay-payment-element');
      paymentElement.on('change', event => {
        paymentReady = !!event.complete;
        $('confirmVisa').disabled = !paymentReady || !checkout.canConfirm;
      });
      $('xpayBox').classList.add('show');
      $('confirmVisa').disabled = true;
      lockedPlan = true;
      document.querySelectorAll('[data-plan]').forEach(button => { button.disabled = button.dataset.plan !== selectedPlan.id; });
    } catch (error) {
      showNotice(error.message || 'تعذر تجهيز بوابة الدفع.', true);
      $('startVisa').disabled = false;
    } finally {
      $('loading').classList.remove('show');
    }
  }

  async function confirmVisaPayment() {
    if (!checkout || !paymentReady) return showNotice('أكملي بيانات البطاقة أولاً.', true);
    $('confirmVisa').disabled = true;
    try {
      const result = await checkout.confirm({ customerDetails: { name: storeName.value.trim() }, redirect: 'if_required' });
      if (result?.type === 'error') throw new Error(result.error?.message || 'تعذر إتمام الدفع.');
      if (currentApplication) currentApplication.paymentStatus = 'awaiting_payment';
      showNotice('تم إرسال الدفع إلى XPay. تنتظر الموافقة حتى تتحقق الإدارة من الدفع، ولن يعلن المتصفح الدفع مدفوعًا من تلقاء نفسه.');
    } catch (error) {
      showNotice(error.message || 'تعذر إتمام الدفع.', true);
      $('confirmVisa').disabled = false;
    }
  }

  async function chooseVodafoneCash(event) {
    event.preventDefault();
    if (!selectedPlan || selectedPlan.id === 'free_trial') return showNotice('اختاري باقة مدفوعة لاستخدام فودافون كاش.', true);
    const popup = window.open('about:blank', '_blank');
    if (!(await ensureApplication())) { popup?.close(); return; }
    try {
      await sendAction('manual-vodafone');
      if (currentApplication) {
        currentApplication.paymentMethod = 'vodafone_cash';
        currentApplication.paymentStatus = 'manual_review';
        currentApplication.planId = selectedPlan.id;
      }
      lockedPlan = true;
      document.querySelectorAll('[data-plan]').forEach(button => { button.disabled = button.dataset.plan !== selectedPlan.id; });
      updateWhatsapp();
      if (popup) popup.location.href = whatsappLink.href;
      else window.location.href = whatsappLink.href;
      showNotice('حوّلي المبلغ إلى رقم فودافون كاش ثم أرسلي صورة الإيصال على واتساب لمراجعته.');
    } catch (error) {
      popup?.close();
      showNotice(error.message || 'تعذر تسجيل طلب التحويل.', true);
    }
  }

  async function activateFreeTrial() {
    if (!selectedPlan || selectedPlan.id !== 'free_trial') return showNotice('اختاري الباقة المجانية أولاً.', true);
    if (!(await ensureApplication())) return;
    const button = $('activateFreeTrial');
    button.disabled = true;
    try {
      await sendAction('free-trial');
      currentApplication = { ...(currentApplication || {}), planId: 'free_trial', paymentMethod: 'free_trial', paymentStatus: 'free_trial', status: 'pending' };
      lockedPlan = true;
      document.querySelectorAll('[data-plan]').forEach(item => { item.disabled = item.dataset.plan !== 'free_trial'; });
      button.disabled = true;
      button.textContent = 'تم إرسال طلب التجربة';
      showNotice('تم إرسال طلب الباقة المجانية لمدة 7 أيام. ستفعّل الإدارة المتجر بعد مراجعة الطلب.');
    } catch (error) {
      const alreadyUsed = String(error.message || '').includes('التجربة المجانية');
      if (alreadyUsed) {
        trialUsed = true;
        updateTrialCard();
        button.disabled = true;
        button.textContent = 'التجربة مستخدمة سابقًا';
      } else {
        button.disabled = false;
      }
      showNotice(error.message || 'تعذر إرسال طلب الباقة المجانية.', true);
    }
  }

  visaMethod.addEventListener('click', () => selectMethod('visa'));
  vodafoneMethod.addEventListener('click', () => selectMethod('vodafone'));
  storeName.addEventListener('input', updateWhatsapp);
  document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => selectPlan(button.dataset.plan)));
  $('startVisa').addEventListener('click', beginVisaCheckout);
  $('confirmVisa').addEventListener('click', confirmVisaPayment);
  $('activateFreeTrial').addEventListener('click', activateFreeTrial);
  $('whatsappLink').addEventListener('click', chooseVodafoneCash);
  $('copyNumber').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('01066730225'); showNotice('تم نسخ رقم فودافون كاش.'); }
    catch (_) { showNotice('انسخي الرقم يدويًا: 01066730225'); }
  });

  firebase.auth().onAuthStateChanged(async user => {
    currentUser = user;
    if (user) {
      await loadApplication(user);
      await loadTrialEligibility(user);
    }
    else showNotice('سجّلي الدخول إلى حساب LOVARA لإرسال طلب الشراكة.', true);
  });

  if (new URLSearchParams(location.search).get('payment') === 'return') {
    showNotice('عادت بوابة الدفع إلى LOVARA. نتحقق من إشعار XPay؛ ستظهر حالة الدفع في مراجعة الطلب بعد وصول الإشعار.');
  }
})();
