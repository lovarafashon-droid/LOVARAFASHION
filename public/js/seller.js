(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const db = firebase.firestore();
  const auth = firebase.auth();
  let activeUser = null;
  let activeShop = null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const stampDate = value => value?.toDate ? value.toDate() : new Date(value || 0);
  function show(id) { $(id)?.classList.remove('hidden'); }
  function hide(id) { $(id)?.classList.add('hidden'); }
  function toast(el, text, error = false) { if (!el) return; el.textContent = text; el.className = error ? 'error' : 'ok'; }

  function preview(inputId, imageId) {
    $(inputId)?.addEventListener('change', () => {
      const file = $(inputId).files?.[0];
      const image = $(imageId);
      if (!file || !image) return;
      image.src = URL.createObjectURL(file);
      image.classList.remove('hidden');
    });
  }

  async function loadSeller(user) {
    activeUser = user;
    hide('loadingPanel');
    show('logoutButton');
    hide('loginPanel');
    const userSnap = await db.collection('users').doc(user.uid).get();
    const profile = userSnap.exists ? userSnap.data() : {};
    if (profile.storeId) {
      const shopSnap = await db.collection('shops').doc(profile.storeId).get();
      if (shopSnap.exists) {
        activeShop = { id: shopSnap.id, ...shopSnap.data() };
        const expiresAt = stampDate(activeShop.expiresAt);
        if (activeShop.active === true && expiresAt > new Date()) {
          showSellerTools(expiresAt);
          return;
        }
        $('statusPanel').innerHTML = activeShop.active === true
          ? '<div class="notice">انتهى اشتراك متجرك. تواصل مع إدارة LOVARA لتمديده.</div>'
          : '<div class="notice">متجرك موقوف حاليًا. تواصل مع إدارة LOVARA للاستفسار.</div>';
        show('statusPanel');
        return;
      }
    }

    const requestSnap = await db.collection('storeRequests').doc(user.uid).get();
    if (requestSnap.exists) {
      const request = requestSnap.data();
      if (request.status === 'pending') {
        $('statusPanel').innerHTML = '<div class="notice"><strong>طلبك قيد المراجعة.</strong><br>سنرسل لك تحديثًا بعد مراجعة بيانات المتجر.</div>';
        show('statusPanel');
        return;
      }
      if (request.status === 'approved' && !profile.storeId) {
        $('statusPanel').innerHTML = '<div class="notice">تمت الموافقة على طلبك. حدّثي الصفحة بعد لحظات لفتح لوحة المتجر.</div>';
        show('statusPanel');
        return;
      }
      if (request.status === 'rejected') {
        $('statusPanel').innerHTML = '<div class="notice">لم تتم الموافقة على الطلب السابق. يمكنك تحديث بياناتك وإرسال طلب جديد.</div>';
        show('statusPanel');
      } else if (request.status === 'draft') {
        $('statusPanel').innerHTML = '<div class="notice">طلبك غير مكتمل. أكملي بيانات المتجر والصورة لإرساله للمراجعة.</div>';
        show('statusPanel');
        $('applicationName').value = request.storeName || '';
        $('applicationPhone').value = request.supportPhone || '';
      }
    }
    show('applyPanel');
  }

  function showSellerTools(expiresAt) {
    hide('statusPanel');
    hide('applyPanel');
    show('sellerTools');
    $('sellerStoreName').textContent = activeShop.storeName;
    const href = `${location.origin}/store/${encodeURIComponent(activeShop.slug || activeShop.id)}`;
    $('sellerStoreLink').href = href;
    $('sellerStoreLink').textContent = href;
    $('sellerExpiry').textContent = `تاريخ انتهاء الاشتراك: ${expiresAt.toLocaleDateString('ar-EG')}`;
    loadProducts();
  }

  async function submitApplication(event) {
    event.preventDefault();
    const button = $('applicationForm').querySelector('button[type="submit"]');
    const note = $('applicationMessage');
    const file = $('applicationImage').files?.[0];
    if (!file) return toast(note, 'اختاري صورة للمتجر.', true);
    button.disabled = true;
    try {
      await window.LovaraPartnerOnboarding.submitApplication($('applicationName').value, $('applicationPhone').value, file);
      toast(note, 'تم إرسال الطلب للإدارة للمراجعة.');
      $('applicationForm').reset();
      $('applicationPreview').classList.add('hidden');
      $('statusPanel').innerHTML = '<div class="notice"><strong>طلبك قيد المراجعة.</strong><br>سنرسل لك تحديثًا بعد مراجعة بيانات المتجر.</div>';
      show('statusPanel');
      hide('applyPanel');
    } catch (error) {
      toast(note, error.message || 'تعذر إرسال الطلب.', true);
    } finally { button.disabled = false; }
  }

  async function loadProducts() {
    const list = $('sellerProducts');
    list.innerHTML = '<p class="muted">جارٍ تحميل المنتجات…</p>';
    try {
      const snapshot = await db.collection('shops').doc(activeShop.id).collection('products').get();
      if (snapshot.empty) { list.innerHTML = '<p class="muted">ما فيش منتجات مضافة لحد دلوقتي.</p>'; return; }
      list.innerHTML = '';
      snapshot.docs.forEach(doc => {
        const item = doc.data();
        const row = document.createElement('article');
        row.className = 'product';
        row.innerHTML = `<img src="${escapeHtml(item.imageUrl || '')}" alt="${escapeHtml(item.name)}"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category || '')} · EGP ${Number(item.price || 0).toFixed(2)}</p><p>${escapeHtml(item.description || '')}</p></div><div class="product-actions"><button class="btn danger" type="button" data-delete="${escapeHtml(doc.id)}">حذف</button></div>`;
        list.appendChild(row);
      });
      list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذا المنتج؟')) return;
        button.disabled = true;
        try {
          await db.collection('shops').doc(activeShop.id).collection('products').doc(button.dataset.delete).delete();
          await loadProducts();
        } catch (error) { alert(error.message || 'تعذر حذف المنتج.'); button.disabled = false; }
      }));
    } catch (error) {
      console.error('[LOVARA seller products]', error);
      list.innerHTML = '<p class="error">تعذر تحميل المنتجات. أعيدي تحميل الصفحة.</p>';
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = $('saveProduct');
    const note = $('productMessage');
    const file = $('productImage').files?.[0];
    if (!file) return toast(note, 'اختاري صورة للمنتج.', true);
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    try {
      const productRef = db.collection('shops').doc(activeShop.id).collection('products').doc();
      const imageUrl = await window.LovaraPartnerOnboarding.uploadImage(file, 'store-product', activeShop.id);
      await productRef.set({
        name: $('productName').value.trim(),
        category: $('productCategory').value.trim(),
        price: Number($('productPrice').value),
        description: $('productDescription').value.trim(),
        imageUrl,
        ownerUid: activeUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      $('productForm').reset();
      $('productPreview').classList.add('hidden');
      toast(note, 'تمت إضافة المنتج إلى متجرك.');
      await loadProducts();
    } catch (error) {
      console.error('[LOVARA seller save]', error);
      toast(note, error.code === 'permission-denied' ? 'انتهى الاشتراك أو لا تملك صلاحية هذا المتجر.' : (error.message || 'تعذر حفظ المنتج.'), true);
    } finally { button.disabled = false; button.textContent = 'إضافة المنتج'; }
  }

  $('loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    $('loginError').textContent = '';
    try { await auth.signInWithEmailAndPassword($('loginEmail').value.trim(), $('loginPassword').value); }
    catch (error) { $('loginError').textContent = 'تعذر تسجيل الدخول بهذا الحساب.'; }
  });
  $('logoutButton')?.addEventListener('click', () => auth.signOut());
  $('applicationForm')?.addEventListener('submit', submitApplication);
  $('productForm')?.addEventListener('submit', saveProduct);
  preview('applicationImage', 'applicationPreview');
  preview('productImage', 'productPreview');
  auth.onAuthStateChanged(user => {
    if (!user) {
      activeUser = null;
      hide('loadingPanel');
      show('loginPanel');
      hide('logoutButton');
      return;
    }
    loadSeller(user).catch(error => {
      console.error('[LOVARA seller init]', error);
      $('statusPanel').textContent = 'تعذر التحقق من حالة المتجر. أعيدي تحميل الصفحة.';
      show('statusPanel');
    });
  });
})();
