const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const checkoutHtml = fs.readFileSync('public/checkout.html', 'utf8');
const start = checkoutHtml.indexOf('function checkoutShopCartKey');
const end = checkoutHtml.indexOf('    const CheckoutApp = {', start);
assert(start >= 0 && end > start, 'checkout cart helpers exist');
const helperSource = checkoutHtml.slice(start, end);
const values = new Map();
const context = {
  URLSearchParams,
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  }
};
vm.runInNewContext(`${helperSource}\nglobalThis.shopCartTest = { checkoutShopCartKey, checkoutStoreIdFromLocation, checkoutReadCart, checkoutMovePartnerItems };`, context);

const { checkoutShopCartKey, checkoutStoreIdFromLocation, checkoutReadCart, checkoutMovePartnerItems } = context.shopCartTest;
assert.strictEqual(checkoutStoreIdFromLocation('/store/shop-a/checkout', ''), 'shop-a');
assert.strictEqual(checkoutStoreIdFromLocation('/checkout', '?store=shop-b'), 'shop-b');
assert.strictEqual(checkoutStoreIdFromLocation('/checkout', ''), '');
const legacyCart = [
  { id: 'lovara-1', name: 'LOVARA item', quantity: 1 },
  { id: 'partner-a-1', storeId: 'shop-a', storeSlug: 'shop-a', qty: 2, color: 'Black' },
  { id: 'partner-b-1', storeId: 'shop-b', storeSlug: 'shop-b', qty: 1, color: 'Blue' }
];
values.set('lovara_cart', JSON.stringify(legacyCart));
values.set(checkoutShopCartKey('shop-a'), JSON.stringify([
  { id: 'partner-a-1', productId: 'partner-a-1', storeId: 'shop-a', qty: 1, color: 'Black' }
]));
const migrated = checkoutMovePartnerItems(checkoutReadCart('lovara_cart'));
values.set('lovara_cart', JSON.stringify(migrated.mainItems));

assert.strictEqual(JSON.stringify(migrated.storeIds.sort()), JSON.stringify(['shop-a', 'shop-b']));
assert.deepStrictEqual(JSON.parse(values.get('lovara_cart')).map(item => item.id), ['lovara-1']);
assert.strictEqual(checkoutReadCart(checkoutShopCartKey('shop-a'))[0].qty, 3, 'separate legacy and current additions are preserved');
assert.strictEqual(checkoutReadCart(checkoutShopCartKey('shop-b'))[0].qty, 1);
assert.notStrictEqual(checkoutShopCartKey('shop-a'), checkoutShopCartKey('shop-b'));
checkoutMovePartnerItems([{ id: 'partner-a-1', storeId: 'shop-a', qty: 2, color: 'Black' }], 'max');
assert.strictEqual(checkoutReadCart(checkoutShopCartKey('shop-a'))[0].qty, 3, 'a selected-cart copy does not duplicate the legacy basket');

const storefront = fs.readFileSync('public/js/storefront.js', 'utf8');
const storeHtml = fs.readFileSync('public/store.html', 'utf8');
const addStart = storefront.indexOf('function addToCart(');
const addEnd = storefront.indexOf('\n  function setupAccountMenu', addStart);
const addSource = storefront.slice(addStart, addEnd);
assert(addSource.includes("localStorage.setItem(shopCartKey(currentStore.id)"), 'storefront writes to the current shop cart');
assert(!addSource.includes("localStorage.setItem('lovara_cart'"), 'storefront never adds partner products to the LOVARA cart');
assert(storeHtml.includes('href="/checkout"'), 'the store cart link has a safe fallback before JavaScript loads');
assert(storeHtml.includes('storefront.js?v=shopify-style-6'), 'storefront cart logic uses a cache-busted asset URL');
const routes = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites;
assert.strictEqual(routes[0].source, '/store/:slug/checkout', 'the store checkout rewrite precedes the generic store route');

console.log('shop cart isolation tests passed');
