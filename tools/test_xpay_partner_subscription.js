const assert = require('assert');
const crypto = require('crypto');

const records = new Map();
class Ref {
  constructor(db, path) { this.db = db; this.path = path; }
  async get() { const value = this.db.records.get(this.path); return { exists: value !== undefined, data: () => value }; }
}
const db = {
  records,
  collection(name) { return { doc: id => new Ref(this, `${name}/${id}`) }; },
  async runTransaction(callback) {
    const writes = [];
    const tx = {
      get: ref => ref.get(),
      create: (ref, value) => writes.push({ kind: 'create', path: ref.path, value }),
      set: (ref, value, options) => writes.push({ kind: 'set', path: ref.path, value, merge: !!options?.merge }),
      update: (ref, value) => writes.push({ kind: 'update', path: ref.path, value })
    };
    const result = await callback(tx);
    for (const write of writes) {
      if (write.kind === 'create') {
        if (records.has(write.path)) throw Object.assign(new Error('exists'), { code: 6 });
        records.set(write.path, write.value);
      } else if (write.kind === 'set') {
        records.set(write.path, write.merge ? { ...(records.get(write.path) || {}), ...write.value } : write.value);
      } else {
        records.set(write.path, { ...(records.get(write.path) || {}), ...write.value });
      }
    }
    return result;
  }
};
function fakeFirestore() { return db; }
fakeFirestore.FieldValue = { serverTimestamp: () => ({ serverTimestamp: true }) };
fakeFirestore.Timestamp = { fromDate: date => ({ toDate: () => date }) };
const fakeApp = { firestore: fakeFirestore };
const firestoreModulePath = require.resolve('../api/_lib/firestore');
require.cache[firestoreModulePath] = { id: firestoreModulePath, filename: firestoreModulePath, loaded: true, exports: { admin: () => fakeApp } };
process.env.XPAY_WEBHOOK_SECRET = 'test-webhook-secret';
const endpoint = require('../api/xpay/webhook');

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function send(event, timestamp = Math.floor(Date.now() / 1000), corruptSignature = false) {
  const raw = JSON.stringify(event);
  let signature = crypto.createHmac('sha256', process.env.XPAY_WEBHOOK_SECRET).update(`${timestamp}.`).update(raw).digest('hex');
  if (corruptSignature) signature = '0'.repeat(64);
  const response = responseRecorder();
  await endpoint({ method: 'POST', headers: { 'xpay-signature': `t=${timestamp},v1=${signature}` }, body: event }, response);
  return response;
}
function seed(paymentId) {
  records.clear();
  records.set(`pendingStoreSubscriptions/${paymentId}`, {
    type: 'store_subscription', paymentId, requestUid: 'partner-1', ownerUid: 'partner-1',
    planId: 'super_plus', amountMinor: 22500, currency: 'EGP', durationMonths: 3, durationDays: 0,
    status: 'awaiting_payment', paid: false
  });
  records.set('storeRequests/partner-1', {
    ownerUid: 'partner-1', status: 'pending', planId: 'super_plus', paymentMethod: 'visa',
    paymentStatus: 'awaiting_payment', paymentId
  });
}

(async () => {
  const paymentId = 'SUB-0123456789ABCDEF01234567';
  seed(paymentId);
  const badSignature = await send({ id: 'evt-bad-signature' }, undefined, true);
  assert.strictEqual(badSignature.statusCode, 401, 'invalid HMAC signatures are rejected');
  const stale = await send({ id: 'evt-stale' }, Math.floor(Date.now() / 1000) - 301);
  assert.strictEqual(stale.statusCode, 401, 'stale webhook timestamps are rejected');

  const wrongAmount = await send({
    id: 'evt-wrong', type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_wrong', status: 'complete', paymentStatus: 'paid', amountTotal: 5500, currency: 'EGP', metadata: { type: 'store_subscription', paymentId } } }
  });
  assert.strictEqual(wrongAmount.statusCode, 409, 'wrong price is rejected before marking the request paid');
  assert.strictEqual(records.get('storeRequests/partner-1').paymentStatus, 'awaiting_payment');

  const paidEvent = {
    id: 'evt-paid', type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_paid', status: 'complete', paymentStatus: 'paid', amountTotal: 22500, currency: 'EGP', paymentIntent: { id: 'pi-1' }, metadata: { type: 'store_subscription', paymentId } } }
  };
  const paid = await send(paidEvent);
  assert.strictEqual(paid.statusCode, 200);
  assert.strictEqual(paid.body.paid, true);
  assert.strictEqual(records.get('storeRequests/partner-1').paymentStatus, 'paid');
  assert.strictEqual(records.get('pendingStoreSubscriptions/' + paymentId).status, 'paid');
  assert.strictEqual(records.has('shops/super_plus'), false, 'a payment event does not bypass the admin approval gate');
  const replay = await send(paidEvent);
  assert.strictEqual(replay.statusCode, 200);
  assert.strictEqual(replay.body.paid, false, 'duplicate event delivery is idempotent');

  console.log('XPay partner subscription webhook tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
