const assert = require('assert');
const { assertCheckoutStoreScope, canonicalizeCheckoutOrder, expectedShipping } = require('../api/_lib/partner-orders');

const products = {
  lovaraBra: {
    name: 'LOVARA bra',
    subcategory: 'bras',
    pricePiece: 1200,
    priceDozen: 9000,
    cost: 500
  },
  lovaraDress: {
    name: 'LOVARA dress',
    subcategory: 'dresses',
    price: 800,
    pricePiece: 800,
    cost: 350
  }
};
const shops = {
  shop1: {
    storeName: 'Partner Store',
    active: true,
    expiresAt: new Date(Date.now() + 86400000)
  }
};
const partnerProducts = {
  partnerItem: { name: 'Partner item', price: 300, salePrice: 0 }
};

function mockRef(path) {
  return {
    path,
    async get() {
      const parts = path.split('/');
      let value = null;
      if (parts[0] === 'products') value = products[parts[1]];
      else if (parts[0] === 'shops' && parts.length === 2) value = shops[parts[1]];
      else if (parts[0] === 'shops' && parts[2] === 'products') value = partnerProducts[parts[3]];
      return { exists: Boolean(value), data: () => value };
    },
    collection(name) {
      return { doc: id => mockRef(`${path}/${name}/${id}`) };
    }
  };
}

const db = {
  collection(name) {
    return { doc: id => mockRef(`${name}/${id}`) };
  }
};

function checkout(items, subtotal) {
  const shipping = expectedShipping('Cairo', subtotal, 'cod');
  return {
    customer: {
      firstName: 'Test',
      phone: '01000000000',
      address: 'Street 1',
      city: 'Cairo',
      governorate: 'Cairo'
    },
    payment: { method: 'cod' },
    items,
    totals: {
      subtotal: `EGP ${subtotal.toFixed(2)}`,
      shipping: `EGP ${shipping.toFixed(2)}`,
      discount: 'EGP 0.00',
      total: `EGP ${(subtotal + shipping).toFixed(2)}`
    }
  };
}

async function run() {
  assert.strictEqual(assertCheckoutStoreScope(checkout([
    { productId: 'lovaraDress', price: 800, quantity: 1 }
  ], 800)), '', 'the main checkout remains scoped to LOVARA products');
  assert.strictEqual(assertCheckoutStoreScope({ storeId: 'shop1', items: [{ productId: 'partnerItem', storeId: 'shop1' }] }, 'shop1'), 'shop1', 'a partner checkout is scoped to its requested shop');
  assert.throws(
    () => assertCheckoutStoreScope({ storeId: 'shop1', items: [{ productId: 'partnerItem', storeId: 'shop1' }] }, 'shop2'),
    error => error.statusCode === 403,
    'the route store cannot be changed independently of the submitted cart'
  );
  assert.throws(
    () => assertCheckoutStoreScope({ items: [{ productId: 'partnerItem', storeId: 'shop1' }] }),
    error => error.statusCode === 422,
    'the main checkout cannot accept partner products'
  );
  assert.throws(
    () => assertCheckoutStoreScope({ storeId: 'shop1', items: [{ productId: 'partnerItem', storeId: 'shop1' }, { productId: 'partnerItem', storeId: 'shop2' }] }, 'shop1'),
    error => error.statusCode === 422,
    'a partner checkout cannot mix products from two shops'
  );
  assert.throws(
    () => assertCheckoutStoreScope({ storeId: 'shop1', items: [{ productId: 'lovaraDress' }] }, 'shop1'),
    error => error.statusCode === 422,
    'a partner checkout cannot include LOVARA catalog products'
  );

  // The canonicalizer remains compatible with legacy/internal mixed records;
  // public checkout endpoints enforce the single-store rules above.
  const mixed = await canonicalizeCheckoutOrder(checkout([
    { productId: 'lovaraBra', price: 1200, quantity: 1 },
    { productId: 'partnerItem', storeId: 'shop1', price: 300, quantity: 1 }
  ], 1500), db);
  assert.strictEqual(mixed.items.length, 2, 'mixed carts keep both merchants’ items');
  assert.strictEqual(mixed.profit, 700, 'partner item revenue is excluded from LOVARA profit');

  const dozen = await canonicalizeCheckoutOrder(checkout([
    { productId: 'lovaraBra', price: 9000, quantity: 1, pricingUnit: 'dozen' }
  ], 9000), db);
  assert.strictEqual(dozen.items[0].pricingUnit, 'dozen', 'supported lingerie dozen pricing remains available');

  await assert.rejects(
    () => canonicalizeCheckoutOrder(checkout([
      { productId: 'lovaraDress', price: 800, quantity: 1, pricingUnit: 'dozen' }
    ], 800), db),
    error => error.statusCode === 422,
    'unsupported product categories cannot be checked out as dozens'
  );

  await assert.rejects(
    () => canonicalizeCheckoutOrder(checkout([
      { productId: 'lovaraBra', price: 1, quantity: 1 }
    ], 1), db),
    error => error.statusCode === 409,
    'tampered LOVARA prices are rejected'
  );

  await assert.rejects(
    () => canonicalizeCheckoutOrder(checkout([
      { productId: 'partnerItem', storeId: 'shop1', price: 1, quantity: 1 }
    ], 1), db),
    error => error.statusCode === 409,
    'tampered partner prices are rejected'
  );

  console.log('partner order pricing tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
