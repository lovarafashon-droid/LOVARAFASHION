// ============================================
// LOVARA - Category Page Loader (dresses, tops, pants, etc.)
// ============================================

// Get category from URL or data attribute
const currentCategory = document.body.dataset.category || 
                        window.location.pathname.split('/').pop().replace('.html', '') ||
                        'dresses';

document.addEventListener('DOMContentLoaded', async function() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  const loading = document.getElementById('productsLoading');
  const categoryTitle = document.getElementById('categoryTitle');
  const categoryCount = document.getElementById('categoryCount');

  // Update title
  if (categoryTitle) {
    categoryTitle.textContent = currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
  }

  // ✅ انتظر Firebase
  let attempts = 0;
  while (typeof firebase === 'undefined' || !firebase.firestore) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
    if (attempts > 100) break;
  }

  if (typeof firebase === 'undefined' || !firebase.firestore) {
    console.error('❌ Firebase not loaded');
    if (loading) loading.style.display = 'none';
    if (emptyState) {
      emptyState.querySelector('h3').textContent = 'Connection Error';
      emptyState.querySelector('p').innerHTML = 'Please check your internet connection.<br>Refresh the page to try again.';
      emptyState.style.display = 'flex';
    }
    return;
  }

  const db = firebase.firestore();

  try {
    console.log('🔄 Loading ' + currentCategory + ' products from Firebase...');

    // Load products for this category
    // Use simple get() without orderBy to avoid index issues
    const snapshot = await db.collection('products')
      .where('category', '==', currentCategory)
      .get();

    console.log('📦 Products loaded:', snapshot.size);

    if (snapshot.empty) {
      console.log('No products found for category:', currentCategory);
      if (loading) loading.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      if (categoryCount) categoryCount.textContent = '(0)';
      return;
    }

    // Convert to array and filter for category page
    const products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Only show products that have showOnCategory = true (or undefined for backward compat)
      if (data.showOnCategory !== false) {
        products.push({ id: doc.id, ...data });
      }
    });

    // Sort by createdAt (newest first)
    products.sort((a, b) => {
      const aTime = a.createdAt || 0;
      const bTime = b.createdAt || 0;
      return bTime - aTime;
    });

    console.log('📁 Products for category page:', products.length);

    // Update count
    if (categoryCount) categoryCount.textContent = '(' + products.length + ')';

    // Hide loading & empty state
    if (loading) loading.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    if (products.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    // Render products in grid (not carousel for category pages)
    renderCategoryProducts(grid, products);

  } catch (error) {
    console.error('❌ Error loading products:', error);
    if (loading) loading.style.display = 'none';
    if (emptyState) {
      emptyState.querySelector('h3').textContent = 'Error Loading Products';
      emptyState.querySelector('p').textContent = 'Please refresh the page. Error: ' + error.message;
      emptyState.style.display = 'flex';
    }
  }
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

  const safeName = (product.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Sizes display
  const sizesHtml = product.sizes && product.sizes.length > 0 
    ? `<div class="product-sizes"><span class="size-label">Sizes:</span> ${product.sizes.join(', ')}</div>` 
    : '';

  // Colors display
  const colorsHtml = product.colors && product.colors.length > 0
    ? `<div class="product-colors"><span class="color-label">Colors:</span> ${product.colors.join(', ')}</div>`
    : '';

  div.innerHTML = `
    <div class="product-img-wrap">
      <img src="${product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400'%3E%3Crect width='300' height='400' fill='%23f8e8e8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23c97c82'%3ENo Image%3C/text%3E%3C/svg%3E'}" 
           alt="${safeName}" 
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400'%3E%3Crect width='300' height='400' fill='%23f8e8e8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23c97c82'%3ENo Image%3C/text%3E%3C/svg%3E'" />
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
      image: productImage || imageUrl,
      category: category,
      quantity: 1
    });
  }

  localStorage.setItem('lovara_cart', JSON.stringify(cart));
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