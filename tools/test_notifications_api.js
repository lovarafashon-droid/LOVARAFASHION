const assert = require('assert');
const values = new Map();
let verifiedUser = { uid: 'admin-1' };

class Ref {
  constructor(path) { this.path = path; }
  async get() {
    const value = values.get(this.path);
    return { exists: value !== undefined, data: () => value };
  }
  async set(value, options = {}) {
    values.set(this.path, options.merge ? { ...(values.get(this.path) || {}), ...value } : value);
  }
}

const db = { collection: name => ({ doc: id => new Ref(`${name}/${id}`) }) };
const fakeAdminApp = {
  auth: () => ({ verifyIdToken: async token => {
    if (token !== 'admin-token') throw new Error('invalid token');
    return verifiedUser;
  } }),
  firestore: () => db
};
fakeAdminApp.firestore.FieldValue = { serverTimestamp: () => ({ serverTimestamp: true }) };
const fakeAdmin = () => fakeAdminApp;
const firestorePath = require.resolve('../api/_lib/firestore');
require.cache[firestorePath] = { id: firestorePath, filename: firestorePath, loaded: true, exports: { admin: fakeAdmin } };
process.env.XPAY_WEBHOOK_SECRET = 'test-webhook-secret';
const handler = require('../api/notifications');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function call(action, overrides = {}) {
  const res = responseRecorder();
  const req = {
    method: 'POST',
    query: { action },
    headers: { authorization: 'Bearer admin-token' },
    body: { token: 'push-device-token', userAgent: 'LOVARA test' },
    ...overrides
  };
  await handler(req, res);
  return res;
}

async function run() {
  let result = await call('unknown');
  assert.strictEqual(result.statusCode, 400, 'unknown actions are rejected');

  result = await call('new-order', { headers: {} });
  assert.strictEqual(result.statusCode, 401, 'the internal new-order notification endpoint rejects public callers');

  result = await call('register', { headers: {} });
  assert.strictEqual(result.statusCode, 401, 'unauthenticated device registrations are rejected');

  values.set('users/admin-1', { role: 'admin' });
  result = await call('register');
  assert.strictEqual(result.statusCode, 200, 'admins can register their notification token');
  assert.strictEqual(result.body.registered, true);
  const crypto = require('crypto');
  const id = `device_${crypto.createHash('sha256').update('push-device-token').digest('hex').slice(0, 32)}`;
  assert.strictEqual(values.get(`notificationTokens/${id}`).active, true, 'registration activates the token');
  assert.strictEqual(values.get(`notificationTokens/${id}`).userAgent, 'LOVARA test', 'registration records the browser agent');

  result = await call('unregister');
  assert.strictEqual(result.statusCode, 200, 'admins can deactivate their notification token');
  assert.strictEqual(result.body.disabled, true);
  assert.strictEqual(values.get(`notificationTokens/${id}`).active, false, 'unregistration deactivates the token');

  verifiedUser = { uid: 'seller-1' };
  values.set('users/seller-1', { role: 'seller' });
  result = await call('register');
  assert.strictEqual(result.statusCode, 403, 'non-admin users cannot manage notification tokens');

  console.log('notification API tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
