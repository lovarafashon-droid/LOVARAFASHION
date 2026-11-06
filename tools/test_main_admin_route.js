const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const privatePath = '/lvr-8f3c1a7d9b2e6c40a5f18d7';
const config = JSON.parse(read('vercel.json'));
const rewrites = config.rewrites || [];
const redirects = config.redirects || [];

assert.equal(config.cleanUrls, true);
assert.equal(exists('public/admin.html'), false, 'old main-store admin file is gone, so /admin.html resolves to not found');
assert.equal(exists(`public/${privatePath.slice(1)}.html`), true, 'new private main-store admin page exists');
assert.equal(rewrites.some(rule => rule.source === '/admin' || rule.source === '/admin.html'), false);
assert.equal(redirects.some(rule => rule.source === '/admin' || rule.source === '/admin.html'), false);

const routeHeaders = (config.headers || []).find(rule => rule.source === privatePath);
assert.ok(routeHeaders, 'private route has response headers');
const headers = Object.fromEntries(routeHeaders.headers.map(header => [header.key.toLowerCase(), header.value.toLowerCase()]));
assert.match(headers['x-robots-tag'] || '', /noindex/);
assert.match(headers['cache-control'] || '', /no-store/);

const page = read(`public/${privatePath.slice(1)}.html`);
assert.match(page, /name="robots" content="noindex, nofollow, noarchive, nosnippet"/);
assert.match(page, /href="\/manifest\.webmanifest"/);
assert.match(page, /href="\/categories-shared\.css"/);
assert.match(page, /data\(\)\.role === 'admin'/, 'Firebase admin role check remains in the page');

const home = read('public/index.html');
assert.match(home, new RegExp(`href="${privatePath}"`));
assert.doesNotMatch(home, /href="\/admin(?:\.html)?"/);
const manifest = JSON.parse(read('public/manifest.webmanifest'));
assert.equal(manifest.start_url, privatePath);
const robots = read('public/robots.txt');
assert.doesNotMatch(robots, /^Disallow:\s*\/admin\s*$/m, 'crawlers can discover the old admin path is gone');

console.log('main-store admin route tests passed');
