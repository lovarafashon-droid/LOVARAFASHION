const assert = require('assert');
const path = require('path');

const data = new Map();
const versions = new Map();
let verifiedUser = { uid: 'customer-1', email: 'customer@example.test' };
let beforeNextTransaction = null;

class CollectionReference {
  constructor(db, collectionPath) { this.db = db; this.path = collectionPath; }
  doc(id) { return new DocumentReference(this.db, `${this.path}/${id}`); }
  where() { return this; }
  limit() { return this; }
  async get() { return { empty: true, docs: [] }; }
  get parent() { return new DocumentReference(this.db, this.path.split('/').slice(0, -1).join('/')); }
}

class DocumentReference {
  constructor(db, documentPath) {
    this.db = db;
    this.path = documentPath;
    this.id = documentPath.split('/').pop();
    this.parent = new CollectionReference(db, documentPath.split('/').slice(0, -1).join('/'));
  }
  collection(name) { return new CollectionReference(this.db, `${this.path}/${name}`); }
  async get() { return this.db.snapshot(this); }
}

const db = {
  collection(name) { return new CollectionReference(this, name); },
  snapshot(ref) {
    const value = data.get(ref.path);
    const version = versions.get(ref.path) || 1;
    return { exists: value !== undefined, data: () => value, updateTime: { toMillis: () => version }, id: ref.id };
  },
  async runTransaction(callback) {
    if (beforeNextTransaction) {
      const before = beforeNextTransaction;
      beforeNextTransaction = null;
      await before();
    }
    const writes = [];
    const transaction = {
      get: ref => ref.get(),
      update: (ref, value) => writes.push({ type: 'update', ref, value }),
      set: (ref, value, options) => writes.push({ type: 'set', ref, value, options }),
      create: (ref, value) => writes.push({ type: 'create', ref, value }),
      delete: ref => writes.push({ type: 'delete', ref })
    };
    const result = await callback(transaction);
    for (const write of writes) {
      const current = data.get(write.ref.path);
      if (write.type === 'delete') data.delete(write.ref.path);
      else if (write.type === 'update' || (write.type === 'set' && write.options?.merge)) {
        data.set(write.ref.path, { ...(current || {}), ...write.value });
      } else data.set(write.ref.path, write.value);
      versions.set(write.ref.path, (versions.get(write.ref.path) || 1) + 1);
    }
    return result;
  }
};

function fakeAdmin() { return fakeAdminApp; }
fakeAdmin.auth = undefined;
const fakeAdminApp = {
  auth: () => ({ verifyIdToken: async token => {
    if (token !== 'valid-token') throw new Error('bad token');
    return verifiedUser;
  } }),
  firestore: () => db
};
fakeAdminApp.firestore.FieldValue = { serverTimestamp: () => ({ serverTimestamp: true }) };
fakeAdminApp.firestore.Timestamp = { fromDate: date => date };

const firestoreModulePath = require.resolve('../api/_lib/firestore');
require.cache[firestoreModulePath] = { id: firestoreModulePath, filename: firestoreModulePath, loaded: true, exports: { admin: fakeAdmin } };
const updateOrder = require('../api/update-order');
const cancelOrder = require('../api/cancel-order');
const { expectedShipping } = require('../api/_lib/partner-orders');

function seedOrder(id, overrides = {}) {
  const items = [
    { productId: 'dress-1', id: 'dress-1', name: 'Dress', price: 100, quantity: 1, qty: 1, color: 'Black', colors: ['Black', 'White'], sizes: ['S', 'M'], size: 'S', quantityDiscountEnabled: false },
    { productId: 'shop-item-1', id: 'shop-item-1', storeId: 'shop-a', storeName: 'Shop A', name: 'Partner top', price: 250, quantity: 1, qty: 1, color: 'Red', colors: ['Red', 'Blue'], sizes: ['M', 'L'], size: 'M' }
  ];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = expectedShipping('Cairo', subtotal, 'cod');
  data.set(`orders/${id}`, {
    orderNumber: id,
    userId: 'customer-1',
    status: 'pending',
    customer: { firstName: 'Customer', email: 'customer@example.test', phone: '01000000000', address: 'Main street', city: 'Cairo', governorate: 'Cairo' },
    payment: { method: 'cod', status: 'unpaid', paid: false },
    items,
    totals: { subtotal: `EGP ${subtotal.toFixed(2)}`, shipping: `EGP ${shipping.toFixed(2)}`, discount: 'EGP 0.00', total: `EGP ${(subtotal + shipping).toFixed(2)}` },
    ...overrides
  });
  versions.set(`orders/${id}`, 1);
  return items;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function call(body, headers = { authorization: 'Bearer valid-token' }) {
  const res = responseRecorder();
  await updateOrder({ method: 'POST', headers, body }, res);
  return res;
}

async function callCancel(body, headers = { authorization: 'Bearer valid-token' }) {
  const res = responseRecorder();
  await cancelOrder({ method: 'POST', headers, body }, res);
  return res;
}

async function run() {
  const originalItems = seedOrder('LOV-ABCDE');
  data.set('products/dress-1', { name: 'Dress', price: 100, pricePiece: 100, colors: ['Black', 'White'], sizes: ['S', 'M'], cost: 30 });
  data.set('shops/shop-a', { storeName: 'Shop A', active: true, expiresAt: new Date(Date.now() + 86400000), ownerUid: 'seller-1' });
  data.set('shops/shop-a/products/shop-item-1', { name: 'Partner top', price: 250, colors: ['Red', 'Blue'], sizes: ['M', 'L'] });
  data.set('shops/shop-a/orders/LOV-ABCDE', { orderNumber: 'LOV-ABCDE', sellerStatus: 'new', items: [originalItems[1]], createdAt: new Date(0) });

  let result = await call({ orderId: 'LOV-ABCDE', items: [] }, {});
  assert.strictEqual(result.statusCode, 401, 'unauthenticated order edits are rejected');

  verifiedUser = { uid: 'attacker', email: 'attacker@example.test' };
  result = await call({ orderId: 'LOV-ABCDE', items: [{ itemIndex: 0, quantity: 1, colors: ['Black'] }] });
  assert.strictEqual(result.statusCode, 403, 'a different customer cannot edit the order');
  verifiedUser = { uid: 'attacker', email: 'customer@example.test', email_verified: false };
  result = await call({ orderId: 'LOV-ABCDE', items: [{ itemIndex: 0, quantity: 1, colors: ['Black'] }, { itemIndex: 1, quantity: 1, colors: ['Red'] }] });
  assert.strictEqual(result.statusCode, 403, 'an unverified matching email cannot claim another account’s order');
  data.set('orders/LOV-EMAIL', { orderNumber: 'LOV-EMAIL', userId: 'legacy-owner', status: 'pending', customer: { email: 'customer@example.test' }, payment: { method: 'cod' }, items: [{ storeId: 'shop-a', productId: 'partner-item' }] });
  versions.set('orders/LOV-EMAIL', 1);
  data.set('shops/shop-a/orders/LOV-EMAIL', { orderNumber: 'LOV-EMAIL', storeId: 'shop-a', sellerStatus: 'new' });
  result = await callCancel({ orderId: 'LOV-EMAIL' });
  assert.strictEqual(result.statusCode, 403, 'an unverified matching email cannot cancel a legacy order');
  verifiedUser = { uid: 'attacker', email: 'customer@example.test', email_verified: true };
  result = await callCancel({ orderId: 'LOV-EMAIL' });
  assert.strictEqual(result.statusCode, 200, 'a verified matching email may cancel a legacy email-owned order');
  assert.strictEqual(data.get('orders/LOV-EMAIL').status, 'cancelled', 'verified email cancellation is committed');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-EMAIL').sellerStatus, 'cancelled', 'customer cancellation moves the partner order to its cancelled list');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-EMAIL').cancellationReason, 'ألغى العميل الطلب.', 'the partner order records why the customer cancelled');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-EMAIL').cancelledBy, 'customer', 'the partner order records who cancelled it');
  verifiedUser = { uid: 'customer-1', email: 'customer@example.test' };

  seedOrder('LOV-PART1');
  result = await call({ orderId: 'LOV-PART1', items: [{ itemIndex: 0, quantity: 1, colors: ['Black'] }] });
  assert.strictEqual(result.statusCode, 400, 'the endpoint rejects a partial line-item list');

  result = await call({ orderId: 'LOV-ABCDE', items: [
    { itemIndex: 0, quantity: 1, colors: ['Purple'], size: 'S' },
    { itemIndex: 1, quantity: 1, colors: ['Red'], size: 'M' }
  ] });
  assert.strictEqual(result.statusCode, 422, 'the server rejects a color not listed by the product');
  result = await call({ orderId: 'LOV-ABCDE', items: [
    { itemIndex: 0, quantity: 1, colors: ['Black'], size: '-' },
    { itemIndex: 1, quantity: 1, colors: ['Red'], size: 'M' }
  ] });
  assert.strictEqual(result.statusCode, 422, 'a required size cannot be bypassed with the default sentinel');

  result = await call({ orderId: 'LOV-ABCDE', items: [
    { itemIndex: 0, quantity: 2, colors: ['Black', 'White'], size: 'M' },
    { itemIndex: 1, quantity: 1, colors: ['Blue'], size: 'L' }
  ] });
  assert.strictEqual(result.statusCode, 200, `valid pending COD edit succeeds: ${JSON.stringify(result.body)}`);
  const updated = data.get('orders/LOV-ABCDE');
  assert.strictEqual(updated.items[0].quantity, 2, 'the requested quantity is stored');
  assert.deepStrictEqual(updated.items[0].color, ['Black', 'White'], 'a different color may be selected for each unit');
  assert.strictEqual(updated.items[0].size, 'M', 'the product size is updated');
  assert.strictEqual(updated.items[1].color, 'Blue', 'partner color is canonicalized from the partner catalog');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-ABCDE').items[0].color, 'Blue', 'partner sub-order is synchronized with the main order');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-ABCDE').sellerStatus, 'new', 'seller workflow state is preserved');
  assert.strictEqual(updated.totals.subtotal, 'EGP 450.00', 'order totals are recalculated from canonical prices');

  data.set('products/basic-item', { name: 'Basic item', price: 50 });
  const basicSubtotal = 50;
  const basicShipping = expectedShipping('Cairo', basicSubtotal, 'cod');
  data.set('orders/LOV-NOCOL', {
    orderNumber: 'LOV-NOCOL', userId: 'customer-1', status: 'pending',
    customer: { firstName: 'Customer', email: 'customer@example.test', phone: '01000000000', address: 'Main street', city: 'Cairo', governorate: 'Cairo' },
    payment: { method: 'cod', status: 'unpaid', paid: false },
    items: [{ productId: 'basic-item', id: 'basic-item', name: 'Basic item', price: 50, quantity: 1, qty: 1, color: '-', size: '-' }],
    totals: { subtotal: 'EGP 50.00', shipping: `EGP ${basicShipping.toFixed(2)}`, discount: 'EGP 0.00', total: `EGP ${(basicSubtotal + basicShipping).toFixed(2)}` }
  });
  versions.set('orders/LOV-NOCOL', 1);
  result = await call({ orderId: 'LOV-NOCOL', items: [{ itemIndex: 0, quantity: 2, colors: [], size: '-' }] });
  assert.strictEqual(result.statusCode, 200, 'products without color variants can still be edited');
  assert.strictEqual(data.get('orders/LOV-NOCOL').items[0].quantity, 2, 'variant-free item quantity is saved');

  seedOrder('LOV-RACE1');
  beforeNextTransaction = async () => {
    data.set('products/dress-1', { ...data.get('products/dress-1'), price: 101, pricePiece: 101 });
    versions.set('products/dress-1', (versions.get('products/dress-1') || 1) + 1);
  };
  result = await call({ orderId: 'LOV-RACE1', items: [
    { itemIndex: 0, quantity: 1, colors: ['Black'], size: 'S' },
    { itemIndex: 1, quantity: 1, colors: ['Red'], size: 'M' }
  ] });
  assert.strictEqual(result.statusCode, 409, 'catalog changes between canonicalization and commit reject the stale edit');
  assert.strictEqual(data.get('orders/LOV-RACE1').items[0].quantity, 1, 'a stale catalog race leaves the order unchanged');

  seedOrder('LOV-VISA1', { payment: { method: 'visa', status: 'paid', paid: true } });
  result = await call({ orderId: 'LOV-VISA1', items: [{ itemIndex: 0, quantity: 2, colors: ['Black', 'White'], size: 'M' }] });
  assert.strictEqual(result.statusCode, 409, 'electronically paid orders cannot be edited');

  console.log('update order tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
