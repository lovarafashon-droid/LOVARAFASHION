const assert = require('assert');
const crypto = require('crypto');

const guestToken = 'a'.repeat(64);
const guestHash = crypto.createHash('sha256').update(guestToken).digest('hex');
const records = {
  orders: {
    'LOV-ABCDE': {
      orderNumber: 'LOV-ABCDE', storeId: 'shop-a', userId: 'guest', returnTokenHash: guestHash,
      payment: { method: 'visa', status: 'paid', paid: true }
    },
    'LOV-FGHIJ': {
      orderNumber: 'LOV-FGHIJ', storeId: '', userId: 'user-1',
      payment: { method: 'visa', status: 'paid', paid: true }
    }
  },
  pendingOrders: {}
};

const firestoreModulePath = require.resolve('../api/_lib/firestore');
require.cache[firestoreModulePath] = {
  id: firestoreModulePath,
  filename: firestoreModulePath,
  loaded: true,
  exports: {
    admin: () => ({
      auth: () => ({
        verifyIdToken: async token => {
          if (token !== 'valid-user-token') throw new Error('bad token');
          return { uid: 'user-1' };
        }
      }),
      firestore: () => ({
        collection: name => ({
          doc: id => ({
            get: async () => {
              const data = records[name]?.[id];
              return { exists: !!data, data: () => data };
            }
          })
        })
      })
    })
  }
};

const endpoint = require('../api/xpay/checkout-status');
async function request({ order = 'LOV-ABCDE', storeId = 'shop-a', token = '', auth = '' } = {}) {
  const result = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await endpoint({
    method: 'GET',
    query: { order, storeId },
    headers: {
      ...(token ? { 'x-checkout-return-token': token } : {}),
      ...(auth ? { authorization: `Bearer ${auth}` } : {})
    }
  }, result);
  return result;
}

(async () => {
  const paidGuest = await request({ token: guestToken });
  assert.strictEqual(paidGuest.statusCode, 200);
  assert.strictEqual(paidGuest.body.status, 'paid');
  assert.strictEqual(Object.keys(paidGuest.body).sort().join(','), 'orderNumber,status');

  const wrongToken = await request({ token: 'b'.repeat(64) });
  assert.strictEqual(wrongToken.statusCode, 403);

  const wrongStore = await request({ storeId: 'shop-b', token: guestToken });
  assert.strictEqual(wrongStore.statusCode, 404);

  const accountOrder = await request({ order: 'LOV-FGHIJ', storeId: '', auth: 'valid-user-token' });
  assert.strictEqual(accountOrder.statusCode, 200);
  assert.strictEqual(accountOrder.body.status, 'paid');

  const missingAccountToken = await request({ order: 'LOV-FGHIJ', storeId: '' });
  assert.strictEqual(missingAccountToken.statusCode, 403);

  console.log('XPay checkout status tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
