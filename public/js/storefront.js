(function () {
  'use strict';
  const message = document.getElementById('storeMessage');
  const content = document.getElementById('storeContent');
  const hero = document.getElementById('storeHero');
  const productsEl = document.getElementById('storeProducts');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const getDate = value => value?.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
  function showMessage(title, body, icon = 'fa-circle-info') {
    message.classList.remove('hidden');
    message.innerHTML = `<i class="fas ${icon}"></i><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>`;
    hero.classList.add('hidden');
    content.classList.add('hidden');
  }
  function whatsappHref(phone, storeName, productName) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
    const text = `مرحبًا، أود الاستفسار عن ${productName} من متجر ${storeName}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }
  function renderProduct(product, store) {
    const card = document.createElement('article');
    card.className = 'card';
    const image = product.imageUrl || product.image || 'https://via.placeholder.com/500x600?text=LOVARA';
    card.innerHTML = `<img loading="lazy" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}"><div class="card-body"><h3>${escapeHtml(product.name)}</h3><p class="desc">${escapeHtml(product.description || product.category || '')}</p><div class="price">EGP ${Number(product.price || 0).toFixed(2)}</div><a class="wa" target="_blank" rel="noopener" href="${escapeHtml(whatsappHref(store.supportPhone, store.storeName, product.name))}"><i class="fab fa-whatsapp"></i> اسأل عن المنتج</a></div>`;
    return card;
  }
  async function init() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const rawSlug = pathParts.length > 1 && pathParts[pathParts.length - 2] === 'store'
      ? pathParts[pathParts.length - 1]
      : new URLSearchParams(location.search).get('slug');
    const slug = decodeURIComponent(rawSlug || '').trim();
    if (!slug || !firebase?.firestore) return showMessage('المتجر غير متاح', 'تعذر العثور على رابط متجر صالح.');
    try {
      const shopSnap = await firebase.firestore().collection('shops').doc(slug).get();
      if (!shopSnap.exists) return showMessage('المتجر غير متاح', 'لم يتم العثور على هذا المتجر أو أن الاشتراك متوقف.', 'fa-store-slash');
      const store = shopSnap.data();
      const expiry = getDate(store.expiresAt);
      if (store.active !== true || !Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
        return showMessage('المتجر غير متاح حاليًا', 'قد يكون الاشتراك منتهيًا أو أوقف صاحب المتجر عرضه.');
      }
      const snapshot = await firebase.firestore().collection('shops').doc(slug).collection('products').get();
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : Number(a.createdAt || 0);
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : Number(b.createdAt || 0);
        return bTime - aTime;
      });
      document.title = `${store.storeName} | LOVARA`;
      document.getElementById('storeName').textContent = store.storeName;
      const storeImage = document.getElementById('storeImage');
      storeImage.src = store.imageUrl;
      storeImage.alt = `صورة ${store.storeName}`;
      const whats = document.getElementById('storeWhatsApp');
      whats.href = whatsappHref(store.supportPhone, store.storeName, '');
      products.forEach(product => productsEl.appendChild(renderProduct(product, store)));
      if (!products.length) productsEl.innerHTML = '<div class="status"><p>لم يضف المتجر منتجات بعد.</p></div>';
      message.classList.add('hidden');
      hero.classList.remove('hidden');
      content.classList.remove('hidden');
    } catch (error) {
      console.error('[LOVARA store]', error);
      showMessage('تعذر تحميل المتجر', error.code === 'permission-denied' ? 'المتجر غير متاح حاليًا.' : 'تحققي من الاتصال وحاولي مرة أخرى.');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
