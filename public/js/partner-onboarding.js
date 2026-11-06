(function () {
  'use strict';

  const db = () => firebase.firestore();
  const auth = () => firebase.auth();
  const $ = id => document.getElementById(id);
  const lang = () => localStorage.getItem('lovara_lang') || 'ar';
  const isArabic = () => lang() !== 'en';
  const text = (ar, en) => isArabic() ? ar : en;

  function ensureOfferModal() {
    if ($('partnerOfferModal') || !document.body) return;
    if (!$('partnerOfferModalStyles')) {
      const style = document.createElement('style');
      style.id = 'partnerOfferModalStyles';
      style.textContent = `.partner-offer-dynamic{position:fixed;inset:0;z-index:12000;display:none;place-items:center;padding:18px;background:rgba(28,24,20,.58)}.partner-offer-dynamic.show,.partner-offer-dynamic.active{display:grid}.partner-offer-dynamic__card{position:relative;width:min(100%,460px);padding:34px 26px 25px;border:1px solid #eee5d8;border-radius:22px;background:#fffdf9;box-shadow:0 24px 70px rgba(0,0,0,.22);text-align:center;direction:rtl;font-family:'Noto Sans Arabic',Arial,sans-serif}.partner-offer-dynamic__close{position:absolute;top:12px;left:12px;width:34px;height:34px;border:0;border-radius:50%;background:#f3efe8;color:#5e5141;font-size:21px;cursor:pointer}.partner-offer-dynamic__brand{color:#c9a87c;font:600 15px Georgia,serif;letter-spacing:3px}.partner-offer-dynamic__card h2{margin:14px 0 9px;color:#252321;font-size:22px;line-height:1.6}.partner-offer-dynamic__card p{margin:0 auto 22px;max-width:370px;color:#6f6a63;font-size:13px;line-height:1.9}.partner-offer-dynamic__actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.partner-offer-dynamic__actions button{min-height:44px;padding:10px 18px;border:1px solid #d8c9b4;border-radius:10px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.partner-offer-dynamic__yes{background:#c9a87c;color:#fff}.partner-offer-dynamic__no{background:#fff;color:#554c42}.partner-offer-dynamic__actions button:disabled{opacity:.65;cursor:wait}@media(max-width:480px){.partner-offer-dynamic__card{padding:32px 19px 21px}.partner-offer-dynamic__card h2{font-size:19px}}`;
      document.head.appendChild(style);
    }
    const modal = document.createElement('div');
    modal.id = 'partnerOfferModal';
    modal.className = 'partner-offer-dynamic';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<section class="partner-offer-dynamic__card" role="dialog" aria-modal="true" aria-labelledby="partnerOfferTitle"><button class="partner-offer-dynamic__close" id="partnerOfferClose" type="button" aria-label="${text('إغلاق', 'Close')}">×</button><div class="partner-offer-dynamic__brand">LOVARA</div><h2 id="partnerOfferTitle">${text('هل تريد عمل شراكة مع LOVARA؟', 'Would you like to partner with LOVARA?')}</h2><p>${text('أنشئ متجرك واعرض منتجاتك على LOVARA. حسابك يظل حساب عميل عادي حتى مراجعة طلب الشراكة.', 'Create your store and list products on LOVARA. Your account remains a regular customer account while your partnership request is reviewed.')}</p><div class="partner-offer-dynamic__actions"><button class="partner-offer-dynamic__yes" id="partnerAccept" type="button">${text('نعم، أريد الشراكة', 'Yes, I want to partner')}</button><button class="partner-offer-dynamic__no" id="partnerDecline" type="button">${text('لا، شكرًا', 'No, thank you')}</button></div></section>`;
    document.body.appendChild(modal);
  }

  function notify(message, isError = false) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, isError ? 'error' : 'success');
      return;
    }
    const toast = $('partnerToast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    } else if (isError) {
      alert(message);
    }
  }

  function showModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.add('show', 'active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function hideModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('show', 'active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error(text('اختاري ملف صورة صالحًا.', 'Choose a valid image file.')));
      if (file.size > 10 * 1024 * 1024) return reject(new Error(text('حجم الصورة يجب ألا يتجاوز 10 ميجابايت.', 'Image must be 10 MB or smaller.')));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(text('تعذر قراءة الصورة.', 'Could not read the image.')));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error(text('الصورة غير صالحة.', 'The image is invalid.')));
        image.onload = () => {
          const max = 1200;
          const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file, kind, id) {
    const user = auth().currentUser;
    if (!user) throw new Error(text('سجلي الدخول أولًا.', 'Please sign in first.'));
    const dataUrl = await compressImage(file);
    const response = await fetch('/api/store-image-upload', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ kind, id, dataUrl })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.imageUrl) throw new Error(result.error || text('فشل رفع الصورة.', 'Image upload failed.'));
    return result.imageUrl;
  }

  function normalizePhone(value) {
    return String(value || '').trim().replace(/[\s()-]/g, '');
  }

  async function submitApplication(storeName, supportPhone, file) {
    const user = auth().currentUser;
    if (!user) throw new Error(text('سجلي الدخول أولًا.', 'Please sign in first.'));
    const name = String(storeName || '').trim();
    const phone = normalizePhone(supportPhone);
    if (name.length < 2 || name.length > 80) throw new Error(text('اسم المتجر مطلوب (من حرفين إلى 80 حرفًا).', 'Store name must be 2–80 characters.'));
    if (!/^\+?[0-9]{8,16}$/.test(phone)) throw new Error(text('أدخلي رقم دعم صحيحًا مع مفتاح الدولة.', 'Enter a valid support number with country code.'));

    const requestRef = db().collection('storeRequests').doc(user.uid);
    const old = await requestRef.get();
    if (old.exists) {
      const existing = old.data() || {};
      if (existing.ownerUid !== user.uid) throw new Error(text('لا يمكن الوصول إلى طلب هذا المتجر.', 'This store request is not accessible.'));
      if (existing.status === 'pending' && existing.imageUrl) {
        if (existing.storeName !== name || normalizePhone(existing.supportPhone) !== phone) {
          throw new Error(text('لديك طلب معلّق بالفعل. لا يمكن تغيير بياناته قبل مراجعة الإدارة.', 'You already have a pending request. Its details cannot be changed before review.'));
        }
        await db().collection('users').doc(user.uid).set({ partnerPromptAnswered: 'accepted' }, { merge: true });
        return { imageUrl: existing.imageUrl, existing: true };
      }
    }
    if (!file) throw new Error(text('اختاري صورة للمتجر.', 'Choose a store image.'));
    let requestData;
    if (!old.exists) {
      requestData = {
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        storeName: name,
        supportPhone: phone,
        imageUrl: '',
        status: 'draft',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await requestRef.set(requestData);
    } else {
      const existing = old.data();
      if (existing.ownerUid !== user.uid || !['draft', 'rejected'].includes(existing.status)) {
        throw new Error(text('يوجد طلب متجر قائم بالفعل، راجعي حالته من صفحة البائع.', 'A store request already exists. Check its status on the seller page.'));
      }
      requestData = {
        ownerUid: user.uid,
        ownerEmail: user.email || existing.ownerEmail || '',
        storeName: name,
        supportPhone: phone,
        imageUrl: '',
        status: 'draft',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await requestRef.update(requestData);
    }

    const imageUrl = await uploadImage(file, 'store-application', user.uid);
    await db().collection('users').doc(user.uid).set({ partnerPromptAnswered: 'accepted' }, { merge: true });
    return { imageUrl };
  }

  async function getApplication(user) {
    const activeUser = user || auth().currentUser;
    if (!activeUser) return null;
    const snapshot = await db().collection('storeRequests').doc(activeUser.uid).get();
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  }

  async function answerPrompt(answer, user) {
    const activeUser = user || auth().currentUser;
    if (activeUser) {
      await db().collection('users').doc(activeUser.uid).set({ partnerPromptAnswered: answer }, { merge: true });
    }
  }

  async function offer(user) {
    try {
      ensureOfferModal();
      if (!$('partnerOfferModal')) return;
      const snapshot = await db().collection('users').doc(user.uid).get();
      const application = await db().collection('storeRequests').doc(user.uid).get();
      if (application.exists || snapshot.data()?.partnerPromptAnswered) return;
      showModal('partnerOfferModal');
    } catch (error) {
      console.warn('[LOVARA partner] Could not check prompt state:', error.message);
    }
  }

  function init() {
    ensureOfferModal();
    $('partnerDecline')?.addEventListener('click', async () => {
      try {
        await answerPrompt('declined');
        hideModal('partnerOfferModal');
      } catch (error) { notify(error.message, true); }
    });

    $('partnerAccept')?.addEventListener('click', async () => {
      const button = $('partnerAccept');
      if (button) button.disabled = true;
      try {
        await answerPrompt('accepted');
        window.location.href = '/partnership';
      } catch (error) {
        if (button) button.disabled = false;
        notify(error.message, true);
      }
    });

    $('partnerOfferClose')?.addEventListener('click', () => hideModal('partnerOfferModal'));
    $('partnerApplicationClose')?.addEventListener('click', () => hideModal('partnerApplicationModal'));
    ['partnerOfferModal', 'partnerApplicationModal'].forEach(id => {
      $(id)?.addEventListener('click', event => { if (event.target === event.currentTarget) hideModal(id); });
    });

    const imageInput = $('partnerStoreImage');
    const preview = $('partnerStoreImagePreview');
    imageInput?.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      if (!file || !preview) return;
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    });

    $('partnerApplicationForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('partnerSubmitButton');
      const file = imageInput?.files?.[0];
      if (!file) return notify(text('اختاري صورة للمتجر.', 'Choose a store image.'), true);
      button.disabled = true;
      button.textContent = text('جارٍ إرسال الطلب…', 'Submitting…');
      try {
        await submitApplication($('partnerStoreName').value, $('partnerSupportPhone').value, file);
        hideModal('partnerApplicationModal');
        notify(text('تم إرسال طلب الشراكة للإدارة للمراجعة.', 'Your partner request has been sent for review.'));
        $('partnerApplicationForm').reset();
        if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
      } catch (error) {
        notify(error.message || text('تعذر إرسال الطلب.', 'Could not submit the request.'), true);
      } finally {
        button.disabled = false;
        button.textContent = text('إرسال الطلب', 'Submit request');
      }
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        hideModal('partnerOfferModal');
        hideModal('partnerApplicationModal');
      }
    });
  }

  window.LovaraPartnerOnboarding = { offer, submitApplication, getApplication, uploadImage, showModal, hideModal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
