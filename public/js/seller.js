(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const db = firebase.firestore();
  const auth = firebase.auth();
  let activeUser = null;
  let activeShop = null;
  let editingProductId = null;
  let editingProduct = null;
  let ordersUnsubscribe = null;
  let sellerOrderDocs = [];
  const sellerStatuses = { new: 'جديد', confirmed: 'تم التأكيد', preparing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const stampDate = value => value?.toDate ? value.toDate() : new Date(value || 0);
  function show(id) { $(id)?.classList.remove('hidden'); }
  function hide(id) { $(id)?.classList.add('hidden'); }
  function toast(el, text, error = false) { if (!el) return; el.textContent = text; el.className = error ? 'error' : 'ok'; }

  function openSellerHome() {
    show('sellerHome');
    hide('sellerManagementView');
    hide('sellerOrdersView');
  }

  function openManagementView() {
    hide('sellerHome');
    show('sellerManagementView');
    hide('sellerOrdersView');
    loadProducts();
  }

  function openOrdersView() {
    hide('sellerHome');
    hide('sellerManagementView');
    show('sellerOrdersView');
    renderSellerOrders();
  }

  function formattedDate(value) {
    const date = stampDate(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'تاريخ غير متاح';
  }

  function renderSellerOrders() {
    const list = $('sellerOrders');
    if (!list) return;
    if (!sellerOrderDocs.length) {
      list.innerHTML = '<div class="panel muted">لا توجد طلبات لمتجرك حتى الآن. ستظهر الطلبات الجديدة هنا تلقائيًا.</div>';
      return;
    }
    list.innerHTML = sellerOrderDocs.map(({ id, data }) => {
      const customer = data.customer || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const status = sellerStatuses[data.sellerStatus] ? data.sellerStatus : 'new';
      const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'عميل';
      const phone = String(customer.phone || '');
      const phoneHref = phone.replace(/[^0-9+]/g, '');
      const address = [customer.address, customer.city, customer.governorate].filter(Boolean).join('، ');
      const payment = data.payment || {};
      const paymentLabel = payment.method === 'visa' ? 'بطاقة بنكية' : 'الدفع عند الاستلام';
      const paymentState = payment.status === 'paid' ? 'مدفوع إلكترونيًا' : payment.status === 'cash_on_delivery' ? 'يُحصّل عند التسليم' : 'بانتظار الدفع';
      const itemHtml = items.map(item => {
        const quantity = Math.max(1, Number(item.quantity || item.qty) || 1);
        const options = [item.size && item.size !== '-' ? `المقاس: ${Array.isArray(item.size) ? item.size.join('، ') : item.size}` : '', item.color && item.color !== '-' ? `اللون: ${Array.isArray(item.color) ? item.color.join('، ') : item.color}` : ''].filter(Boolean).join(' · ');
        return `<li><strong>${escapeHtml(item.name || 'منتج')}</strong> × ${quantity} — EGP ${(Number(item.price || 0) * quantity).toFixed(2)}${options ? `<div class="muted">${escapeHtml(options)}</div>` : ''}</li>`;
      }).join('');
      const options = Object.entries(sellerStatuses).map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('');
      return `<article class="order-card" data-order-card="${escapeHtml(id)}"><div class="order-top"><div><h3>طلب #${escapeHtml(data.orderNumber || id)}</h3><div class="order-meta">${formattedDate(data.date || data.createdAt)} · <span class="status-pill">${sellerStatuses[status]}</span></div></div><strong>${escapeHtml(data.totals?.total || data.totals?.subtotal || 'المبلغ غير متاح')}</strong></div><div class="order-customer"><strong>${escapeHtml(fullName)}</strong><br>${phone ? `<a class="order-phone" href="tel:${escapeHtml(phoneHref)}">${escapeHtml(phone)}</a>` : 'لا يوجد رقم هاتف'}<br>${escapeHtml(address || 'لا يوجد عنوان')} ${customer.notes ? `<br><span class="muted">ملاحظات: ${escapeHtml(customer.notes)}</span>` : ''}</div><ul class="order-items">${itemHtml}</ul><div class="order-bottom"><div class="order-payment">طريقة الدفع: ${paymentLabel} · ${paymentState}</div><div class="order-controls"><label>حالة الطلب<select class="order-status-select">${options}</select></label><button class="btn" type="button" data-update-order="${escapeHtml(id)}">حفظ الحالة</button></div></div></article>`;
    }).join('');

    list.querySelectorAll('[data-update-order]').forEach(button => button.addEventListener('click', async () => {
      if (!activeShop) return;
      const card = button.closest('[data-order-card]');
      const nextStatus = card?.querySelector('.order-status-select')?.value;
      if (!sellerStatuses[nextStatus]) return;
      button.disabled = true;
      try {
        await db.collection('shops').doc(activeShop.id).collection('orders').doc(button.dataset.updateOrder).update({
          sellerStatus: nextStatus,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.error('[LOVARA seller order status]', error);
        alert(error.code === 'permission-denied' ? 'ليس لديك صلاحية لتعديل حالة هذا الطلب.' : 'تعذر تحديث حالة الطلب. حاول مرة أخرى.');
      } finally { button.disabled = false; }
    }));
  }

  function watchSellerOrders() {
    if (!activeShop || ordersUnsubscribe) return;
    ordersUnsubscribe = db.collection('shops').doc(activeShop.id).collection('orders').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
      sellerOrderDocs = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
      const newCount = sellerOrderDocs.filter(order => !order.data.sellerStatus || order.data.sellerStatus === 'new').length;
      const badge = $('sellerOrderCount');
      if (badge) badge.textContent = String(newCount);
      if (!$('sellerOrdersView')?.classList.contains('hidden')) renderSellerOrders();
    }, error => {
      console.error('[LOVARA seller orders]', error);
      sellerOrderDocs = [];
      if ($('sellerOrders')) $('sellerOrders').innerHTML = '<div class="panel error">تعذر تحميل الطلبات. تحقق من الاتصال ثم أعد فتح الصفحة.</div>';
    });
  }

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
    hide('sellerTools');
    hide('statusPanel');
    hide('applyPanel');
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
        show('sellerTools');
        openSellerHome();
        hide('openManageView');
        watchSellerOrders();
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
    openSellerHome();
    show('openManageView');
    $('sellerStoreName').textContent = activeShop.storeName;
    const href = `${location.origin}/store/${encodeURIComponent(activeShop.slug || activeShop.id)}`;
    $('sellerStoreLink').href = href;
    $('sellerStoreLink').textContent = href;
    $('sellerExpiry').textContent = `تاريخ انتهاء الاشتراك: ${expiresAt.toLocaleDateString('ar-EG')}`;
    watchSellerOrders();
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
        const saleActive = Number(item.salePrice) > 0 && Number(item.saleEndsAt) > Date.now();
        const priceLabel = saleActive
          ? `<p><del>EGP ${Number(item.price || 0).toFixed(2)}</del> <strong class="ok">EGP ${Number(item.salePrice).toFixed(2)}</strong> · العرض حتى ${formattedDate(item.saleEndsAt)}</p>`
          : `<p>EGP ${Number(item.price || 0).toFixed(2)}${Number(item.salePrice) > 0 ? ' · انتهى العرض' : ''}</p>`;
        row.innerHTML = `<img src="${escapeHtml(item.imageUrl || '')}" alt="${escapeHtml(item.name)}"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category || '')}</p>${priceLabel}<p>${escapeHtml(item.description || '')}</p></div><div class="product-actions"><button class="btn" type="button" data-edit="${escapeHtml(doc.id)}">تعديل</button><button class="btn danger" type="button" data-delete="${escapeHtml(doc.id)}">حذف</button></div>`;
      list.appendChild(row);
      });
      list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
        const doc = snapshot.docs.find(item => item.id === button.dataset.edit);
        if (doc) beginProductEdit(doc.id, doc.data() || {});
      }));
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

  function beginProductEdit(id, product) {
    editingProductId = id;
    editingProduct = product;
    $('productName').value = product.name || '';
    $('productCategory').value = product.category || '';
    $('productPrice').value = Number(product.price || 0);
    $('productDescription').value = product.description || '';
    $('productSalePrice').value = Number(product.salePrice || 0) > 0 ? Number(product.salePrice) : '';
    const endsAt = Number(product.saleEndsAt) || 0;
    $('productSaleEnds').value = endsAt ? new Date(endsAt - new Date(endsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    if (product.imageUrl) { $('productPreview').src = product.imageUrl; $('productPreview').classList.remove('hidden'); }
    $('productFormTitle').textContent = `تعديل المنتج: ${product.name || ''}`;
    $('saveProduct').textContent = 'حفظ التعديلات';
    show('cancelProductEdit');
    $('productForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelProductEdit() {
    editingProductId = null;
    editingProduct = null;
    $('productForm').reset();
    $('productPreview').classList.add('hidden');
    $('productFormTitle').textContent = 'إضافة منتج';
    $('saveProduct').textContent = 'إضافة المنتج';
    hide('cancelProductEdit');
    toast($('productMessage'), 'تم إلغاء التعديل.');
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = $('saveProduct');
    const note = $('productMessage');
    const file = $('productImage').files?.[0];
    if (!file && !editingProduct) return toast(note, 'اختاري صورة للمنتج.', true);
    const price = Number($('productPrice').value);
    const saleValue = $('productSalePrice').value.trim();
    const salePrice = saleValue ? Number(saleValue) : 0;
    const saleEndInput = $('productSaleEnds').value;
    const saleEndsAt = saleEndInput ? new Date(saleEndInput).getTime() : 0;
    if (saleValue && (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= price || !Number.isFinite(saleEndsAt) || saleEndsAt <= Date.now())) {
      return toast(note, 'سعر العرض يجب أن يكون أقل من السعر الأصلي، مع تحديد موعد انتهاء في المستقبل.', true);
    }
    if (!saleValue && saleEndInput) return toast(note, 'أدخل سعر العرض أو أفرغ تاريخ انتهاء العرض.', true);
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    try {
      const productsRef = db.collection('shops').doc(activeShop.id).collection('products');
      const productRef = editingProductId ? productsRef.doc(editingProductId) : productsRef.doc();
      const imageUrl = file
        ? await window.LovaraPartnerOnboarding.uploadImage(file, 'store-product', activeShop.id)
        : String(editingProduct?.imageUrl || '');
      const data = {
        name: $('productName').value.trim(),
        category: $('productCategory').value.trim(),
        price,
        salePrice,
        saleEndsAt: salePrice ? saleEndsAt : 0,
        description: $('productDescription').value.trim(),
        imageUrl,
        ownerUid: activeUser.uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (!editingProductId) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      if (editingProductId) await productRef.update(data);
      else await productRef.set(data);
      const wasEditing = !!editingProductId;
      $('productForm').reset();
      $('productPreview').classList.add('hidden');
      editingProductId = null;
      editingProduct = null;
      $('productFormTitle').textContent = 'إضافة منتج';
      button.textContent = 'إضافة المنتج';
      hide('cancelProductEdit');
      toast(note, wasEditing ? 'تم حفظ تعديلات المنتج والعرض.' : 'تمت إضافة المنتج إلى متجرك.');
      await loadProducts();
    } catch (error) {
      console.error('[LOVARA seller save]', error);
      toast(note, error.code === 'permission-denied' ? 'انتهى الاشتراك أو لا تملك صلاحية هذا المتجر.' : (error.message || 'تعذر حفظ المنتج.'), true);
    } finally { button.disabled = false; if (!editingProductId) button.textContent = 'إضافة المنتج'; else button.textContent = 'حفظ التعديلات'; }
  }

  $('loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    $('loginError').textContent = '';
    try { await auth.signInWithEmailAndPassword($('loginEmail').value.trim(), $('loginPassword').value); }
    catch (error) { $('loginError').textContent = 'تعذر تسجيل الدخول بهذا الحساب.'; }
  });
  $('logoutButton')?.addEventListener('click', () => auth.signOut());
  $('openManageView')?.addEventListener('click', openManagementView);
  $('openOrdersView')?.addEventListener('click', openOrdersView);
  $('backFromManage')?.addEventListener('click', openSellerHome);
  $('backFromOrders')?.addEventListener('click', openSellerHome);
  $('applicationForm')?.addEventListener('submit', submitApplication);
  $('productForm')?.addEventListener('submit', saveProduct);
  $('cancelProductEdit')?.addEventListener('click', cancelProductEdit);
  preview('applicationImage', 'applicationPreview');
  preview('productImage', 'productPreview');
  auth.onAuthStateChanged(user => {
    if (!user) {
      if (ordersUnsubscribe) ordersUnsubscribe();
      ordersUnsubscribe = null;
      sellerOrderDocs = [];
      activeUser = null;
      activeShop = null;
      hide('loadingPanel');
      hide('sellerTools');
      hide('statusPanel');
      hide('applyPanel');
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
