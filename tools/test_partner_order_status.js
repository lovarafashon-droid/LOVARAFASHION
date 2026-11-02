const assert = require('assert');

const data = new Map();
const versions = new Map();

class CollectionReference {
  constructor(db, collectionPath) { this.db = db; this.path = collectionPath; }
  doc(id) { return new DocumentReference(this.db, `${this.path}/${id}`); }
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
    return { exists: value !== undefined, data: () => value, id: ref.id };
  },
  async runTransaction(callback) {
    const writes = [];
    const transaction = {
      get: ref => ref.get(),
      update: (ref, value) => writes.push({ ref, value })
    };
    const result = await callback(transaction);
    writes.forEach(write => {
      data.set(write.ref.path, { ...(data.get(write.ref.path) || {}), ...write.value });
      versions.set(write.ref.path, (versions.get(write.ref.path) || 0) + 1);
    });
    return result;
  }
};

const fakeAdminApp = {
  auth: () => ({ verifyIdToken: async token => {
    if (token === 'seller-token') return { uid: 'seller-1' };
    if (token === 'other-token') return { uid: 'seller-2' };
    throw new Error('invalid token');
  } }),
  firestore: () => db
};
fakeAdminApp.firestore.FieldValue = { serverTimestamp: () => ({ serverTimestamp: true }) };
const fakeAdmin = () => fakeAdminApp;
const firestoreModulePath = require.resolve('../api/_lib/firestore');
require.cache[firestoreModulePath] = { id: firestoreModulePath, filename: firestoreModulePath, loaded: true, exports: { admin: fakeAdmin } };

const updateStatus = require('../api/partner-orders');
const { canTransitionSellerStatus, normalizeCancellationReason } = require('../api/_lib/seller-order-status');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function call(body, authorization = 'Bearer seller-token', method = 'POST') {
  const response = responseRecorder();
  await updateStatus({ method, headers: authorization ? { authorization } : {}, body: { action: 'update-status', ...body } }, response);
  return response;
}

function seedOrder(orderId, { status = 'new', payment = { method: 'cod', status: 'cash_on_delivery' }, storeIds = ['shop-a'] } = {}) {
  data.set('users/seller-1', { storeId: 'shop-a' });
  data.set('shops/shop-a', { ownerUid: 'seller-1' });
  data.set(`orders/${orderId}`, {
    orderNumber: orderId,
    status: 'pending',
    confirmationStatus: 'pending',
    payment,
    items: storeIds.map(storeId => ({ storeId, productId: 'product-1' }))
  });
  data.set(`shops/shop-a/orders/${orderId}`, {
    orderNumber: orderId,
    parentOrderId: orderId,
    storeId: 'shop-a',
    sellerStatus: status,
    items: [{ storeId: 'shop-a', productId: 'product-1' }]
  });
}

async function run() {
  seedOrder('LOV-ABCDE');
  let result = await call({ orderId: 'LOV-ABCDE', status: 'confirmed' }, '', 'POST');
  assert.strictEqual(result.statusCode, 401, 'unauthenticated updates are rejected');
  result = await call({ orderId: 'LOV-ABCDE', status: 'confirmed' }, 'Bearer other-token');
  assert.strictEqual(result.statusCode, 403, 'a different account cannot update this shop order');
  result = await call({ orderId: 'LOV-ABCDE', status: 'invented' });
  assert.strictEqual(result.statusCode, 400, 'unknown statuses are rejected');
  assert.strictEqual(canTransitionSellerStatus('new', 'confirmed'), true, 'new orders can be confirmed');
  assert.strictEqual(canTransitionSellerStatus('new', 'delivered'), false, 'new orders cannot skip directly to delivery');
  assert.strictEqual(normalizeCancellationReason('   سبب واضح   '), 'سبب واضح', 'cancellation reasons are trimmed');
  assert.strictEqual(normalizeCancellationReason('لا'), '', 'short cancellation reasons are rejected');

  result = await call({ orderId: 'LOV-ABCDE', status: 'confirmed' });
  assert.strictEqual(result.statusCode, 200, 'the shop owner can confirm a new order');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-ABCDE').sellerStatus, 'confirmed', 'the partner order moves to confirmed');
  assert.strictEqual(data.get('orders/LOV-ABCDE').status, 'confirmed', 'the parent order status is synchronized');
  assert.strictEqual(data.get('orders/LOV-ABCDE').confirmationStatus, 'confirmed', 'confirmation status is synchronized');

  result = await call({ orderId: 'LOV-ABCDE', status: 'shipped' });
  assert.strictEqual(result.statusCode, 200, 'a confirmed order can be marked as shipped');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-ABCDE').sellerStatus, 'shipped', 'the order moves to the in-transit list');
  result = await call({ orderId: 'LOV-ABCDE', status: 'confirmed' });
  assert.strictEqual(result.statusCode, 409, 'a shipped order cannot move backward');
  result = await call({ orderId: 'LOV-ABCDE', status: 'delivered' });
  assert.strictEqual(result.statusCode, 200, 'a shipped order can be marked as delivered');
  assert.strictEqual(data.get('orders/LOV-ABCDE').status, 'delivered', 'delivery status is synchronized to the customer order');

  seedOrder('LOV-CANCEL', { status: 'preparing' });
  result = await call({ orderId: 'LOV-CANCEL', status: 'cancelled', reason: 'المنتج غير متوفر حاليًا' });
  assert.strictEqual(result.statusCode, 200, 'an unpaid COD order can be cancelled with a reason before shipping');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-CANCEL').cancellationReason, 'المنتج غير متوفر حاليًا', 'reason is stored on the partner order');
  assert.strictEqual(data.get('shops/shop-a/orders/LOV-CANCEL').cancelledBy, 'seller', 'the cancellation actor is recorded');
  assert.strictEqual(data.get('orders/LOV-CANCEL').status, 'cancelled', 'customer-facing order status is synchronized');

  seedOrder('LOV-VISAA', { payment: { method: 'visa', status: 'paid', paid: true } });
  result = await call({ orderId: 'LOV-VISAA', status: 'cancelled', reason: 'سبب إلغاء مناسب' });
  assert.strictEqual(result.statusCode, 409, 'electronically paid orders cannot be cancelled by a seller');
  assert.strictEqual(data.get('orders/LOV-VISAA').status, 'pending', 'a rejected cancellation leaves the order unchanged');

  seedOrder('LOV-MULTI', { storeIds: ['shop-a', 'shop-b'] });
  result = await call({ orderId: 'LOV-MULTI', status: 'confirmed' });
  assert.strictEqual(result.statusCode, 409, 'mixed-store parent orders cannot be globally changed by one seller');

  result = await call({ orderId: 'LOV-CANCEL', status: 'cancelled', reason: 'قصير' });
  assert.strictEqual(result.statusCode, 422, 'cancellation requires an adequate reason');

  console.log('partner order status tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
