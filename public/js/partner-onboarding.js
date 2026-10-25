(function () {
  'use strict';

  const db = () => firebase.firestore();
  const auth = () => firebase.auth();
  const $ = id => document.getElementById(id);
  const lang = () => localStorage.getItem('lovara_lang') || 'ar';
  const isArabic = () => lang() !== 'en';
  const text = (ar, en) => isArabic() ? ar : en;

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
    document.body.style.overflow = 'hidden';
  }

  function hideModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('show', 'active');
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

  async function answerPrompt(answer, user) {
    const activeUser = user || auth().currentUser;
    if (activeUser) {
      await db().collection('users').doc(activeUser.uid).set({ partnerPromptAnswered: answer }, { merge: true });
    }
  }

  async function offer(user) {
    try {
      if (!$('partnerOfferModal') || !$('partnerApplicationModal')) return;
      const snapshot = await db().collection('users').doc(user.uid).get();
      const application = await db().collection('storeRequests').doc(user.uid).get();
      if (application.exists || snapshot.data()?.partnerPromptAnswered) return;
      showModal('partnerOfferModal');
    } catch (error) {
      console.warn('[LOVARA partner] Could not check prompt state:', error.message);
    }
  }

  function init() {
    $('partnerDecline')?.addEventListener('click', async () => {
      try {
        await answerPrompt('declined');
        hideModal('partnerOfferModal');
      } catch (error) { notify(error.message, true); }
    });

    $('partnerAccept')?.addEventListener('click', async () => {
      try {
        await answerPrompt('accepted');
        hideModal('partnerOfferModal');
        showModal('partnerApplicationModal');
      } catch (error) { notify(error.message, true); }
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

  window.LovaraPartnerOnboarding = { offer, submitApplication, uploadImage, showModal, hideModal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
