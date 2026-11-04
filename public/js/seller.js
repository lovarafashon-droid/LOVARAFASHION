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
  let sellerOrderFilter = 'new';
  let pendingCancelOrderId = '';
  const sellerStatuses = { new: 'جديد', confirmed: 'تم التأكيد', preparing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' };
  const sellerTransitions = { new: ['confirmed'], confirmed: ['preparing', 'shipped'], preparing: ['shipped'], shipped: ['delivered'], delivered: [], cancelled: [] };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const stampDate = value => value?.toDate ? value.toDate() : new Date(value || 0);
  const partnerPlans = window.LovaraPartnerPlans || {};
  let sellerProductCount = 0;
  function activePlan() { return partnerPlans[activeShop?.subscriptionPlan] || null; }
  async function partnerProductAction(action, extra = {}) {
    if (!activeUser || !activeShop) throw new Error('تعذر التحقق من حساب المتجر.');
    const token = await activeUser.getIdToken();
    const response = await fetch('/api/partner-products', {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, storeId: activeShop.id, ...extra })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذر حفظ التغيير.');
    return result;
  }
  function renderPlanEntitlements() {
    const plan = activePlan();
    if (!plan) {
      $('sellerPlanDetails').textContent = 'تعذر التحقق من مزايا باقة المتجر. تواصلي مع إدارة LOVARA.';
      $('storeSettingsPanel')?.classList.add('hidden');
      return;
    }
    $('sellerPlanDetails').textContent = `${plan.name} · ${plan.durationMonths || plan.durationDays} ${plan.durationMonths ? (plan.durationMonths === 1 ? 'شهر' : 'أشهر') : 'أيام'} · حتى ${plan.productLimit} منتجًا`;
    $('productSalePriceField')?.classList.toggle('hidden', !plan.discounts);
    $('productSaleEndsField')?.classList.toggle('hidden', !plan.discounts);
    $('storeSettingsPanel')?.classList.toggle('hidden', !plan.storeBranding && !plan.advancedStorefront);
    $('storeSettingsPlanHint').textContent = plan.advancedStorefront
      ? 'تتيح باقتك تخصيص اللون والرسالة والعنوان والوصف، كما يمكنك إعداد خصومات بموعد انتهاء وعدّاد.'
      : 'تخصيص لون المتجر ورسالة الترحيب متاح في باقة 3 أشهر و6 أشهر.';
    $('storeThemeColor').disabled = !plan.storeBranding;
    $('storeAnnouncementText').disabled = !plan.storeBranding;
    document.querySelectorAll('.premium-setting input, .premium-setting textarea').forEach(field => { field.disabled = !plan.advancedStorefront; });
    document.querySelectorAll('.premium-setting').forEach(field => field.classList.toggle('hidden', !plan.advancedStorefront));
    $('storeThemeColor').value = /^#[0-9a-f]{6}$/i.test(activeShop.themeColor || '') ? activeShop.themeColor : '#8c7355';
    $('storeAnnouncementText').value = activeShop.announcementText || '';
    $('storeHeroTitle').value = activeShop.heroTitle || '';
    $('storeHeroDescription').value = activeShop.heroDescription || '';
    renderProductQuota(sellerProductCount);
  }
  function renderProductQuota(count) {
    sellerProductCount = count;
    const plan = activePlan();
    if (!plan || !$('sellerProductQuota')) return;
    $('sellerProductQuota').textContent = `استخدمتِ ${count} من ${plan.productLimit} منتجًا في باقتك.`;
    $('saveProduct').disabled = !editingProductId && count >= plan.productLimit;
    if (!editingProductId && count >= plan.productLimit) $('saveProduct').textContent = 'وصلتِ إلى حد الباقة';
    else if (!editingProductId) $('saveProduct').textContent = 'إضافة المنتج';
  }
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

  function statusForSellerOrder(data) {
    const status = String(data?.sellerStatus || '').toLowerCase();
    if (sellerStatuses[status]) return status;
    return String(data?.status || '').toLowerCase() === 'cancelled' ? 'cancelled' : 'new';
  }

  function isPaidPayment(payment = {}) {
    return payment.paid === true || ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(String(payment.status || '').toLowerCase());
  }

  function canSellerCancel(data, status) {
    return ['new', 'confirmed', 'preparing'].includes(status)
      && String(data?.payment?.method || '').toLowerCase() === 'cod'
      && !isPaidPayment(data?.payment || {});
  }

  function updateOrderTabCounts() {
    const counts = { new: 0, confirmed: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0, all: sellerOrderDocs.length };
    sellerOrderDocs.forEach(order => { counts[statusForSellerOrder(order.data)] += 1; });
    Object.entries(counts).forEach(([status, count]) => {
      const badge = document.querySelector(`[data-seller-count="${status}"]`);
      if (badge) badge.textContent = String(count);
    });
    const newCount = $('sellerOrderCount');
    if (newCount) newCount.textContent = String(counts.new);
  }

  function setSellerOrderFilter(status) {
    sellerOrderFilter = status;
    $('sellerOrderTabs')?.querySelectorAll('[data-seller-filter]').forEach(button => {
      button.setAttribute('aria-selected', button.dataset.sellerFilter === status ? 'true' : 'false');
    });
    renderSellerOrders();
  }

  function setOrderActionMessage(text, error = false) {
    const message = $('orderActionMessage');
    if (!message) return;
    message.textContent = text;
    message.className = error ? 'error' : 'ok';
  }

  async function sendSellerOrderUpdate(orderId, status, reason = '') {
    if (!activeUser) throw new Error('سجّل الدخول مرة أخرى قبل تحديث الطلب.');
    const token = await activeUser.getIdToken();
    const response = await fetch('/api/partner-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'update-status', orderId, status, ...(reason ? { reason } : {}) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذر تحديث الطلب. حاول مرة أخرى.');
    return result;
  }

  function renderSellerOrders() {
    const list = $('sellerOrders');
    if (!list) return;
    updateOrderTabCounts();
    if (!sellerOrderDocs.length) {
      list.innerHTML = '<div class="muted">لا توجد طلبات لمتجرك حتى الآن.</div>';
      return;
    }
    const visibleOrders = sellerOrderFilter === 'all'
      ? sellerOrderDocs
      : sellerOrderDocs.filter(order => statusForSellerOrder(order.data) === sellerOrderFilter);
    if (!visibleOrders.length) {
      const emptyMessages = {
        new: 'لا توجد طلبات جديدة بانتظار التأكيد.',
        confirmed: 'لا توجد طلبات مؤكدة حاليًا.',
        preparing: 'لا توجد طلبات قيد التجهيز.',
        shipped: 'لا توجد طلبات في الطريق.',
        delivered: 'لا توجد طلبات تم تسليمها بعد.',
        cancelled: 'لا توجد طلبات ملغاة.',
        all: 'لا توجد طلبات لمتجرك حتى الآن.'
      };
      list.innerHTML = `<div class="muted">${emptyMessages[sellerOrderFilter] || emptyMessages.all}</div>`;
      return;
    }
    list.innerHTML = visibleOrders.map(({ id, data }) => {
      const customer = data.customer || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const status = statusForSellerOrder(data);
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
      const nextOptions = (sellerTransitions[status] || []).map(value => `<option value="${value}">${sellerStatuses[value]}</option>`).join('');
      const canCancel = canSellerCancel(data, status);
      const controls = nextOptions
        ? `<div class="order-controls"><label>نقل الطلب إلى<select class="order-status-select"><option value="">اختاري الحالة التالية</option>${nextOptions}</select></label><button class="btn" type="button" data-update-order="${escapeHtml(id)}" disabled>حفظ الحالة</button>${canCancel ? `<button class="btn danger" type="button" data-cancel-order="${escapeHtml(id)}">إلغاء الطلب</button>` : ''}</div>`
        : `<div class="order-controls">${canCancel ? `<button class="btn danger" type="button" data-cancel-order="${escapeHtml(id)}">إلغاء الطلب</button>` : '<span class="muted">لا توجد إجراءات أخرى لهذا الطلب.</span>'}</div>`;
      const reason = String(data.cancellationReason || '').trim();
      const cancellationBlock = status === 'cancelled'
        ? `<div class="order-cancel-reason"><strong>سبب الإلغاء:</strong> ${escapeHtml(reason || (data.cancelledBy === 'customer' ? 'ألغى العميل الطلب.' : 'لم يُسجل سبب الإلغاء.'))}</div>`
        : '';
      const paymentCancelNote = status !== 'cancelled' && ['new', 'confirmed', 'preparing'].includes(status)
        && String(payment.method || '').toLowerCase() !== 'cod'
        ? '<span class="muted">الطلب الإلكتروني لا يُلغى من لوحة المتجر.</span>'
        : '';
      return `<article class="order-card" data-order-card="${escapeHtml(id)}"><div class="order-top"><div><h3>طلب #${escapeHtml(data.orderNumber || id)}</h3><div class="order-meta">${formattedDate(data.date || data.createdAt)} · <span class="status-pill">${sellerStatuses[status]}</span>${data.cancelledBy ? ` · ${data.cancelledBy === 'customer' ? 'إلغاء العميل' : 'إلغاء المتجر'}` : ''}</div></div><strong>${escapeHtml(data.totals?.total || data.totals?.subtotal || 'المبلغ غير متاح')}</strong></div><div class="order-customer"><strong>${escapeHtml(fullName)}</strong><br>${phone ? `<a class="order-phone" href="tel:${escapeHtml(phoneHref)}">${escapeHtml(phone)}</a>` : 'لا يوجد رقم هاتف'}<br>${escapeHtml(address || 'لا يوجد عنوان')} ${customer.notes ? `<br><span class="muted">ملاحظات: ${escapeHtml(customer.notes)}</span>` : ''}</div><ul class="order-items">${itemHtml}</ul><div class="order-bottom"><div class="order-payment">طريقة الدفع: ${paymentLabel} · ${paymentState}</div>${controls}${paymentCancelNote}</div>${cancellationBlock}</article>`;
    }).join('');
  }

  function openSellerCancelModal(orderId) {
    const order = sellerOrderDocs.find(item => item.id === orderId);
    if (!order || !canSellerCancel(order.data, statusForSellerOrder(order.data))) return;
    pendingCancelOrderId = orderId;
    $('cancelOrderDescription').textContent = `اكتب سبب إلغاء الطلب رقم ${order.data.orderNumber || orderId}. سيظهر السبب في سجل الطلب.`;
    $('cancelOrderReason').value = '';
    $('cancelOrderError').textContent = '';
    show('cancelOrderModal');
    $('cancelOrderReason').focus();
  }

  function closeSellerCancelModal() {
    hide('cancelOrderModal');
    $('cancelOrderForm')?.reset();
    $('cancelOrderError').textContent = '';
    pendingCancelOrderId = '';
  }

  function bindSellerOrderActions() {
    const list = $('sellerOrders');
    list?.addEventListener('change', event => {
      if (!event.target.matches('.order-status-select')) return;
      const button = event.target.closest('[data-order-card]')?.querySelector('[data-update-order]');
      if (button) button.disabled = !event.target.value;
    });
    list?.addEventListener('click', async event => {
      const cancelButton = event.target.closest('[data-cancel-order]');
      if (cancelButton) {
        openSellerCancelModal(cancelButton.dataset.cancelOrder);
        return;
      }
      const button = event.target.closest('[data-update-order]');
      if (!button) return;
      const card = button.closest('[data-order-card]');
      const nextStatus = card?.querySelector('.order-status-select')?.value;
      if (!nextStatus || !sellerTransitions[statusForSellerOrder(sellerOrderDocs.find(order => order.id === button.dataset.updateOrder)?.data || {})]?.includes(nextStatus)) return;
      button.disabled = true;
      setOrderActionMessage('جارٍ تحديث حالة الطلب…');
      try {
        await sendSellerOrderUpdate(button.dataset.updateOrder, nextStatus);
        setOrderActionMessage(`تم نقل الطلب إلى قائمة «${sellerStatuses[nextStatus]}».`);
      } catch (error) {
        setOrderActionMessage(error.message || 'تعذر تحديث حالة الطلب. حاول مرة أخرى.', true);
        if (button.isConnected) button.disabled = false;
      }
    });
    $('sellerOrderTabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-seller-filter]');
      if (button) setSellerOrderFilter(button.dataset.sellerFilter);
    });
    $('cancelOrderForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const reason = $('cancelOrderReason').value.trim();
      if (reason.length < 5) {
        $('cancelOrderError').textContent = 'اكتب سببًا واضحًا لا يقل عن 5 أحرف.';
        return;
      }
      const button = $('confirmSellerCancellation');
      button.disabled = true;
      $('cancelOrderError').textContent = '';
      try {
        await sendSellerOrderUpdate(pendingCancelOrderId, 'cancelled', reason);
        closeSellerCancelModal();
        setOrderActionMessage('تم إلغاء الطلب ونقله إلى قائمة الطلبات الملغاة.');
        setSellerOrderFilter('cancelled');
      } catch (error) {
        $('cancelOrderError').textContent = error.message || 'تعذر إلغاء الطلب. حاول مرة أخرى.';
      } finally { button.disabled = false; }
    });
    $('dismissSellerCancellation')?.addEventListener('click', closeSellerCancelModal);
    $('cancelOrderModal')?.addEventListener('click', event => {
      if (event.target.matches('[data-cancel-dismiss]')) closeSellerCancelModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('cancelOrderModal')?.classList.contains('hidden')) closeSellerCancelModal();
    });
  }

  function watchSellerOrders() {
    if (!activeShop || ordersUnsubscribe) return;
    ordersUnsubscribe = db.collection('shops').doc(activeShop.id).collection('orders').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
      sellerOrderDocs = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
      updateOrderTabCounts();
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
    renderPlanEntitlements();
    watchSellerOrders();
  }

  async function submitApplication(event) {
    event.preventDefault();
    const draft = {
      storeName: String($('applicationName')?.value || '').trim(),
      supportPhone: String($('applicationPhone')?.value || '').trim()
    };
    if (draft.storeName.length < 2) return toast($('applicationMessage'), 'اكتبي اسم المتجر أولاً.', true);
    try { sessionStorage.setItem('lovara_partner_application_draft', JSON.stringify(draft)); }
    catch (_) { /* the destination page still allows manual entry */ }
    window.location.href = '/partnership.html';
  }

  async function loadProducts() {
    const list = $('sellerProducts');
    list.innerHTML = '<p class="muted">جارٍ تحميل المنتجات…</p>';
    try {
      const snapshot = await db.collection('shops').doc(activeShop.id).collection('products').get();
      renderProductQuota(snapshot.size);
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
          const result = await partnerProductAction('delete', { productId: button.dataset.delete });
          activeShop.productCount = result.productCount;
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
    const canDiscount = !!activePlan()?.discounts;
    $('productSalePrice').value = canDiscount && Number(product.salePrice || 0) > 0 ? Number(product.salePrice) : '';
    const endsAt = canDiscount ? Number(product.saleEndsAt) || 0 : 0;
    $('productSaleEnds').value = endsAt ? new Date(endsAt - new Date(endsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    if (product.imageUrl) { $('productPreview').src = product.imageUrl; $('productPreview').classList.remove('hidden'); }
    $('productFormTitle').textContent = `تعديل المنتج: ${product.name || ''}`;
    $('saveProduct').textContent = 'حفظ التعديلات';
    renderProductQuota(sellerProductCount);
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
    renderProductQuota(sellerProductCount);
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
    const plan = activePlan();
    if (!editingProductId && plan && sellerProductCount >= plan.productLimit) {
      return toast(note, `وصلتِ إلى حد باقتك وهو ${plan.productLimit} منتجًا. احذفي منتجًا أو غيّري الباقة.`, true);
    }
    if (saleValue && !plan?.discounts) return toast(note, 'إضافة الخصومات والعداد متاحة في باقة 6 أشهر فقط.', true);
    if (saleValue && (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= price || !Number.isFinite(saleEndsAt) || saleEndsAt <= Date.now())) {
      return toast(note, 'سعر العرض يجب أن يكون أقل من السعر الأصلي، مع تحديد موعد انتهاء في المستقبل.', true);
    }
    if (!saleValue && saleEndInput) return toast(note, 'أدخل سعر العرض أو أفرغ تاريخ انتهاء العرض.', true);
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    try {
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
        imageUrl
      };
      const wasEditing = !!editingProductId;
      const result = await partnerProductAction(wasEditing ? 'update' : 'create', {
        ...(wasEditing ? { productId: editingProductId } : {}), product: data
      });
      activeShop.productCount = result.productCount;
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

  async function saveStoreSettings(event) {
    event.preventDefault();
    const plan = activePlan();
    if (!plan?.storeBranding && !plan?.advancedStorefront) return toast($('storeSettingsMessage'), 'تخصيص الواجهة غير متاح في باقتك الحالية.', true);
    const settings = {
      themeColor: $('storeThemeColor').value,
      announcementText: $('storeAnnouncementText').value.trim()
    };
    if (plan.advancedStorefront) {
      settings.heroTitle = $('storeHeroTitle').value.trim();
      settings.heroDescription = $('storeHeroDescription').value.trim();
    }
    const button = $('saveStoreSettings');
    button.disabled = true;
    try {
      await partnerProductAction('update-settings', { settings });
      Object.assign(activeShop, settings);
      toast($('storeSettingsMessage'), 'تم حفظ تخصيص واجهة متجرك.');
    } catch (error) {
      toast($('storeSettingsMessage'), error.message || 'تعذر حفظ التخصيص.', true);
    } finally { button.disabled = false; }
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
  $('storeSettingsForm')?.addEventListener('submit', saveStoreSettings);
  $('cancelProductEdit')?.addEventListener('click', cancelProductEdit);
  preview('applicationImage', 'applicationPreview');
  preview('productImage', 'productPreview');
  bindSellerOrderActions();
  auth.onAuthStateChanged(user => {
    if (!user) {
      if (ordersUnsubscribe) ordersUnsubscribe();
      ordersUnsubscribe = null;
      sellerOrderDocs = [];
      sellerOrderFilter = 'new';
      closeSellerCancelModal();
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
