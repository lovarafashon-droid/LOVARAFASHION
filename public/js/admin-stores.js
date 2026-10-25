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
    const slug = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    return slug || `shop-${String(uid).slice(0, 8)}`;
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

  async function loadRequests() {
    const container = $('requestsList');
    container.innerHTML = '<div class="notice">جارٍ تحميل الطلبات…</div>';
    try {
      const snapshot = await db.collection('storeRequests').get();
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(req => req.status === 'pending').sort((a,b) => asDate(b.createdAt) - asDate(a.createdAt));
      $('pendingCount').textContent = String(requests.length);
      if (!requests.length) { container.innerHTML = '<div class="empty">لا توجد طلبات معلّقة حاليًا.</div>'; return; }
      container.innerHTML = requests.map(request => `<article class="card"><img src="${escapeHtml(request.imageUrl || '')}" alt="${escapeHtml(request.storeName)}"><div><h2>${escapeHtml(request.storeName)}</h2><div class="meta">صاحب الطلب: ${escapeHtml(request.ownerEmail || request.ownerUid)}<br>رقم الدعم: ${escapeHtml(request.supportPhone)}<br>تاريخ الطلب: ${dateLabel(request.createdAt)}</div><div class="subscription"><label>مدة البداية: <input type="number" min="0" max="60" value="1" data-months="${escapeHtml(request.id)}"> شهر</label><label><input type="number" min="0" max="365" value="0" data-days="${escapeHtml(request.id)}"> يوم</label></div><div class="card-actions"><button class="btn" data-approve="${escapeHtml(request.id)}"><i class="fas fa-check"></i> موافقة</button><button class="btn red" data-reject="${escapeHtml(request.id)}"><i class="fas fa-xmark"></i> رفض</button><a class="btn green" href="${escapeHtml(waLink(request.supportPhone, `مرحبًا ${request.storeName}، نتواصل معك بخصوص طلب الشراكة في LOVARA.`))}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب</a></div></div></article>`).join('');
      container.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => approveRequest(button.dataset.approve, button)));
      container.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => rejectRequest(button.dataset.reject, button)));
    } catch (error) {
      console.error('[LOVARA admin requests]', error);
      container.innerHTML = `<div class="empty">تعذر تحميل الطلبات: ${escapeHtml(error.message)}</div>`;
    }
  }

  async function approveRequest(uid, button) {
    const requestRef = db.collection('storeRequests').doc(uid);
    button.disabled = true;
    try {
      const snapshot = await requestRef.get();
      if (!snapshot.exists || snapshot.data().status !== 'pending') throw new Error('الطلب لم يعد معلقًا.');
      const request = snapshot.data();
      let slug = slugify(request.storeName, uid);
      const base = slug;
      let suffix = 2;
      while ((await db.collection('shops').doc(slug).get()).exists) slug = `${base}-${suffix++}`;
      const months = Math.min(60, Math.max(0, Number(document.querySelector(`[data-months="${CSS.escape(uid)}"]`)?.value || 1)));
      const days = Math.min(365, Math.max(0, Number(document.querySelector(`[data-days="${CSS.escape(uid)}"]`)?.value || 0)));
      if (months === 0 && days === 0) throw new Error('حددي مدة اشتراك أكبر من صفر.');
      const expiresAt = addDuration(new Date(), months, days);
      const batch = db.batch();
      batch.set(db.collection('shops').doc(slug), {
        slug, ownerUid: uid, ownerEmail: request.ownerEmail || '', storeName: request.storeName,
        supportPhone: request.supportPhone, imageUrl: request.imageUrl,
        active: true, status: 'active', approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt), createdAt: request.createdAt || firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.update(requestRef, { status: 'approved', shopId: slug, reviewedAt: firebase.firestore.FieldValue.serverTimestamp(), reviewedBy: currentAdmin.uid });
      batch.set(db.collection('users').doc(uid), { storeId: slug }, { merge: true });
      await batch.commit();
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
      await db.collection('storeRequests').doc(uid).update({ status: 'rejected', reviewedAt: firebase.firestore.FieldValue.serverTimestamp(), reviewedBy: currentAdmin.uid });
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
        const statusClass = !shop.active ? 'paused-status' : expired ? 'expired-status' : 'active-status';
        const statusText = !shop.active ? 'موقوف' : expired ? 'منتهي الاشتراك' : 'نشط';
        const link = `${location.origin}/store/${encodeURIComponent(shop.slug || shop.id)}`;
        return `<article class="card"><img src="${escapeHtml(shop.imageUrl || '')}" alt="${escapeHtml(shop.storeName)}"><div><h2>${escapeHtml(shop.storeName)} <span class="status ${statusClass}">${statusText}</span></h2><div class="meta">المالك: ${escapeHtml(shop.ownerEmail || shop.ownerUid)}<br>الدعم: ${escapeHtml(shop.supportPhone)}<br>ينتهي الاشتراك: ${dateLabel(shop.expiresAt)}<br><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a></div><div class="subscription"><label>تمديد: <input type="number" min="0" max="60" value="1" data-extend-months="${escapeHtml(shop.id)}"> شهر</label><label><input type="number" min="0" max="365" value="0" data-extend-days="${escapeHtml(shop.id)}"> يوم</label><button class="btn" data-extend="${escapeHtml(shop.id)}"><i class="fas fa-calendar-plus"></i> تمديد الاشتراك</button></div><div class="card-actions"><button class="btn ${shop.active ? 'red' : ''}" data-toggle="${escapeHtml(shop.id)}" data-active="${shop.active === true}"><i class="fas ${shop.active ? 'fa-ban' : 'fa-play'}"></i> ${shop.active ? 'إيقاف المتجر' : 'إعادة تفعيل المتجر'}</button><a class="btn green" href="${escapeHtml(waLink(shop.supportPhone, `مرحبًا ${shop.storeName}، بخصوص متجر LOVARA الخاص بك.`))}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب</a></div></div></article>`;
      }).join('');
      container.querySelectorAll('[data-extend]').forEach(button => button.addEventListener('click', () => extendSubscription(button.dataset.extend, button)));
      container.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => toggleShop(button.dataset.toggle, button)));
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
      const months = Math.min(60, Math.max(0, Number(document.querySelector(`[data-extend-months="${CSS.escape(shopId)}"]`)?.value || 0)));
      const days = Math.min(365, Math.max(0, Number(document.querySelector(`[data-extend-days="${CSS.escape(shopId)}"]`)?.value || 0)));
      if (months === 0 && days === 0) throw new Error('حددي مدة تمديد أكبر من صفر.');
      const oldExpiry = asDate(snapshot.data().expiresAt);
      const start = oldExpiry > new Date() ? oldExpiry : new Date();
      const expiresAt = addDuration(start, months, days);
      await ref.update({ expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt), active: true, status: 'active', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذر تمديد الاشتراك.'); button.disabled = false; }
  }

  async function toggleShop(shopId, button) {
    const isActive = button.dataset.active === 'true';
    if (isActive && !confirm('هل تريد إيقاف المتجر الآن؟')) return;
    button.disabled = true;
    try {
      await db.collection('shops').doc(shopId).update({ active: !isActive, status: !isActive ? 'active' : 'suspended', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadShops();
    } catch (error) { alert(error.message || 'تعذر تحديث حالة المتجر.'); button.disabled = false; }
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
