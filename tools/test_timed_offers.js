const fs = require('fs');
const vm = require('vm');
const context = { window: {}, Date, document: { documentElement: { lang: 'ar' } }, setInterval, clearInterval, setTimeout, console };
vm.runInNewContext(fs.readFileSync('public/categories-shared.js', 'utf8').split('const CategoryApp =')[0], context);
const offers = context.window.LovaraOffers;
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
const now = 1_700_000_000_000;
let state = offers.getState({ price: 310, salePrice: 250, saleEndsAt: now + 5 * 86400000 }, now);
assertEqual(state.active, true, 'offer is active before its end');
assertEqual(state.price, 250, 'active offer price is used');
state = offers.getState({ price: 310, salePrice: 250, saleEndsAt: now }, now);
assertEqual(state.active, false, 'offer is inactive at its end');
assertEqual(state.price, 310, 'original price returns after expiry');
state = offers.getState({ price: 310, salePrice: 0, saleEndsAt: now + 86400000 }, now);
assertEqual(state.price, 310, 'missing sale price keeps original price');
console.log('timed offer tests passed');
