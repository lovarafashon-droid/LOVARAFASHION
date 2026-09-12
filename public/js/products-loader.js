// LOVARA homepage product loader
// Uses the same product cards and cart/wishlist handlers as category pages.

const HOMEPAGE_PRODUCTS_CACHE_KEY = 'lovara_homepage_products_v3';
const homepageState = {
  products: [],
  filteredProducts: [],
  currentFilter: 'all'
};
window.carouselState = homepageState;

function productFieldValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(productFieldValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {})
      .map(([key, item]) => [key, productFieldValue(item)]));
  }
  return null;
}

function readProductCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOMEPAGE_PRODUCTS_CACHE_KEY));
    return Array.isArray(cached) ? cached : [];
  } catch (error) {
    return [];
  }
}

function writeProductCache(products) {
  try {
    localStorage.setItem(HOMEPAGE_PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch (error) {
    console.warn('[LOVARA] Product cache unavailable:', error.message);
  }
}

function normalizeProducts(products) {
  return products
    .filter(product => product && product.id && product.showOnHome !== false)
    .map(product => ({
      ...product,
      price: Number(product.price) || 0,
      oldPrice: product.oldPrice == null ? null : Number(product.oldPrice),
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      colors: Array.isArray(product.colors) ? product.colors : [],
      imageUrl: product.imageUrl || product.image || product.imageURL || product.photo || product.img || product.thumbnail || ''
    }))
    .sort((a, b) => {
      const aTime = typeof a.createdAt === 'number' ? a.createdAt : Date.parse(a.createdAt || '') || 0;
      const bTime = typeof b.createdAt === 'number' ? b.createdAt : Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    });
}

async function fetchProductsFromFirebase() {
  if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function') {
    throw new Error('Firebase is not available');
  }
  const snapshot = await firebase.firestore().collection('products').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchProductsFromRest() {
  const projectId = firebase?.app?.().options?.projectId;
  if (!projectId) throw new Error('Firebase project is not available');
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/products?pageSize=100`;
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Products request failed (${response.status})`);
  const payload = await response.json();
  return (payload.documents || []).map(document => ({
    id: document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(document.fields || {})
      .map(([key, value]) => [key, productFieldValue(value)])
    )
  }));
}

function showProductLoading(grid, loading, emptyState) {
  if (loading) loading.style.display = 'flex';
  if (emptyState) emptyState.style.display = 'none';
}

function renderHomepageProducts(products, filter = 'all') {
  const grid = document.getElementById('productsGrid');
  const loading = document.getElementById('productsLoading');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  homepageState.products = products;
  homepageState.filteredProducts = products;
  homepageState.currentFilter = filter;
  window.carouselState = homepageState;
  if (window.CategoryApp) CategoryApp.products = products;

  if (loading) loading.style.display = 'none';
  if (emptyState) emptyState.style.display = products.length ? 'none' : 'flex';
  grid.innerHTML = '';
  grid.classList.remove('carousel-grid');
  grid.classList.add('category-products-grid');

  if (!products.length) return;
  products.forEach(product => {
    const card = window.CategoryApp
      ? CategoryApp.createProductCard(product)
      : createFallbackProductCard(product);
    grid.appendChild(card);
  });
}

function createFallbackProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.productId = product.id;
  card.innerHTML = `
    <div class="product-img-wrap">
      <img class="product-img" src="${product.imageUrl || 'https://via.placeholder.com/300x400?text=LOVARA'}" alt="${product.name || 'LOVARA'}">
    </div>
    <div class="product-info">
      <h4 class="product-name">${product.name || 'LOVARA'}</h4>
      <p class="product-price">EGP ${product.price.toFixed(2)}</p>
    </div>`;
  return card;
}

function categoryAliases(category) {
  const aliases = {
    dresses: ['dresses', 'dress', 'فساتين', 'دريس'],
    tops: ['tops', 'top', 'بلوزات', 'توب'],
    pants: ['pants', 'pant', 'بناطيل'],
    accessories: ['accessories', 'accessory', 'إكسسوارات', 'اكسسوارات'],
    lingerie: ['lingerie', 'ملابس داخلية', 'داخلي'],
    sets: ['sets', 'set', 'اطقم', 'أطقم'],
    winter: ['winter', 'شتوي', 'الشتوي'],
    hijab: ['hijab', 'حجاب', 'محجبات']
  };
  return new Set(aliases[category] || [category]);
}

function filterProducts(category) {
  const filteredProducts = category === 'all'
    ? homepageState.products
    : homepageState.products.filter(product => categoryAliases(category)
      .has(String(product.category || '').trim().toLowerCase()));
  homepageState.filteredProducts = filteredProducts;
  renderHomepageProducts(filteredProducts, category);
  document.querySelectorAll('.filter-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === category);
  });
}
window.filterProducts = filterProducts;

function setupHomepageFilters() {
  document.querySelectorAll('.filter-btn').forEach(button => {
    button.addEventListener('click', () => filterProducts(button.dataset.filter || 'all'));
  });
}

async function loadHomepageProducts() {
  const grid = document.getElementById('productsGrid');
  const loading = document.getElementById('productsLoading');
  const emptyState = document.getElementById('emptyState');
  if (!grid || grid.dataset.productsLoaderStarted === 'true') return;
  grid.dataset.productsLoaderStarted = 'true';
  setupHomepageFilters();
  showProductLoading(grid, loading, emptyState);

  let products = [];
  try {
    try {
      products = normalizeProducts(await Promise.race([
        fetchProductsFromFirebase(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timed out')), 10000))
      ]));
    } catch (sdkError) {
      console.warn('[LOVARA] Firebase SDK failed; trying REST:', sdkError.message);
      products = normalizeProducts(await fetchProductsFromRest());
    }
    if (products.length) {
      writeProductCache(products);
      renderHomepageProducts(products);
      return;
    }
  } catch (error) {
    console.error('[LOVARA] Product loading failed:', error);
  }

  const cached = normalizeProducts(readProductCache());
  if (cached.length) {
    console.warn('[LOVARA] Showing cached products after a temporary load failure.');
    renderHomepageProducts(cached);
    return;
  }

  if (loading) loading.style.display = 'none';
  if (emptyState) emptyState.style.display = 'flex';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHomepageProducts, { once: true });
} else {
  loadHomepageProducts();
}

window.loadHomepageProducts = loadHomepageProducts;
