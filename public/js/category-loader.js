// ============================================
// LOVARA - Category Page Loader (dresses, tops, pants, etc.)
// ============================================

// Get category from URL or data attribute
const currentCategory = document.body.dataset.category || 
                        window.location.pathname.split('/').pop().replace('.html', '') ||
                        'dresses';

const CATEGORY_CACHE_PREFIX = 'lovara_category_products_';

function readCategoryCache(category) {
  try {
    const cached = JSON.parse(localStorage.getItem(CATEGORY_CACHE_PREFIX + category) || 'null');
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) return cached.data;
    // The homepage cache can seed a category's first visit without another
    // network round trip; Firebase still refreshes the result below.
    const allCached = JSON.parse(localStorage.getItem('lovara_products_cache') || 'null');
    if (allCached && Array.isArray(allCached.data)) {
      return allCached.data.filter(product => product.category === category && product.showOnCategory !== false);
    }
  } catch (error) {
    console.warn('Category cache read error:', error);
  }
  return [];
}

function writeCategoryCache(category, products) {
  try {
    localStorage.setItem(CATEGORY_CACHE_PREFIX + category, JSON.stringify({ data: products, timestamp: Date.now() }));
  } catch (error) {
    console.warn('Category cache write error:', error);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  const loading = document.getElementById('productsLoading');
  const categoryTitle = document.getElementById('categoryTitle');
  const categoryCount = document.getElementById('categoryCount');

  // Update title
  if (categoryTitle) {
    categoryTitle.textContent = currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
  }

  // Paint the last successful catalog immediately; Firebase refreshes it below.
  const cachedProducts = readCategoryCache(currentCategory);
  if (cachedProducts.length > 0) {
    if (loading) loading.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (categoryCount) categoryCount.textContent = '(' + cachedProducts.length + ')';
    renderCategoryProducts(grid, cachedProducts);
  }

  // Do not block first paint while waiting for the Firebase CDN/connection.
  (async function refreshFromFirebase() {
    let attempts = 0;
    while ((typeof firebase === 'undefined' || !firebase.firestore) && attempts++ < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      if (!cachedProducts.length && loading) loading.style.display = 'none';
      if (!cachedProducts.length && emptyState) emptyState.style.display = 'flex';
      return;
    }

    try {
      console.log('🔄 Refreshing ' + currentCategory + ' products from Firebase...');
      const snapshot = await firebase.firestore().collection('products')
        .where('category', '==', currentCategory).get();
      const products = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.showOnCategory !== false) products.push({ id: doc.id, ...data });
      });
      products.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      writeCategoryCache(currentCategory, products);
      if (loading) loading.style.display = 'none';
      if (categoryCount) categoryCount.textContent = '(' + products.length + ')';
      if (products.length > 0) {
        if (emptyState) emptyState.style.display = 'none';
        renderCategoryProducts(grid, products);
      } else if (!cachedProducts.length && emptyState) {
        emptyState.style.display = 'flex';
      }
    } catch (error) {
      console.error('❌ Error refreshing products:', error);
      if (!cachedProducts.length && loading) loading.style.display = 'none';
      if (!cachedProducts.length && emptyState) emptyState.style.display = 'flex';
    }
  })();
});

// ============================================
// RENDER CATEGORY PRODUCTS (Grid Layout)
// ============================================
function renderCategoryProducts(grid, products) {
  grid.innerHTML = '';
  grid.classList.remove('carousel-grid');
  grid.classList.add('category-products-grid');

  products.forEach(product => {
    const card = createCategoryProductCard(product.id, product);
    grid.appendChild(card);
  });
}

function createCategoryProductCard(id, product) {
  const div = document.createElement('div');
  div.className = 'product-card';
  div.setAttribute('data-category', product.category || 'all');
  div.setAttribute('data-product-id', id);
  div.addEventListener('click', (event) => {
    if (event.target.closest('button, a, input, select, textarea')) return;
    if (typeof CartApp !== 'undefined' && typeof CartApp.handleBuyNow === 'function') {
      CartApp.handleBuyNow(id);
    }
  });

  const safeName = String(product.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fallbackImage = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22400%22%3E%3Crect width=%22300%22 height=%22400%22 fill=%22%23f8e8e8%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%23c97c82%22%3ENo Image%3C/text%3E%3C/svg%3E';

  // Sizes display
  const sizesHtml = Array.isArray(product.sizes) && product.sizes.length > 0 
    ? `<div class="product-sizes"><span class="size-label">Sizes:</span> ${product.sizes.join(', ')}</div>` 
    : '';

  // Colors display
  const colorsHtml = Array.isArray(product.colors) && product.colors.length > 0
    ? `<div class="product-colors"><span class="color-label">Colors:</span> ${product.colors.join(', ')}</div>`
    : '';

  div.innerHTML = `
    <div class="product-img-wrap">
      <img src="${product.imageUrl || fallbackImage}" 
           alt="${safeName}" 
           onerror="this.src='${fallbackImage}'" />
      ${product.badge ? `<span class="product-badge badge-${product.badge}">${product.badge}</span>` : ''}

      <div class="product-actions-overlay">
        <button class="product-action-btn wishlist-btn" onclick="toggleWishlist('${id}')" title="Add to Wishlist">
          <i class="fas fa-heart"></i>
        </button>
      </div>
    </div>
    <div class="product-info">
      <h3 class="product-title">${safeName}</h3>
      ${sizesHtml}
      ${colorsHtml}
      <div class="product-footer">
        <div class="product-price">
          ${product.oldPrice ? `<span class="old-price">EGP ${product.oldPrice}</span>` : ''}
          EGP ${(product.price || 0).toFixed(2)}
        </div>
        <button class="btn-add-cart" onclick="addToCart('${id}')">
          <i class="fas fa-bag-shopping"></i> Add to Cart
        </button>
      </div>
    </div>
  `;

  return div;
}

// ============================================
// CART FUNCTIONS
// ============================================
function addToCart(productId) {
  // Get product from current page products
  // Note: In a real implementation, you'd want to store products in a global variable
  // For now, we'll get it from the DOM
  const card = document.querySelector(`[data-product-id="${productId}"]`);
  if (!card) return;

  const name = card.querySelector('.product-title').textContent;
  const priceText = card.querySelector('.product-price').textContent;
  const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
  const imageUrl = card.querySelector('img').src;
  const category = currentCategory;

  let cart = JSON.parse(localStorage.getItem('lovara_cart')) || [];

  const existingItem = cart.find(item => item.id === productId);
  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + 1;
  } else {
    cart.push({
      id: productId,
      name: name,
      price: price,
      image: imageUrl,
      category: category,
      quantity: 1
    });
  }

  localStorage.setItem('lovara_cart', JSON.stringify(cart));
  window.LovaraData?.saveCart();
  updateCartCount();
  showProductToast('Added to cart!');
}

function updateCartCount() {
  const cart = JSON.parse(localStorage.getItem('lovara_cart')) || [];
  const totalItems = cart.reduce((sum, item) => sum + (parseInt(item.qty) || parseInt(item.quantity) || 1), 0);

  const cartCountElements = document.querySelectorAll('.cart-count');
  cartCountElements.forEach(el => {
    el.textContent = totalItems;
    el.style.display = totalItems > 0 ? 'flex' : 'none';
  });
}

// ============================================
// WISHLIST FUNCTION
// ============================================
function toggleWishlist(productId) {
  let wishlist = window.LovaraData ? LovaraData.getWishlist() : (JSON.parse(localStorage.getItem('lovara_wishlist')) || []);
  const index = wishlist.findIndex(item => (typeof item === 'string' ? item : item.id) === productId);

  if (index > -1) {
    wishlist.splice(index, 1);
    showProductToast('Removed from wishlist');
  } else {
    wishlist.push({ id: productId });
    showProductToast('Added to wishlist!');
  }

  localStorage.setItem('lovara_wishlist', JSON.stringify(wishlist));
  window.LovaraData?.saveWishlist();
}

// ============================================
// TOAST NOTIFICATION
// ============================================
function showProductToast(message) {
  const existingToast = document.querySelector('.product-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'product-toast';
  toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

// Update cart count on page load
updateCartCount();
