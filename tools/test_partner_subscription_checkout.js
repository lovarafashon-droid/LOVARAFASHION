const assert = require('assert');

const records = new Map();
class Ref {
  constructor(db, path) { this.db = db; this.path = path; }
  async get() {
    const value = this.db.records.get(this.path);
    return { exists: value !== undefined, data: () => value };
  }
  async update(value) {
    if (!this.db.records.has(this.path)) throw new Error('missing document');
    this.db.records.set(this.path, { ...this.db.records.get(this.path), ...value });
  }
  async set(value, options = {}) {
    this.db.records.set(this.path, options.merge ? { ...(this.db.records.get(this.path) || {}), ...value } : value);
  }
  async create(value) {
    if (this.db.records.has(this.path)) throw Object.assign(new Error('exists'), { code: 6 });
    this.db.records.set(this.path, value);
  }
}
const db = {
  records,
  collection(name) { return { doc: id => new Ref(this, `${name}/${id}`) }; },
  async runTransaction(callback) {
    const pending = [];
    const tx = {
      get: ref => ref.get(),
      update: (ref, value) => pending.push(() => ref.update(value)),
      set: (ref, value, options) => pending.push(() => ref.set(value, options)),
      create: (ref, value) => pending.push(() => ref.create(value))
    };
    const result = await callback(tx);
    for (const apply of pending) await apply();
    return result;
  }
};
function fakeFirestore() { return db; }
fakeFirestore.FieldValue = { serverTimestamp: () => ({ serverTimestamp: true }) };
fakeFirestore.Timestamp = { fromDate: date => ({ toDate: () => date, seconds: Math.floor(date.getTime() / 1000) }) };
const fakeApp = {
  auth: () => ({ verifyIdToken: async token => {
    if (token === 'valid-token') return { uid: 'user-1' };
    throw Object.assign(new Error('invalid token'), { code: 'auth/invalid-id-token' });
  } }),
  firestore: fakeFirestore
};
const firestoreModulePath = require.resolve('../api/_lib/firestore');
require.cache[firestoreModulePath] = { id: firestoreModulePath, filename: firestoreModulePath, loaded: true, exports: { admin: () => fakeApp } };

process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.invalid';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';
process.env.XPAY_CHECKOUT_URL = 'https://xpay.invalid/checkout';
process.env.XPAY_API_KEY = 'test-key';
process.env.XPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PUBLIC_SITE_URL = 'https://lovara.test';
let sentPayload = null;
let checkoutCalls = 0;
global.fetch = async (_url, options) => {
  checkoutCalls++;
  sentPayload = JSON.parse(options.body);
  return { ok: true, json: async () => ({ id: 'xpay-session-1', clientSecret: 'client-secret', expiresAt: new Date(Date.now() + 3600000).toISOString() }) };
};

const endpoint = require('../api/xpay/create-partnership-checkout');
function responseRecorder() {
  return { statusCode: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function call(body, token = 'valid-token') {
  const res = responseRecorder();
  await endpoint({ method: 'POST', headers: { host: 'lovara.test', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body }, res);
  return res;
}
function seedRequest(extra = {}) {
  records.set('storeRequests/user-1', {
    ownerUid: 'user-1', status: 'pending', storeName: 'متجر اختبار', supportPhone: '+201000000000',
    imageUrl: 'https://ik.imagekit.io/test/store.jpg', ...extra
  });
}

(async () => {
  const unauthenticated = await call({ action: 'manual-vodafone', planId: 'plus' }, '');
  assert.strictEqual(unauthenticated.statusCode, 401, 'payment methods require a signed-in account');

  seedRequest();
  const savedWebhookSecret = process.env.XPAY_WEBHOOK_SECRET;
  delete process.env.XPAY_WEBHOOK_SECRET;
  const unconfiguredVisa = await call({ action: 'create-checkout', planId: 'plus' });
  assert.strictEqual(unconfiguredVisa.statusCode, 503, 'Visa checkout is blocked until webhook verification is configured');
  assert.strictEqual(checkoutCalls, 0, 'missing webhook secret cannot create a chargeable XPay session');
  assert.strictEqual(records.get('storeRequests/user-1').paymentStatus, undefined);
  process.env.XPAY_WEBHOOK_SECRET = savedWebhookSecret;

  seedRequest();
  const manual = await call({ action: 'manual-vodafone', planId: 'super_plus', amountMinor: 1 });
  assert.strictEqual(manual.statusCode, 200);
  assert.strictEqual(records.get('storeRequests/user-1').paymentMethod, 'vodafone_cash');
  assert.strictEqual(records.get('storeRequests/user-1').amountMinor, 22500, 'the server derives Vodafone amount from the selected plan');
  assert.strictEqual(sentPayload, null, 'manual Vodafone transfer does not create a card checkout');

  seedRequest();
  const card = await call({ action: 'create-checkout', planId: 'premium', amountMinor: 1 });
  assert.strictEqual(card.statusCode, 200);
  assert.strictEqual(card.body.clientSecret, 'client-secret');
  assert.strictEqual(sentPayload.lineItems[0].priceData.unitAmount, 55500, 'Premium checkout charges 555 EGP, independent of client-supplied price');
  assert.strictEqual(sentPayload.metadata.planId, 'premium');
  assert.strictEqual(sentPayload.metadata.type, 'store_subscription');
  const payment = [...records.entries()].find(([path]) => path.startsWith('pendingStoreSubscriptions/'))?.[1];
  assert.strictEqual(payment.amountMinor, 55500);
  assert.strictEqual(payment.durationMonths, 6);
  assert.strictEqual(records.get('storeRequests/user-1').paymentStatus, 'awaiting_payment');
  const firstCheckoutCalls = checkoutCalls;
  const resumed = await call({ action: 'create-checkout', planId: 'premium', amountMinor: 1 });
  assert.strictEqual(resumed.statusCode, 200);
  assert.strictEqual(resumed.body.clientSecret, 'client-secret');
  assert.strictEqual(checkoutCalls, firstCheckoutCalls, 'retrying an active checkout reuses its existing XPay session');

  seedRequest();
  const free = await call({ action: 'free-trial', planId: 'free_trial', amountMinor: 999999 });
  assert.strictEqual(free.statusCode, 200);
  assert.strictEqual(records.get('storeRequests/user-1').paymentStatus, 'free_trial');
  assert.strictEqual(records.get('storeRequests/user-1').durationDays, 7);

  console.log('partner subscription checkout tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
