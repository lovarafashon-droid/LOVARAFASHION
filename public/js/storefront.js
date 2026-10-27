(function () {
  'use strict';
  const message = document.getElementById('storeMessage');
  const content = document.getElementById('storeContent');
  const hero = document.getElementById('storeHero');
  const productsEl = document.getElementById('storeProducts');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const getDate = value => value?.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
  let currentStore = null;
  let toastTimer = null;

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

  function currentProductPrice(product, now = Date.now()) {
    const rawEnd = product?.saleEndsAt;
    const endsAt = rawEnd?.toMillis ? rawEnd.toMillis() : rawEnd?.toDate ? rawEnd.toDate().getTime() : Number(rawEnd) || 0;
    const salePrice = Number(product?.salePrice) || 0;
    const price = Number(product?.price) || 0;
    return { price: salePrice > 0 && salePrice < price && endsAt > now ? salePrice : price, saleActive: salePrice > 0 && salePrice < price && endsAt > now, endsAt };
  }

  function renderProduct(product, store) {
    const card = document.createElement('article');
    card.className = 'card';
    const image = product.imageUrl || product.image || 'https://via.placeholder.com/500x600?text=LOVARA';
    const offer = currentProductPrice(product);
    const priceHtml = offer.saleActive
      ? `<div class="price"><del>EGP ${Number(product.price).toFixed(2)}</del> <strong>EGP ${offer.price.toFixed(2)}</strong><small>عرض لفترة محدودة</small></div>`
      : `<div class="price">EGP ${offer.price.toFixed(2)}</div>`;
    card.innerHTML = `<img loading="lazy" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}"><div class="card-body"><h3>${escapeHtml(product.name)}</h3><p class="desc">${escapeHtml(product.description || product.category || '')}</p>${priceHtml}<div class="product-actions"><button class="add-cart" type="button" data-add-cart="${escapeHtml(product.id)}"><i class="fas fa-cart-plus"></i> أضف للسلة</button><a class="wa" target="_blank" rel="noopener" href="${escapeHtml(whatsappHref(store.supportPhone, store.storeName, product.name))}"><i class="fab fa-whatsapp"></i> اسأل عن المنتج</a></div></div>`;
    return card;
  }

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem('lovara_cart') || '[]');
      return Array.isArray(cart) ? cart : [];
    } catch (_) { return []; }
  }

  function updateCartCount(cart = readCart()) {
    const count = cart.reduce((sum, item) => sum + Math.max(1, Number(item.qty || item.quantity) || 1), 0);
    const countEl = document.getElementById('storeCartCount');
    if (countEl) countEl.textContent = String(count);
  }

  function showToast(text) {
    const toast = document.getElementById('storeToast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function addToCart(product) {
    if (!currentStore || !product?.id) return;
    const cart = readCart();
    const item = {
      id: product.id,
      productId: product.id,
      storeId: currentStore.id,
      storeName: currentStore.storeName,
      storeSlug: currentStore.slug || currentStore.id,
      name: String(product.name || 'منتج'),
      price: currentProductPrice(product).price,
      image: product.imageUrl || product.image || '',
      imageUrl: product.imageUrl || product.image || '',
      category: String(product.category || ''),
      description: String(product.description || ''),
      qty: 1,
      quantity: 1
    };
    const existing = cart.find(row => row.id === item.id && row.storeId === item.storeId && !row.size && !row.color);
    if (existing) {
      const nextQuantity = Math.max(1, Number(existing.qty || existing.quantity) || 1) + 1;
      existing.qty = nextQuantity;
      existing.quantity = nextQuantity;
    } else {
      cart.push(item);
    }
    localStorage.setItem('lovara_cart', JSON.stringify(cart));
    window.dispatchEvent(new StorageEvent('storage', { key: 'lovara_cart', newValue: JSON.stringify(cart) }));
    updateCartCount(cart);
    showToast(`تمت إضافة ${item.name} إلى السلة`);
  }

  async function init() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const rawSlug = pathParts.length > 1 && pathParts[pathParts.length - 2] === 'store'
      ? pathParts[pathParts.length - 1]
      : new URLSearchParams(location.search).get('slug');
    const slug = decodeURIComponent(rawSlug || '').trim();
    if (!slug || !firebase?.firestore) return showMessage('المتجر غير متاح', 'تعذر العثور على رابط متجر صالح.');
    updateCartCount();
    try {
      const shopSnap = await firebase.firestore().collection('shops').doc(slug).get();
      if (!shopSnap.exists) return showMessage('المتجر غير متاح', 'لم يتم العثور على هذا المتجر أو أن الاشتراك متوقف.', 'fa-store-slash');
      const store = { id: shopSnap.id, ...shopSnap.data() };
      const expiry = getDate(store.expiresAt);
      if (store.active !== true || !Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
        return showMessage('المتجر غير متاح حاليًا', 'قد يكون الاشتراك منتهيًا أو أوقف صاحب المتجر عرضه.');
      }
      currentStore = store;
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
      document.getElementById('storeWhatsApp').href = whatsappHref(store.supportPhone, store.storeName, '');
      products.forEach(product => productsEl.appendChild(renderProduct(product, store)));
      productsEl.querySelectorAll('[data-add-cart]').forEach(button => {
        button.addEventListener('click', () => {
          const product = products.find(item => item.id === button.dataset.addCart);
          addToCart(product);
        });
      });
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
