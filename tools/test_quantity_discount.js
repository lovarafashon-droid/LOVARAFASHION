const fs = require('fs');
const vm = require('vm');
const context = { window: {}, console };
vm.runInNewContext(fs.readFileSync('public/js/pricing.js', 'utf8'), context);
const pricing = context.window.LovaraPricing;
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
let result = pricing.getCartPricing([{ price: 200, quantity: 2 }]);
assertEqual(result.lines[0].unitPrice, 200, 'cart quantity alone does not activate discount');
result = pricing.getCartPricing([{ price: 200, quantity: 2, quantityDiscountEnabled: true }]);
assertEqual(result.lines[0].unitPrice, 190, 'two pieces selected in preview');
result = pricing.getCartPricing([
  { price: 200, quantity: 2, quantityDiscountEnabled: true },
  { price: 150, quantity: 1 }
]);
assertEqual(result.lines[0].unitPrice, 190, 'discount stays on preview-selected product');
assertEqual(result.lines[1].unitPrice, 150, 'different product is not discounted');
result = pricing.getCartPricing([{ price: 200, quantity: 3, quantityDiscountEnabled: true }, { price: 99, quantity: 1, quantityDiscountEnabled: true }]);
assertEqual(result.lines[0].unitPrice, 180, 'three pieces selected in preview');
assertEqual(result.lines[1].unitPrice, 99, 'under-100 item is not eligible');
result = pricing.getCartPricing([{ price: 100, quantity: 3, quantityDiscountEnabled: true }]);
assertEqual(result.lines[0].unitPrice, 100, 'exactly-100 item is not eligible');
result = pricing.getCartPricing([{ price: 300, quantity: 1, pricingUnit: 'dozen', quantityDiscountEnabled: true }]);
assertEqual(result.lines[0].unitPrice, 300, 'dozen line is not discounted');
console.log('quantity discount tests passed');
