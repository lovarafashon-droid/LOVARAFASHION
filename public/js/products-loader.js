// ============================================
// LOVARA - Products Loader (Homepage) - FIXED v2
// ============================================

const CACHE_KEY = 'lovara_products_cache';
const CACHE_DURATION = 10 * 60 * 1000;

function getCachedProducts() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log('Using cached products');
        return data;
      }
    }
  } catch (e) {
    console.warn('Cache read error:', e);
  }
  return null;
}

function setCachedProducts(products) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: products,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Cache write error:', e);
  }
}

async function waitForFirebase(maxRetries = 30, baseDelay = 300) {
  for (let i = 0; i < maxRetries; i++) {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      return true;
    }
    const delay = baseDelay * Math.pow(1.5, i);
    await new Promise(r => setTimeout(r, Math.min(delay, 3000)));
  }
  return false;
}

function isOnline() {
  return navigator.onLine;
}

function showOfflineState(container) {
  container.innerHTML = `
    <div class="offline-state">
      <div class="offline-icon"><i class="fas fa-wifi-slash"></i></div>
      <h3>You are Offline</h3>
      <p>Please check your internet connection and try again.</p>
      <button class="btn btn-primary" onclick="window.location.reload()">
        <i class="fas fa-rotate-right"></i> Retry
      </button>
    </div>
  `;
}

function showSkeletonLoading(grid, count = 4) {
  const loading = document.getElementById('productsLoading');
  if (loading) loading.style.display = 'flex';
}

function firestoreRestValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreRestValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {})
    .map(([key, item]) => [key, firestoreRestValue(item)]));
  return null;
}

async function fetchProductsViaRest(limit = 0) {
  const projectId = (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId)
    || firebase?.app?.().options?.projectId
    || 'lovara-89510';
  if (!projectId) throw new Error('Firebase project is not available');
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const structuredQuery = {
    from: [{ collectionId: 'products' }],
    select: { fields: [
      'showOnHome', 'name', 'price', 'oldPrice', 'category', 'badge',
      'sizes', 'colors', 'comingSoon', 'imageUrl', 'image', 'imageURL',
      'photo', 'img', 'thumbnail', 'images', 'createdAt'
    ].map(fieldPath => ({ fieldPath })) }
  };
  if (limit > 0) structuredQuery.limit = limit;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Products request failed (${response.status})`);
  const payload = await response.json();
  return (Array.isArray(payload) ? payload : []).filter(row => row.document).map(row => ({
    id: row.document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(row.document.fields || {})
      .map(([key, value]) => [key, firestoreRestValue(value)]))
  }));
}

document.addEventListener('DOMContentLoaded', async function() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  const loading = document.getElementById('productsLoading');

  if (!grid) {
    console.error('productsGrid not found');
    return;
  }

  if (!isOnline()) {
    const cached = getCachedProducts();
    if (cached && cached.length > 0) {
      if (loading) loading.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      initProductCarousel(grid, cached);
      return;
    }
    if (loading) loading.style.display = 'none';
    showOfflineState(grid);
    return;
  }

  const cached = getCachedProducts();
  if (cached && cached.length > 0) {
    if (loading) loading.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    // Paint the last successful catalog immediately while refreshing it.
    initProductCarousel(grid, cached);
  } else {
    showSkeletonLoading(grid, 4);
  }

  try {
    // First paint: only fetch the first eight cards so the carousel appears
    // immediately. The full catalog refresh follows in the same request.
    const firstProducts = await fetchProductsViaRest(8);
    const firstVisible = firstProducts.filter(product => product.showOnHome !== false);
    const firstToRender = firstVisible.length > 0 ? firstVisible : firstProducts;
    if (firstToRender.length > 0) {
      setCachedProducts(firstToRender);
      if (loading) loading.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      initProductCarousel(grid, firstToRender);
    }

    // Then fetch all products for filters and pagination and replace the
    // initial eight-card view when the complete catalog is ready.
    const products = await fetchProductsViaRest();
    const visibleProducts = products.filter(product => product.showOnHome !== false);
    const productsToRender = visibleProducts.length > 0 ? visibleProducts : products;

    productsToRender.sort((a, b) => {
      const aTime = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : a.createdAt) : 0;
      const bTime = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : b.createdAt) : 0;
      return bTime - aTime;
    });

    setCachedProducts(productsToRender);

    if (loading) loading.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    if (productsToRender.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    initProductCarousel(grid, productsToRender);

  } catch (error) {
    console.error('Error loading products:', error);
    const fallbackCached = getCachedProducts();
    if (fallbackCached && fallbackCached.length > 0) {
      grid.innerHTML = '';
      initProductCarousel(grid, fallbackCached);
      return;
    }
    if (loading) loading.style.display = 'none';
    if (emptyState) {
      emptyState.querySelector('h3').textContent = 'Error Loading Products';
      emptyState.querySelector('p').textContent = 'Please refresh the page. Error: ' + error.message;
      emptyState.style.display = 'flex';
    }
  }
});

// ============================================
// CAROUSEL LOGIC
// ============================================
const carouselState = window.carouselState = {
  products: [],
  currentPage: 0,
  itemsPerPage: 4,
  filteredProducts: [],
  currentFilter: 'all'
};

const badgeTranslations = {
  en: { 'New': 'New', 'Sale': 'Sale', 'Bestseller': 'Bestseller', 'Limited': 'Limited', 'Coming Soon': 'Coming Soon' },
  ar: { 'New': 'جديد', 'Sale': 'تخفيض', 'Bestseller': 'الأكثر مبيعاً', 'Limited': 'محدود', 'Coming Soon': 'قريباً' }
};



function initProductCarousel(grid, products) {
  carouselState.products = products;
  carouselState.filteredProducts = products;
  window.allProducts = products;

  grid.innerHTML = '';
  grid.classList.add('carousel-grid');

  const carouselWrapper = document.createElement('div');
  carouselWrapper.className = 'carousel-wrapper';

  const leftArrow = document.createElement('button');
  leftArrow.className = 'carousel-arrow carousel-arrow-left';
  leftArrow.innerHTML = '<i class="fas fa-chevron-left"></i>';
  leftArrow.setAttribute('aria-label', 'Previous products');
  leftArrow.onclick = () => navigateCarousel(-1);

  const productsContainer = document.createElement('div');
  productsContainer.className = 'carousel-products-container';
  productsContainer.id = 'carouselProductsContainer';

  const rightArrow = document.createElement('button');
  rightArrow.className = 'carousel-arrow carousel-arrow-right';
  rightArrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
  rightArrow.setAttribute('aria-label', 'Next products');
  rightArrow.onclick = () => navigateCarousel(1);

  const pagination = document.createElement('div');
  pagination.className = 'carousel-pagination';
  pagination.id = 'carouselPagination';

  carouselWrapper.appendChild(leftArrow);
  carouselWrapper.appendChild(productsContainer);
  carouselWrapper.appendChild(rightArrow);

  grid.appendChild(carouselWrapper);
  grid.appendChild(pagination);

  renderCarouselPage();
  updateArrowVisibility();

  // Setup event delegation for product actions
  // setupProductActionsDelegation removed — using inline onclick
}

/* Event delegation removed — using inline onclick with CategoryApp */

function navigateCarousel(direction) {
  const totalPages = Math.ceil(carouselState.filteredProducts.length / carouselState.itemsPerPage);
  const newPage = carouselState.currentPage + direction;

  if (newPage >= 0 && newPage < totalPages) {
    carouselState.currentPage = newPage;
    renderCarouselPage();
    updateArrowVisibility();
  }
}

function renderCarouselPage() {
  const container = document.getElementById('carouselProductsContainer');
  const pagination = document.getElementById('carouselPagination');
  if (!container) return;

  const start = carouselState.currentPage * carouselState.itemsPerPage;
  const end = start + carouselState.itemsPerPage;
  const pageProducts = carouselState.filteredProducts.slice(start, end);

  container.style.opacity = '0';
  container.style.transform = 'translateX(' + (carouselState.currentPage > 0 ? '-20px' : '20px') + ')';

  setTimeout(() => {
    container.innerHTML = '';
    pageProducts.forEach(product => {
      const card = createProductCard(product.id, product);
      container.appendChild(card);
    });
    container.style.opacity = '1';
    container.style.transform = 'translateX(0)';
  }, 150);

  if (pagination) {
    const totalPages = Math.ceil(carouselState.filteredProducts.length / carouselState.itemsPerPage);
    pagination.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === carouselState.currentPage ? ' active' : '');
      dot.setAttribute('aria-label', 'Page ' + (i + 1));
      dot.onclick = () => {
        carouselState.currentPage = i;
        renderCarouselPage();
        updateArrowVisibility();
      };
      pagination.appendChild(dot);
    }
  }
}

function updateArrowVisibility() {
  const totalPages = Math.ceil(carouselState.filteredProducts.length / carouselState.itemsPerPage);
  const leftArrow = document.querySelector('.carousel-arrow-left');
  const rightArrow = document.querySelector('.carousel-arrow-right');

  if (leftArrow) {
    leftArrow.style.opacity = carouselState.currentPage === 0 ? '0.3' : '1';
    leftArrow.style.pointerEvents = carouselState.currentPage === 0 ? 'none' : 'auto';
  }
  if (rightArrow) {
    rightArrow.style.opacity = carouselState.currentPage >= totalPages - 1 ? '0.3' : '1';
    rightArrow.style.pointerEvents = carouselState.currentPage >= totalPages - 1 ? 'none' : 'auto';
  }
}

function filterProducts(category) {
  carouselState.currentFilter = category;
  carouselState.currentPage = 0;

  if (category === 'all') {
    carouselState.filteredProducts = carouselState.products;
  } else {
    carouselState.filteredProducts = carouselState.products.filter(p => p.category === category);
  }

  renderCarouselPage();
  updateArrowVisibility();
}

// ============================================
// CREATE PRODUCT CARD - FIXED: buttons always visible under image + share button
// Uses data-* attributes + event delegation (no inline onclick)
// ============================================
function getHomepageProduct(productId) {
  return (window.carouselState?.products || window.allProducts || []).find(product => product.id === productId) || null;
}

window.addHomepageProductToCart = function(productId) {
  const product = getHomepageProduct(productId);
  if (!product || !window.CartApp) return;
  if (product.badge === 'Coming Soon' || product.comingSoon === true) {
    showProductToast('This product is coming soon!');
    return;
  }
  if ((Array.isArray(product.sizes) && product.sizes.length) || (Array.isArray(product.colors) && product.colors.length)) {
    window.CartApp.openBuyNowModal(product, false);
  } else {
    window.CartApp.add({ ...product, qty: 1, quantity: 1 });
  }
};

window.toggleHomepageWishlist = function(productId) {
  const product = getHomepageProduct(productId);
  if (!product || !window.CartApp) return;
  window.CartApp.toggleWishlist(product);
  const button = document.querySelector(`[data-product-id="${productId}"] .product-wishlist`);
  if (button) button.classList.toggle('active', window.CartApp.isInWishlist(productId));
};

function createProductCard(id, product) {
  const div = document.createElement('div');
  div.className = 'product-card';
  div.setAttribute('data-category', product.category || 'all');
  div.setAttribute('data-product-id', id);

  const safeName = (product.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const price = parseFloat(product.price) || 0;
  const oldPrice = parseFloat(product.oldPrice) || 0;
  const imageUrl = product.imageUrl || product.image || product.imageURL || product.photo || product.img || product.thumbnail || '';
  const finalImage = imageUrl || 'https://via.placeholder.com/300x400?text=LOVARA';

  const lang = (typeof i18n !== 'undefined' && i18n.currentLang) ? i18n.currentLang : (localStorage.getItem('lovara_lang') || 'en');
  const badgeText = badgeTranslations[lang]?.[product.badge] || product.badge;
  const badgeHtml = product.badge ? `<div class="product-badge">${badgeText}</div>` : '';
  const oldPriceHtml = oldPrice > 0 ? `<span class="old-price">EGP ${oldPrice.toFixed(2)}</span>` : '';

  // Sizes
  let sizesHtml = '';
  if (product.sizes && product.sizes.length > 0) {
    const sizesTags = product.sizes.map(s => `<span class="product-size-tag">${s}</span>`).join('');
    sizesHtml = `<div class="product-sizes"><span class="product-meta-label">Size:</span>${sizesTags}</div>`;
  }

  // Colors
  let colorsHtml = '';
  if (product.colors && product.colors.length > 0) {
    const colorsTags = product.colors.map(c => `<span class="product-color-tag" style="background:${c};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.3)">${c}</span>`).join('');
    colorsHtml = `<div class="product-colors"><span class="product-meta-label">Color:</span>${colorsTags}</div>`;
  }

  // Check wishlist (CategoryApp style)
  let isWished = false;
  try {
    const wishlist = JSON.parse(localStorage.getItem('lovara_wishlist')) || [];
    isWished = wishlist.some(item => item && item.id === id);
  } catch(e) {}

  div.innerHTML = `
    <div class="product-img-wrap">
      <img src="${finalImage}" alt="${safeName}" class="product-img" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=LOVARA'">
      ${badgeHtml}
      <button class="product-wishlist ${isWished ? 'active' : ''}" aria-label="Add to wishlist" onclick="event.stopPropagation(); window.toggleHomepageWishlist('${id}')">
        <i class="fas fa-heart"></i>
      </button>
    </div>
    <div class="product-info">
      <h4 class="product-name">${safeName}</h4>
      <p class="product-price">EGP ${price.toFixed(2)} ${oldPriceHtml}</p>
      ${sizesHtml}
      ${colorsHtml}
      ${(() => {
        const isCS = product.badge === 'Coming Soon' || product.comingSoon === true;
        if (isCS) {
          return `<div class="product-actions coming-soon-actions"><span class="coming-soon-label" style="flex:1;text-align:center;padding:10px 14px;background:#f5f5f5;border-radius:8px;color:#888;font-size:13px;font-weight:500;"><i class="fas fa-clock" style="margin-right:6px;"></i>${badgeTranslations[lang]?.['Coming Soon'] || 'Coming Soon'}</span><button class="btn-share" onclick="CartApp.shareProduct('${id}')" aria-label="Share" style="width:40px;height:40px;border-radius:8px;border:1px solid #e8e4e0;background:#fff;color:#666;cursor:pointer;"><i class="fas fa-share-nodes"></i></button></div>`;
        }
        return `<div class="product-actions">
        <button class="add-to-cart" onclick="event.stopPropagation(); window.addHomepageProductToCart('${id}')">
          <i class="fas fa-bag-shopping"></i> Add to Cart
        </button>
        <button class="btn-buy-now" onclick="event.stopPropagation(); window.addHomepageProductToCart('${id}')">
          <i class="fas fa-bolt"></i> Buy Now
        </button>
        <button class="btn-share" onclick="CartApp.shareProduct('${id}')" aria-label="Share">
          <i class="fas fa-share-nodes"></i>
        </button>
      </div>`;
      })()}
    </div>
  `;

  return div;
}

function getCategoryPage(category) {
  const pages = {
    'dresses': 'dresses.html',
    'tops': 'tops.html',
    'pants': 'pants.html',
    'accessories': 'accessories.html',
    'lingerie': 'lingerie.html',
    'sets': 'sets.html'
  };
  return pages[category] || 'index.html#shop';
}

// ============================================
// ADD TO CART FROM PRODUCT CARD
// ============================================
function addToCartFromCard(id, name, price, image, category, badge, comingSoon) {
  if (badge === 'Coming Soon' || comingSoon === true) {
    showProductToast('This product is coming soon!');
    return;
  }
  if (typeof CartApp !== 'undefined' && CartApp.add) {
    CartApp.add({
      id: id,
      name: name,
      price: price,
      image: image,
      category: category,
      qty: 1
    });
  } else {
    // Fallback if CartApp not loaded yet
    let cart = JSON.parse(localStorage.getItem('lovara_cart')) || [];
    const existing = cart.find(item => item.id === id);
    if (existing) {
      existing.qty = (parseInt(existing.qty) || 1) + 1;
    } else {
      cart.push({ id: id, name: name, price: price, image: image, category: category, qty: 1 });
    }
    localStorage.setItem('lovara_cart', JSON.stringify(cart));
    showProductToast(name + ' added to cart!');
    // Update cart count badge
    const totalQty = cart.reduce((sum, item) => sum + (parseInt(item.qty) || 1), 0);
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
      cartCount.textContent = totalQty;
      cartCount.style.display = totalQty > 0 ? 'flex' : 'none';
    }
  }
}

// ============================================
// BUY NOW - Add to cart then go to checkout
// ============================================
function buyNow(id, name, price, image, category, badge, comingSoon) {
  if (badge === 'Coming Soon' || comingSoon === true) {
    showProductToast('This product is coming soon!');
    return;
  }
  // Add to cart first
  if (typeof CartApp !== 'undefined' && CartApp.add) {
    CartApp.add({
      id: id,
      name: name,
      price: price,
      image: image,
      category: category,
      qty: 1
    });
  } else {
    let cart = JSON.parse(localStorage.getItem('lovara_cart')) || [];
    const existing = cart.find(item => item.id === id);
    if (existing) {
      existing.qty = (parseInt(existing.qty) || 1) + 1;
    } else {
      cart.push({ id: id, name: name, price: price, image: image, category: category, qty: 1 });
    }
    localStorage.setItem('lovara_cart', JSON.stringify(cart));
  }
  // Go to checkout
  window.location.href = 'checkout.html';
}

// ============================================
// WISHLIST
// ============================================
function toggleWishlist(productId) {
  let wishlist = JSON.parse(localStorage.getItem('lovara_wishlist')) || [];
  const index = wishlist.indexOf(productId);

  if (index > -1) {
    wishlist.splice(index, 1);
    showProductToast('Removed from wishlist');
  } else {
    wishlist.push(productId);
    showProductToast('Added to wishlist!');
  }

  localStorage.setItem('lovara_wishlist', JSON.stringify(wishlist));
  updateWishlistButtons(productId, index === -1);
}

function updateWishlistButtons(productId, isAdded) {
  const buttons = document.querySelectorAll(`[data-product-id="${productId}"] .wishlist-btn, .wishlist-btn[data-product-id="${productId}"]`);
  buttons.forEach(btn => {
    if (isAdded) {
      btn.classList.add('active');
      btn.style.color = '#c97c82';
      btn.title = 'Remove from Wishlist';
    } else {
      btn.classList.remove('active');
      btn.style.color = '';
      btn.title = 'Add to Wishlist';
    }
  });
  // Update wishlist count
  const wishlistCount = document.getElementById('wishlistCount');
  if (wishlistCount) {
    const wishlist = JSON.parse(localStorage.getItem('lovara_wishlist')) || [];
    wishlistCount.textContent = wishlist.length;
    wishlistCount.style.display = wishlist.length > 0 ? 'flex' : 'none';
  }
}

// ============================================
// SHARE
// ============================================
async function shareProduct(productId, productName) {
  const product = carouselState.products.find(p => p.id === productId);
  if (!product) return;

  const shareData = {
    title: productName,
    text: 'Check out ' + productName + ' on LOVARA!',
    url: window.location.origin + '/' + getCategoryPage(product.category)
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareData.url);
      showProductToast('Link copied to clipboard!');
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = shareData.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showProductToast('Link copied to clipboard!');
    }
  }
}

// ============================================
// TOAST
// ============================================
function showProductToast(message) {
  const existingToast = document.querySelector('.product-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'product-toast';
  toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

// ============================================
// FILTER BUTTONS
// ============================================
function setupFilterButtons() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const filter = e.target.getAttribute('data-filter');
      filterProducts(filter);
    });
  });
}

document.addEventListener('DOMContentLoaded', setupFilterButtons);
