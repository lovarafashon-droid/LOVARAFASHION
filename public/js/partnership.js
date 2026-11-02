(() => {
  const $ = id => document.getElementById(id);
  const storeName = $('partnerStoreName');
  const supportPhone = $('partnerSupportPhone');
  const storeImage = $('partnerStoreImage');
  const notice = $('partnerNotice');
  const visaMethod = $('partnerVisaMethod');
  const vodafoneMethod = $('partnerVodafoneMethod');
  const visaPanel = $('partnerVisaPanel');
  const vodafonePanel = $('partnerVodafonePanel');
  const whatsappLink = $('partnerWhatsappLink');
  const whatsappNumber = '201066730225';
  const fromSignup = new URLSearchParams(window.location.search).get('fromSignup') === '1';
  let step = fromSignup ? 'payment' : 'decision';
  let checkout = null;
  let paymentReady = false;
  let applicationSubmitted = false;

  function setNotice(message, type = 'error') {
    notice.textContent = message;
    notice.className = `partner-notice${type === 'success' ? ' is-success' : type === 'info' ? ' is-info' : ''}`;
    notice.hidden = false;
  }

  function clearNotice() {
    notice.textContent = '';
    notice.hidden = true;
    notice.className = 'partner-notice';
  }

  function setStep(nextStep) {
    step = nextStep;
    document.querySelectorAll('[data-step-view]').forEach(view => {
      view.hidden = view.dataset.stepView !== nextStep;
    });
    document.querySelectorAll('[data-step-indicator]').forEach(indicator => {
      indicator.classList.toggle('is-active', indicator.dataset.stepIndicator === nextStep);
    });
    if (nextStep === 'payment') {
      document.querySelector('[data-step-indicator="payment"]')?.classList.add('is-active');
    }
    clearNotice();
  }

  function updateWhatsapp() {
    const name = storeName.value.trim();
    const message = `أنا اشتركت في LOVARA ودفعت واسم متجري ${name || '[اسم المتجر]'}`;
    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function selectMethod(method) {
    const visa = method === 'visa';
    visaMethod.classList.toggle('is-selected', visa);
    vodafoneMethod.classList.toggle('is-selected', !visa);
    visaMethod.setAttribute('aria-checked', String(visa));
    vodafoneMethod.setAttribute('aria-checked', String(!visa));
    visaPanel.hidden = !visa;
    vodafonePanel.hidden = visa;
    clearNotice();
  }

  function validateApplication() {
    const name = storeName.value.trim();
    const phone = supportPhone.value.trim().replace(/[\s()-]/g, '');
    const file = storeImage.files?.[0];
    if (name.length < 2 || name.length > 80) {
      setNotice('اكتب اسم المتجر من حرفين إلى 80 حرفاً.');
      storeName.focus();
      return false;
    }
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      setNotice('اكتب رقم دعم دوليًا صحيحًا يبدأ بعلامة + ومفتاح الدولة.');
      supportPhone.focus();
      return false;
    }
    if (!file) {
      setNotice('اختر صورة المتجر أولاً.');
      storeImage.focus();
      return false;
    }
    if (!file.type.startsWith('image/')) {
      setNotice('اختر ملف صورة صالحاً.');
      storeImage.focus();
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice('حجم الصورة يجب ألا يتجاوز 10 ميجابايت.');
      storeImage.focus();
      return false;
    }
    return true;
  }

  async function ensureApplication() {
    if (applicationSubmitted) return true;
    if (!validateApplication()) return false;
    if (!window.LovaraPartnerOnboarding?.submitApplication) {
      setNotice('تعذر تجهيز طلب المتجر. أعد تحميل الصفحة وحاول مرة أخرى.');
      return false;
    }
    try {
      await window.LovaraPartnerOnboarding.submitApplication(storeName.value.trim(), supportPhone.value.trim(), storeImage.files[0]);
      applicationSubmitted = true;
      return true;
    } catch (error) {
      setNotice(error.message || 'تعذر تسجيل طلب المتجر.');
      return false;
    }
  }

  storeName.addEventListener('input', updateWhatsapp);
  [visaMethod, vodafoneMethod].forEach(button => button.addEventListener('click', () => selectMethod(button === visaMethod ? 'visa' : 'vodafone')));

  $('partnerContinue').addEventListener('click', () => setStep('payment'));
  $('partnerDeclineFlow').addEventListener('click', () => setStep('rejected'));
  $('partnerRestart').addEventListener('click', () => {
    storeName.value = '';
    supportPhone.value = '';
    storeImage.value = '';
    storeImage.dispatchEvent(new Event('change'));
    applicationSubmitted = false;
    selectMethod('visa');
    setStep('decision');
  });
  $('partnerBackToDecision').addEventListener('click', () => setStep('decision'));

  $('partnerCopyNumber').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('01066730225');
      setNotice('تم نسخ رقم فودافون كاش.', 'success');
    } catch (_) {
      setNotice('انسخ الرقم يدوياً: 01066730225', 'info');
    }
  });

  whatsappLink.addEventListener('click', async event => {
    event.preventDefault();
    const whatsappWindow = window.open('about:blank', '_blank');
    if (!whatsappWindow) {
      setNotice('اسمح بفتح النوافذ المنبثقة من الموقع للمتابعة إلى واتساب.');
      return;
    }
    whatsappWindow.opener = null;
    if (!(await ensureApplication())) {
      whatsappWindow.close();
      return;
    }
    updateWhatsapp();
    whatsappWindow.location.href = whatsappLink.href;
    setNotice('تم تسجيل طلب الشراكة. أرسل صورة التحويل عبر واتساب، وسيبقى الطلب بانتظار مراجعة الإدارة.', 'success');
  });

  $('partnerStartVisa').addEventListener('click', async () => {
    if (!(await ensureApplication())) return;
    clearNotice();
    const button = $('partnerStartVisa');
    button.disabled = true;
    $('partnerLoading').hidden = false;
    try {
      const response = await fetch('/api/xpay/create-partnership-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName: storeName.value.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.clientSecret) throw new Error(data.error || 'تعذر تجهيز بوابة الدفع.');
      if (typeof XPay !== 'function') throw new Error('تعذر تحميل بوابة الدفع. أعد تحميل الصفحة وحاول مرة أخرى.');
      const xpay = XPay('pk_live_VXKBtN5Mi6kkRICZvZPA3UFmfykPwXm5');
      checkout = await xpay.initCheckout({
        clientSecret: data.clientSecret,
        appearance: { colorMode: 'light', borderStyle: 'rounded', colors: { primary: '#1d3440' } },
        locale: 'ar'
      });
      const element = checkout.getElements().create('payment');
      element.mount('#xpay-payment-element');
      element.on('change', event => {
        paymentReady = !!event.complete;
        $('partnerConfirmVisa').disabled = !paymentReady || !checkout.canConfirm;
      });
      $('partnerXpayBox').hidden = false;
      $('partnerConfirmVisa').disabled = true;
    } catch (error) {
      setNotice(error.message || 'تعذر تجهيز بوابة الدفع.');
      button.disabled = false;
    } finally {
      $('partnerLoading').hidden = true;
    }
  });

  $('partnerConfirmVisa').addEventListener('click', async () => {
    if (!checkout || !paymentReady) {
      setNotice('أكمل بيانات البطاقة أولاً.');
      return;
    }
    const button = $('partnerConfirmVisa');
    button.disabled = true;
    button.innerHTML = '<span class="partner-spinner" aria-hidden="true"></span> جارٍ تأكيد الدفع...';
    try {
      const result = await checkout.confirm({ customerDetails: { name: storeName.value.trim() }, redirect: 'if_required' });
      if (result?.type === 'error') throw new Error(result.error?.message || 'تعذر إتمام الدفع.');
      setNotice('تم إرسال عملية الدفع. طلبك ما زال بانتظار موافقة إدارة LOVARA يدوياً.', 'success');
    } catch (error) {
      setNotice(error.message || 'تعذر إتمام الدفع.');
      button.disabled = false;
    } finally {
      button.textContent = 'إتمام الدفع بأمان';
    }
  });

  const paymentState = new URLSearchParams(window.location.search).get('payment');
  if (paymentState === 'return' || paymentState === 'success') {
    setStep('payment');
    setNotice('تم الرجوع من بوابة الدفع. طلب الشراكة بانتظار مراجعة الإدارة وتأكيد حالة الدفع.', 'info');
  } else if (paymentState === 'cancelled') {
    setStep('payment');
    setNotice('تم إلغاء عملية الدفع. تقدر تختار طريقة دفع تانية في أي وقت.', 'info');
  } else {
    setStep(step);
  }
  updateWhatsapp();
})();
