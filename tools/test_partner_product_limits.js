const assert = require('assert');

const records = new Map();
let nextId = 1;
class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Collection(this.db, `${this.path}/${name}`); }
  async get() {
    const value = this.db.records.get(this.path);
    return { exists: value !== undefined, data: () => value };
  }
}
class Collection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, `${this.path}/${id || `auto-${nextId++}`}`); }
  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.records.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => ({ id: path.split('/').pop(), ref: new Ref(this.db, path), exists: true, data: () => value }));
    return { size: docs.length, docs, empty: docs.length === 0 };
  }
}
const db = {
  records,
  collection(name) { return new Collection(this, name); },
  async runTransaction(callback) {
    const writes = [];
    const tx = {
      get: ref => ref.get(),
      create: (ref, value) => writes.push({ kind: 'create', ref, value }),
      set: (ref, value, options = {}) => writes.push({ kind: 'set', ref, value, merge: !!options.merge }),
      update: (ref, value) => writes.push({ kind: 'update', ref, value }),
      delete: ref => writes.push({ kind: 'delete', ref })
    };
    const result = await callback(tx);
    for (const write of writes) {
      const path = write.ref.path;
      if (write.kind === 'create') {
        if (records.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
        records.set(path, write.value);
      } else if (write.kind === 'set') {
        records.set(path, write.merge ? { ...(records.get(path) || {}), ...write.value } : write.value);
      } else if (write.kind === 'update') {
        if (!records.has(path)) throw new Error('missing document');
        records.set(path, { ...records.get(path), ...write.value });
      } else {
        records.delete(path);
      }
    }
    return result;
  }
};
function fakeFirestore() { return db; }
fakeFirestore.FieldValue = { serverTimestamp: () => ({ serverTimestamp: true }) };
const fakeApp = {
  auth: () => ({ verifyIdToken: async token => {
    if (token === 'owner-token') return { uid: 'owner-1' };
    if (token === 'attacker-token') return { uid: 'attacker-1' };
    throw new Error('invalid token');
  } }),
  firestore: fakeFirestore
};
const firestoreModulePath = require.resolve('../api/_lib/firestore');
require.cache[firestoreModulePath] = { id: firestoreModulePath, filename: firestoreModulePath, loaded: true, exports: { admin: () => fakeApp } };
const endpoint = require('../api/partner-products');

function responseRecorder() {
  return { statusCode: 200, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function call(body, token = 'owner-token') {
  const res = responseRecorder();
  await endpoint({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return res;
}
function seedShop(shopId, plan, extra = {}) {
  records.set(`shops/${shopId}`, {
    ownerUid: 'owner-1', active: true, subscriptionPlan: plan,
    expiresAt: new Date(Date.now() + 86400000), ...extra
  });
}
function product(name, extra = {}) {
  return { name, category: 'اختبار', description: 'وصف', price: 100, imageUrl: 'https://ik.imagekit.io/test/item.jpg', ...extra };
}

(async () => {
  const unauthenticated = await call({ action: 'create', storeId: 'plus-shop', product: product('منتج') }, '');
  assert.strictEqual(unauthenticated.statusCode, 401);

  seedShop('plus-shop', 'plus', { productCount: 19 });
  for (let i = 1; i <= 19; i++) records.set(`shops/plus-shop/products/p-${i}`, { ownerUid: 'owner-1', name: `p-${i}` });
  const forbidden = await call({ action: 'create', storeId: 'plus-shop', product: product('محاولة') }, 'attacker-token');
  assert.strictEqual(forbidden.statusCode, 403, 'only the verified shop owner can mutate products');
  const twentieth = await call({ action: 'create', storeId: 'plus-shop', product: product('المنتج العشرون') });
  assert.strictEqual(twentieth.statusCode, 200);
  assert.strictEqual(twentieth.body.productCount, 20);
  const twentyFirst = await call({ action: 'create', storeId: 'plus-shop', product: product('منتج زائد') });
  assert.strictEqual(twentyFirst.statusCode, 409, 'the server blocks products beyond Plus quota');
  const deleteOne = await call({ action: 'delete', storeId: 'plus-shop', productId: 'p-19' });
  assert.strictEqual(deleteOne.statusCode, 200);
  assert.strictEqual(deleteOne.body.productCount, 19);
  const afterDelete = await call({ action: 'create', storeId: 'plus-shop', product: product('منتج بعد الحذف') });
  assert.strictEqual(afterDelete.statusCode, 200);
  const plusBranding = await call({ action: 'update-settings', storeId: 'plus-shop', settings: { themeColor: '#334455' } });
  assert.strictEqual(plusBranding.statusCode, 403, 'Plus cannot change store branding');

  seedShop('free-shop', 'free_trial', { productCount: 19 });
  for (let i = 1; i <= 19; i++) records.set(`shops/free-shop/products/p-${i}`, { ownerUid: 'owner-1', name: `p-${i}` });
  const freeProduct = await call({ action: 'create', storeId: 'free-shop', product: product('المنتج العشرون في التجربة') });
  assert.strictEqual(freeProduct.statusCode, 200, 'the free trial can publish up to its configured product limit');
  const freeQuota = await call({ action: 'create', storeId: 'free-shop', product: product('منتج التجربة الزائد') });
  assert.strictEqual(freeQuota.statusCode, 409, 'the free trial product limit is still enforced server-side');

  seedShop('super-shop', 'super_plus', { productCount: 75 });
  for (let i = 1; i <= 75; i++) records.set(`shops/super-shop/products/p-${i}`, { ownerUid: 'owner-1', name: `p-${i}` });
  const superBranding = await call({ action: 'update-settings', storeId: 'super-shop', settings: { themeColor: '#334455', announcementText: 'رسالة المتجر' } });
  assert.strictEqual(superBranding.statusCode, 200, 'Super Plus supports theme and announcement customization');
  assert.strictEqual(records.get('shops/super-shop').themeColor, '#334455');
  const superQuota = await call({ action: 'create', storeId: 'super-shop', product: product('المنتج 76') });
  assert.strictEqual(superQuota.statusCode, 409, 'the server blocks products beyond Super Plus quota');

  seedShop('premium-shop', 'premium', { productCount: 149 });
  for (let i = 1; i <= 149; i++) records.set(`shops/premium-shop/products/p-${i}`, { ownerUid: 'owner-1', name: `p-${i}` });
  const saleEndsAt = Date.now() + 3600000;
  const premiumSale = await call({ action: 'create', storeId: 'premium-shop', product: product('عرض بريميوم', { salePrice: 75, saleEndsAt }) });
  assert.strictEqual(premiumSale.statusCode, 200, 'Premium supports timed product discounts');
  assert.strictEqual(premiumSale.body.productCount, 150);
  const premiumQuota = await call({ action: 'create', storeId: 'premium-shop', product: product('المنتج 151') });
  assert.strictEqual(premiumQuota.statusCode, 409, 'the server blocks products beyond Premium quota');
  const premiumHero = await call({ action: 'update-settings', storeId: 'premium-shop', settings: { heroTitle: 'عنوان مميز' } });
  assert.strictEqual(premiumHero.statusCode, 200, 'Premium supports advanced storefront customization');

  console.log('partner product quota and plan enforcement tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
