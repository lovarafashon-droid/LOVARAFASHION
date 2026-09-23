const fs = require('fs');
const vm = require('vm');
const context = { window: {}, console };
vm.runInNewContext(fs.readFileSync('public/js/pricing.js', 'utf8'), context);
const pricing = context.window.LovaraPricing;
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
let result = pricing.getCartPricing([{ price: 200, quantity: 1 }]);
assertEqual(result.totalQuantity, 1, 'one item quantity');
assertEqual(result.lines[0].unitPrice, 200, 'one item price');
result = pricing.getCartPricing([{ price: 200, quantity: 1 }, { price: 99, quantity: 1 }]);
assertEqual(result.totalQuantity, 2, 'two item quantity');
assertEqual(result.lines[0].unitPrice, 190, 'eligible item at two items');
assertEqual(result.lines[1].unitPrice, 99, 'under-100 item at two items');
assertEqual(result.subtotal, 289, 'two item subtotal');
result = pricing.getCartPricing([{ price: 200, quantity: 1 }, { price: 150, quantity: 1 }, { price: 100, quantity: 1 }]);
assertEqual(result.totalQuantity, 3, 'three item quantity');
assertEqual(result.lines[0].unitPrice, 180, 'eligible item at three items');
assertEqual(result.lines[1].unitPrice, 130, 'second eligible item at three items');
assertEqual(result.lines[2].unitPrice, 100, 'exactly-100 item is not eligible');
assertEqual(result.subtotal, 410, 'three item subtotal');
result = pricing.getCartPricing([{ price: 250, quantity: 2 }]);
assertEqual(result.lines[0].unitPrice, 240, 'quantity on one line gets two-item discount');
result = pricing.getCartPricing([{ price: 300, quantity: 1, pricingUnit: 'dozen' }, { price: 200, quantity: 1 }]);
assertEqual(result.lines[0].unitPrice, 300, 'dozen line is not discounted');
assertEqual(result.lines[1].unitPrice, 190, 'piece line is discounted');
console.log('quantity discount tests passed');
