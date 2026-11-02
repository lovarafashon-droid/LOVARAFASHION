(() => {
  const $ = id => document.getElementById(id);
  const storeName = $('storeName');
  const supportPhone = $('supportPhone');
  const storeImage = $('storeImage');
  const notice = $('notice');
  const visaMethod = $('visaMethod');
  const vodafoneMethod = $('vodafoneMethod');
  const visaPanel = $('visaPanel');
  const vodafonePanel = $('vodafonePanel');
  const whatsappLink = $('whatsappLink');
  const whatsappNumber = '201066730225';
  let checkout = null;
  let paymentReady = false;
  let applicationSubmitted = false;

  function showNotice(message) { notice.textContent = message; notice.classList.add('show'); }
  function clearNotice() { notice.textContent = ''; notice.classList.remove('show'); }
  function updateWhatsapp() {
    const name = storeName.value.trim();
    const message = `أنا اشتركت في متجر ودفعت واسم متجري ${name || '[اسم المتجر]'}`;
    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }
  function selectMethod(method) {
    const visa = method === 'visa';
    visaMethod.classList.toggle('active', visa);
    vodafoneMethod.classList.toggle('active', !visa);
    visaPanel.hidden = !visa;
    vodafonePanel.hidden = visa;
    clearNotice();
  }
  async function ensureApplication() {
    if (applicationSubmitted) return true;
    const name = storeName.value.trim();
    const phone = supportPhone.value.trim();
    const file = storeImage.files?.[0];
    if (name.length < 2) { showNotice('اكتبي اسم المتجر أولاً.'); return false; }
    if (!/^\+?[0-9]{8,16}$/.test(phone.replace(/[\s()-]/g, ''))) { showNotice('اكتبي رقم دعم صحيحاً مع مفتاح الدولة.'); return false; }
    if (!file) { showNotice('اختاري صورة للمتجر أولاً.'); return false; }
    if (!window.LovaraPartnerOnboarding?.submitApplication) { showNotice('تعذر تجهيز طلب المتجر. أعيدي تحميل الصفحة.'); return false; }
    try {
      await window.LovaraPartnerOnboarding.submitApplication(name, phone, file);
      applicationSubmitted = true;
      showNotice('تم تسجيل طلبك كمعلّق. بعد الدفع، الموافقة النهائية تتم يدوياً من إدارة LOVARA.');
      return true;
    } catch (error) { showNotice(error.message || 'تعذر تسجيل طلب المتجر.'); return false; }
  }
  visaMethod.addEventListener('click', () => selectMethod('visa'));
  vodafoneMethod.addEventListener('click', () => selectMethod('vodafone'));
  storeName.addEventListener('input', updateWhatsapp);
  $('copyNumber').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('01066730225'); showNotice('تم نسخ رقم فودافون كاش.'); }
    catch (_) { showNotice('انسخي الرقم يدوياً: 01066730225'); }
  });
  $('whatsappLink').addEventListener('click', async event => {
    event.preventDefault();
    if (!(await ensureApplication())) return;
    updateWhatsapp();
    window.open(whatsappLink.href, '_blank', 'noopener');
  });
  $('startVisa').addEventListener('click', async () => {
    if (!(await ensureApplication())) return;
    const name = storeName.value.trim();
    clearNotice();
    $('loading').classList.add('show');
    $('startVisa').disabled = true;
    try {
      const response = await fetch('/api/xpay/create-partnership-checkout', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ storeName: name }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.clientSecret) throw new Error(data.error || 'تعذر تجهيز بوابة الدفع.');
      if (typeof XPay !== 'function') throw new Error('تعذر تحميل بوابة الدفع.');
      const xpay = XPay('pk_live_VXKBtN5Mi6kkRICZvZPA3UFmfykPwXm5');
      checkout = await xpay.initCheckout({ clientSecret: data.clientSecret, appearance: { colorMode: 'light', borderStyle: 'rounded', colors: { primary: '#c9a87c' } }, locale: 'ar' });
      const element = checkout.getElements().create('payment');
      element.mount('#xpay-payment-element');
      element.on('change', event => { paymentReady = !!event.complete; $('confirmVisa').disabled = !paymentReady || !checkout.canConfirm; });
      $('xpayBox').classList.add('show');
      $('confirmVisa').disabled = true;
    } catch (error) { showNotice(error.message || 'تعذر تجهيز بوابة الدفع.'); $('startVisa').disabled = false; }
    finally { $('loading').classList.remove('show'); }
  });
  $('confirmVisa').addEventListener('click', async () => {
    if (!checkout || !paymentReady) return showNotice('أكملي بيانات البطاقة أولاً.');
    $('confirmVisa').disabled = true;
    try {
      const result = await checkout.confirm({ customerDetails: { name: storeName.value.trim() }, redirect: 'if_required' });
      if (result?.type === 'error') throw new Error(result.error?.message || 'تعذر إتمام الدفع.');
      showNotice('تم إرسال عملية الدفع. طلبك ما زال بانتظار موافقة إدارة LOVARA يدوياً.');
    } catch (error) { showNotice(error.message || 'تعذر إتمام الدفع.'); $('confirmVisa').disabled = false; }
  });
  updateWhatsapp();
})();
