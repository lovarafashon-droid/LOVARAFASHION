(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const message = $('storeMessage');
  const content = $('storeContent');
  const hero = $('storeHero');
  const productsEl = $('storeProducts');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const getDate = value => value?.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));

  let currentStore = null;
  let allProducts = [];
  let activeCategory = 'all';
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
    const text = `مرحبًا، أود الاستفسار عن ${productName || 'منتجات'} من متجر ${storeName || ''}`;
    return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : 'https://wa.me/';
  }

  function currentProductPrice(product, now = Date.now()) {
    const rawEnd = product?.saleEndsAt;
    const endsAt = rawEnd?.toMillis ? rawEnd.toMillis() : rawEnd?.toDate ? rawEnd.toDate().getTime() : Number(rawEnd) || 0;
    const salePrice = Number(product?.salePrice) || 0;
    const regularPrice = Number(product?.price) || 0;
    const saleActive = salePrice > 0 && salePrice < regularPrice && endsAt > now;
    return { price: saleActive ? salePrice : regularPrice, saleActive, endsAt };
  }

  function listOptionValues(values, maximum = 30) {
    return Array.isArray(values)
      ? [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].slice(0, maximum)
      : [];
  }

  function colorsFor(product) { return listOptionValues(product.colors, 20); }
  function sizesFor(product) { return listOptionValues(product.sizes, 30); }

  function renderColorSelectors(card, colors, quantity) {
    const wrap = card.querySelector('[data-piece-colors]');
    if (!wrap) return;
    if (!colors.length) {
      wrap.innerHTML = '';
      return;
    }
    const previous = [...wrap.querySelectorAll('[data-piece-color]')].map(select => select.value);
    const selected = Array.from({ length: quantity }, (_, index) => previous[index] || colors[0]);
    wrap.innerHTML = selected.map((color, index) => `
      <label class="piece-color-row">
        <span>لون القطعة ${index + 1}</span>
        <select data-piece-color aria-label="لون القطعة ${index + 1}">
          ${colors.map(option => `<option value="${escapeHtml(option)}" ${option === color ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
        </select>
      </label>`).join('');
  }

  function renderProduct(product, store) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.productId = product.id;

    const image = String(product.imageUrl || product.image || '');
    const offer = currentProductPrice(product);
    const colors = colorsFor(product);
    const sizes = sizesFor(product);
    const category = String(product.category || '').trim();
    const priceHtml = offer.saleActive
      ? `<div class="price"><del>EGP ${Number(product.price).toFixed(2)}</del><strong>EGP ${offer.price.toFixed(2)}</strong><small>عرض</small></div>`
      : `<div class="price"><strong>EGP ${offer.price.toFixed(2)}</strong></div>`;
    const sizeHtml = sizes.length
      ? `<div class="variant-line"><span class="variant-label">المقاس</span><select class="size-select" data-product-size aria-label="المقاس">${sizes.map(size => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join('')}</select></div>`
      : '';
    const variantHtml = `
      <div class="variant-area">
        <div class="variant-line"><span class="variant-label">الكمية</span><label class="variant-quantity"><input data-product-qty type="number" min="1" max="99" step="1" value="1" aria-label="الكمية"></label></div>
        ${sizeHtml}
        <div class="piece-colors" data-piece-colors></div>
        ${colors.length ? '<small class="variant-label">اختاري لونًا لكل قطعة.</small>' : ''}
      </div>`;
    const saleBadge = offer.saleActive ? '<span class="sale-badge">عرض خاص</span>' : '';
    const contactUrl = whatsappHref(store.supportPhone, store.storeName, product.name);

    card.innerHTML = `
      <div class="product-media">
        <img class="product-image" loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="${escapeHtml(product.name || 'منتج')}" onerror="this.style.opacity='.35'">
        ${saleBadge}
        <a class="product-contact" target="_blank" rel="noopener" aria-label="اسأل عن المنتج عبر واتساب" href="${escapeHtml(contactUrl)}"><i class="fab fa-whatsapp"></i></a>
      </div>
      <div class="card-body">
        ${category ? `<div class="product-category">${escapeHtml(category)}</div>` : ''}
        <h3>${escapeHtml(product.name || 'منتج')}</h3>
        <p class="desc">${escapeHtml(product.description || '')}</p>
        ${priceHtml}
        ${variantHtml}
        <button class="add-cart" type="button" data-add-cart><i class="fas fa-bag-shopping"></i> أضف إلى السلة</button>
      </div>`;

    renderColorSelectors(card, colors, 1);
    card.querySelector('[data-product-qty]').addEventListener('input', event => {
      const field = event.currentTarget;
      const limit = colors.length ? 20 : 99;
      const quantity = Math.min(limit, Math.max(1, Math.floor(Number(field.value) || 1)));
      field.value = String(quantity);
      renderColorSelectors(card, colors, quantity);
    });
    card.querySelector('[data-add-cart]').addEventListener('click', () => addToCart(product, card));
    return card;
  }

  function renderProducts() {
    if (!productsEl) return;
    const query = String($('storeSearch')?.value || '').trim().toLocaleLowerCase('ar');
    let products = allProducts.filter(product => {
      const searchText = [product.name, product.description, product.category]
        .map(value => String(value || '').toLocaleLowerCase('ar')).join(' ');
      const categoryMatches = activeCategory === 'all' || String(product.category || '').trim() === activeCategory;
      return categoryMatches && (!query || searchText.includes(query));
    });

    const sort = $('storeSort')?.value || 'newest';
    if (sort === 'price-asc') products.sort((a, b) => currentProductPrice(a).price - currentProductPrice(b).price);
    else if (sort === 'price-desc') products.sort((a, b) => currentProductPrice(b).price - currentProductPrice(a).price);
    else if (sort === 'name') products.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    else products.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : Number(a.createdAt || 0);
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : Number(b.createdAt || 0);
      return bTime - aTime;
    });

    productsEl.innerHTML = '';
    if (!products.length) {
      const hasAnyProducts = allProducts.length > 0;
      productsEl.innerHTML = `<div class="empty-products"><i class="fas ${hasAnyProducts ? 'fa-magnifying-glass' : 'fa-box-open'}"></i><p>${hasAnyProducts ? 'لا توجد منتجات تطابق هذا الاختيار.' : 'لم يضف المتجر منتجات بعد.'}</p></div>`;
    } else {
      products.forEach(product => productsEl.appendChild(renderProduct(product, currentStore)));
    }
    const count = $('storeResultCount');
    if (count) count.textContent = `${products.length} منتج`;
  }

  function renderCategoryFilters() {
    const container = $('storeCategoryFilters');
    if (!container) return;
    const categories = [...new Set(allProducts.map(product => String(product.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ar'));
    const filters = [{ id: 'all', label: 'كل المنتجات' }, ...categories.map(category => ({ id: category, label: category }))];
    if (!filters.some(filter => filter.id === activeCategory)) activeCategory = 'all';
    container.innerHTML = filters.map(filter => `
      <button class="filter-chip ${filter.id === activeCategory ? 'active' : ''}" type="button" data-category-filter="${escapeHtml(filter.id)}">
        ${escapeHtml(filter.label)}
      </button>`).join('');
    container.querySelectorAll('[data-category-filter]').forEach(button => button.addEventListener('click', () => {
      activeCategory = button.dataset.categoryFilter || 'all';
      renderCategoryFilters();
      renderProducts();
    }));
  }

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem('lovara_cart') || '[]');
      return Array.isArray(cart) ? cart : [];
    } catch (_) { return []; }
  }

  function updateCartCount(cart = readCart()) {
    const count = cart.reduce((sum, item) => sum + Math.max(1, Number(item.qty || item.quantity) || 1), 0);
    const countEl = $('storeCartCount');
    if (countEl) countEl.textContent = String(count);
  }

  function showToast(text) {
    const toast = $('storeToast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function addToCart(product, card) {
    if (!currentStore || !product?.id || !card) return;
    const colors = colorsFor(product);
    const sizes = sizesFor(product);
    const maxQuantity = colors.length ? 20 : 99;
    const quantity = Math.min(maxQuantity, Math.max(1, Math.floor(Number(card.querySelector('[data-product-qty]')?.value) || 1)));
    const selectedColors = colors.length
      ? [...card.querySelectorAll('[data-piece-color]')].map(select => select.value)
      : ['-'];
    if (colors.length && selectedColors.length !== quantity) return showToast('اختاري لونًا لكل قطعة.');
    const selectedSize = String(card.querySelector('[data-product-size]')?.value || sizes[0] || '-');
    if (sizes.length && !sizes.includes(selectedSize)) return showToast('اختاري مقاسًا متاحًا.');

    const unitsByColor = new Map();
    selectedColors.forEach(color => unitsByColor.set(color || colors[0] || '-', (unitsByColor.get(color || colors[0] || '-') || 0) + 1));
    const cart = readCart();
    for (const [color, qty] of unitsByColor) {
      const item = {
        id: product.id,
        productId: product.id,
        storeId: currentStore.id,
        storeName: String(currentStore.storeName || 'متجر شريك'),
        storeSlug: String(currentStore.slug || currentStore.id),
        name: String(product.name || 'منتج'),
        price: currentProductPrice(product).price,
        image: String(product.imageUrl || product.image || ''),
        imageUrl: String(product.imageUrl || product.image || ''),
        category: String(product.category || ''),
        description: String(product.description || ''),
        quantity: qty,
        qty,
        size: selectedSize,
        color: color || '-'
      };
      const existing = cart.find(row => row.id === item.id
        && (row.storeId || '') === item.storeId
        && String(row.size || '-') === item.size
        && String(row.color || '-') === item.color);
      if (existing) {
        const nextQuantity = Math.min(99, Math.max(1, Number(existing.qty || existing.quantity) || 1) + qty);
        existing.qty = nextQuantity;
        existing.quantity = nextQuantity;
      } else cart.push(item);
    }

    localStorage.setItem('lovara_cart', JSON.stringify(cart));
    updateCartCount(cart);
    try { window.dispatchEvent(new StorageEvent('storage', { key: 'lovara_cart', newValue: JSON.stringify(cart) })); } catch (_) {}
    showToast(`تمت إضافة ${quantity} قطعة من ${product.name || 'المنتج'} إلى السلة`);
  }

  function setupAccountMenu() {
    const wrap = $('accountWrap');
    const button = $('accountButton');
    button?.addEventListener('click', () => {
      const open = !wrap.classList.contains('open');
      wrap.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
      if (wrap && !wrap.contains(event.target)) {
        wrap.classList.remove('open');
        button?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        wrap?.classList.remove('open');
        button?.setAttribute('aria-expanded', 'false');
      }
    });
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(user => {
        const label = $('accountLabel');
        if (label) label.textContent = user ? 'حسابي' : 'دخول / حسابي';
      });
    }
  }

  async function init() {
    setupAccountMenu();
    $('storeSearch')?.addEventListener('input', renderProducts);
    $('storeSort')?.addEventListener('change', renderProducts);
    window.addEventListener('storage', event => {
      if (event.key === 'lovara_cart') updateCartCount();
    });

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const rawSlug = pathParts.length > 1 && pathParts[pathParts.length - 2] === 'store'
      ? pathParts[pathParts.length - 1]
      : new URLSearchParams(location.search).get('slug');
    let slug = '';
    try { slug = decodeURIComponent(rawSlug || '').trim(); }
    catch (_) { slug = String(rawSlug || '').trim(); }

    if (!slug || typeof firebase === 'undefined' || !firebase.firestore) {
      return showMessage('المتجر غير متاح', 'تعذر العثور على رابط متجر صالح.');
    }
    updateCartCount();

    try {
      const firestore = firebase.firestore();
      const shopSnapshot = await firestore.collection('shops').doc(slug).get();
      if (!shopSnapshot.exists) return showMessage('المتجر غير متاح', 'لم يتم العثور على هذا المتجر أو أن الاشتراك متوقف.', 'fa-store-slash');

      const store = { id: shopSnapshot.id, ...shopSnapshot.data() };
      const expiry = getDate(store.expiresAt);
      if (store.active !== true || !Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
        return showMessage('المتجر غير متاح حاليًا', 'قد يكون الاشتراك منتهيًا أو أوقف صاحب المتجر عرضه.');
      }

      currentStore = store;
      const productSnapshot = await firestore.collection('shops').doc(slug).collection('products').get();
      allProducts = productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      document.title = `${store.storeName || 'متجر شريك'} | LOVARA`;
      $('storeName').textContent = store.storeName || 'متجر شريك';
      const storeImage = $('storeImage');
      storeImage.src = store.imageUrl || '';
      storeImage.alt = `صورة ${store.storeName || 'المتجر'}`;
      $('storeWhatsApp').href = whatsappHref(store.supportPhone, store.storeName, '');
      $('storeNavContact').href = whatsappHref(store.supportPhone, store.storeName, '');
      $('productsTitle').textContent = `تسوق منتجات ${store.storeName || 'المتجر'}`;
      renderCategoryFilters();
      renderProducts();
      message.classList.add('hidden');
      hero.classList.remove('hidden');
      content.classList.remove('hidden');
    } catch (error) {
      console.error('[LOVARA store]', error);
      showMessage('تعذر تحميل المتجر', error.code === 'permission-denied' ? 'المتجر غير متاح حاليًا.' : 'تحقق من الاتصال وحاول مرة أخرى.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
