const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const sellerPath = '/lvr-6c4e91b7a2d8f305c6b18a2f';
const partnerAdminPath = '/lvr-2a7f91d4c6b8e3051f9a6c3d';
const mainAdminPath = '/lvr-8f3c1a7d9b2e6c40a5f18d7';
const config = JSON.parse(read('vercel.json'));
const rewrites = config.rewrites || [];

assert.equal(config.cleanUrls, true);
assert.equal(exists('public/seller.html'), false, 'old /seller static page is gone');
assert.equal(exists('public/admin-stores.html'), false, 'old /admin-stores static page is gone');
assert.equal(exists(`public/${sellerPath.slice(1)}.html`), true);
assert.equal(exists(`public/${partnerAdminPath.slice(1)}.html`), true);
assert.equal(rewrites.some(rule => rule.source === '/admin/stores' || rule.source === '/seller'), false, 'old readable partner routes are no longer rewritten');
assert.ok(rewrites.some(rule => rule.source === '/store/:slug' && rule.destination === '/store?slug=:slug'), 'public shop URLs remain unchanged');

for (const route of [sellerPath, partnerAdminPath]) {
  const rule = (config.headers || []).find(entry => entry.source === route);
  assert.ok(rule, `private response headers exist for ${route}`);
  const headers = Object.fromEntries(rule.headers.map(header => [header.key.toLowerCase(), header.value.toLowerCase()]));
  assert.match(headers['x-robots-tag'] || '', /noindex/);
  assert.match(headers['cache-control'] || '', /no-store/);
  const page = read(`public/${route.slice(1)}.html`);
  assert.match(page, /name="robots" content="noindex/i);
}

const index = read('public/index.html');
assert.match(index, new RegExp(`window\\.location\\.href = '${sellerPath}'`));
assert.doesNotMatch(index, /window\.location\.href = '\/seller'/);
const store = read('public/store.html');
assert.match(store, new RegExp(`href="${sellerPath}"`));
const profile = read('public/profile.html');
assert.match(profile, new RegExp(`href="${sellerPath}"`));
const mainAdmin = read(`public/${mainAdminPath.slice(1)}.html`);
assert.match(mainAdmin, new RegExp(`href="${partnerAdminPath}"`));
assert.ok(exists('public/admin-stores.html') === false);
assert.ok(exists('public/seller.html') === false);

console.log('partner admin route tests passed; old paths absent and storefront URLs unchanged');
