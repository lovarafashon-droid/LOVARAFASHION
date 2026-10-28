const { admin } = require('./firestore');

class PartnerOrderError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = 'PartnerOrderError';
    this.statusCode = statusCode;
  }
}

function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value == null ? '' : value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasPartnerItems(orderData) {
  return Array.isArray(orderData?.items) && orderData.items.some(item => typeof item?.storeId === 'string' && item.storeId.trim());
}

function asDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  return new Date(value || 0);
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positivePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function expectedShipping(governorate, subtotal, paymentMethod) {
  const prices = {
    Cairo: 71, Giza: 71, Alexandria: 71,
    Ismailia: 81, Suez: 81, 'Port Said': 81, Dakahlia: 81, Qalyubia: 81,
    Monufia: 81, Sharqia: 81, Gharbia: 81, 'Kafr El Sheikh': 81, Beheira: 81,
    'Beni Suef': 96, Fayoum: 96, Minya: 96, Assiut: 96, Sohag: 96, Qena: 96,
    Luxor: 96, Aswan: 96, 'Red Sea': 96, Matrouh: 106, 'New Valley': 106,
    'North Sinai': 106, 'South Sinai': 106
  };
  if (!governorate || subtotal >= 2500) return 0;
  const base = (prices[governorate] || 106) * 0.5;
  const postalFee = base * 0.10;
  const vat = base * 0.14;
  const codFee = paymentMethod === 'cod'
    ? ((subtotal <= 500 ? 5 : Math.min(subtotal * 0.01, 300)) + 10) * 0.5
    : 0;
  const storeSurcharge = 6 * 0.5;
  const visaDiscount = paymentMethod === 'visa' ? 10 * 0.5 : 0;
  return Math.max(0, base + postalFee + vat + codFee + storeSurcharge - visaDiscount);
}

function quantityOf(item) {
  return Math.floor(Number(item?.quantity ?? item?.qty) || 1);
}

function validateQuantity(item) {
  const quantity = quantityOf(item);
  if (quantity < 1 || quantity > 99) {
    throw new PartnerOrderError('كمية أحد المنتجات غير صالحة.', 422);
  }
  return quantity;
}

async function canonicalizeCheckoutOrder(orderData, db = admin().firestore()) {
  if (!orderData || !Array.isArray(orderData.items) || orderData.items.length === 0 || orderData.items.length > 60) {
    throw new PartnerOrderError('سلة الطلب غير صالحة. أعد تحميل السلة وحاول مرة أخرى.', 422);
  }
  const customer = orderData.customer || {};
  if (String(customer.firstName || '').trim().length < 1
    || String(customer.phone || '').trim().length < 8
    || String(customer.address || '').trim().length < 3
    || String(customer.city || '').trim().length < 2
    || String(customer.governorate || '').trim().length < 2) {
    throw new PartnerOrderError('أكمل بيانات الاسم ورقم الهاتف وعنوان التوصيل.', 422);
  }

  const paymentMethod = String(orderData.payment?.method || '').toLowerCase();
  if (!['cod', 'visa'].includes(paymentMethod)) {
    throw new PartnerOrderError('طريقة الدفع غير مدعومة.', 422);
  }

  const shopCache = new Map();
  const normalizedItems = [];

  for (const item of orderData.items) {
    const quantity = validateQuantity(item);
    const storeId = String(item?.storeId || '').trim();
    const submittedPrice = Number(item?.price);
    if (!Number.isFinite(submittedPrice) || submittedPrice < 0) {
      throw new PartnerOrderError('سعر أحد المنتجات غير صالح.', 422);
    }

    if (storeId) {
      if (storeId.includes('/') || storeId.length > 150) {
        throw new PartnerOrderError('رابط أحد المتاجر غير صالح. أعد تحميل الصفحة وحاول مرة أخرى.', 422);
      }
      let shop = shopCache.get(storeId);
      if (!shop) {
        const shopSnap = await db.collection('shops').doc(storeId).get();
        if (!shopSnap.exists) throw new PartnerOrderError('أحد المتاجر لم يعد متاحًا.', 409);
        shop = { id: shopSnap.id, ...shopSnap.data() };
        const expiresAt = asDate(shop.expiresAt);
        if (shop.active !== true || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
          throw new PartnerOrderError(`متجر ${shop.storeName || ''} متوقف أو انتهى اشتراكه. أزل منتجاته من السلة وحاول مرة أخرى.`, 409);
        }
        shopCache.set(storeId, shop);
      }

      const productId = String(item?.productId || item?.id || '').trim();
      if (!productId || productId.includes('/') || productId.length > 150) {
        throw new PartnerOrderError('تعذر التحقق من أحد منتجات المتجر.', 422);
      }
      const productSnap = await db.collection('shops').doc(storeId).collection('products').doc(productId).get();
      if (!productSnap.exists) throw new PartnerOrderError(`أحد منتجات متجر ${shop.storeName || ''} لم يعد متاحًا.`, 409);
      const product = productSnap.data();
      const originalPrice = positivePrice(product.price);
      const salePrice = positivePrice(product.salePrice);
      const saleEndsAt = timestampMillis(product.saleEndsAt);
      const currentPrice = salePrice > 0 && salePrice < originalPrice && saleEndsAt > Date.now() ? salePrice : originalPrice;
      if (Math.abs(currentPrice - submittedPrice) > 0.01) {
        throw new PartnerOrderError(`تغير سعر ${product.name || 'أحد المنتجات'}. حدّث السلة قبل تأكيد الطلب.`, 409);
      }
      normalizedItems.push({
        productId,
        storeId,
        storeName: String(shop.storeName || 'متجر شريك'),
        name: String(product.name || 'منتج'),
        category: String(product.category || ''),
        description: String(product.description || ''),
        subcategory: '',
        productType: '',
        price: currentPrice,
        quantity,
        qty: quantity,
        size: '-',
        color: '-',
        imageUrl: String(product.imageUrl || ''),
        images: product.imageUrl ? [String(product.imageUrl)] : [],
        cost: 0,
        pricingUnit: 'piece',
        quantityDiscountEnabled: false
      });
      continue;
    }

    const productId = String(item?.productId || item?.id || '').trim();
    if (!productId || productId.includes('/') || productId.length > 150) {
      throw new PartnerOrderError('تعذر التحقق من أحد منتجات LOVARA.', 422);
    }
    const productSnap = await db.collection('products').doc(productId).get();
    if (!productSnap.exists) throw new PartnerOrderError('أحد منتجات LOVARA لم يعد متاحًا. أزل المنتج من السلة وحاول مرة أخرى.', 409);
    const product = productSnap.data();
    const pricingUnit = item.pricingUnit === 'dozen' ? 'dozen' : 'piece';
    const subcategory = String(product.subcategory || product.subCategory || '').trim().toLowerCase();
    if (pricingUnit === 'dozen' && (!['bras', 'panties'].includes(subcategory) || positivePrice(product.priceDozen) <= 0)) {
      throw new PartnerOrderError('طريقة شراء الدستة غير متاحة لهذا المنتج.', 422);
    }
    const piecePrice = positivePrice(product.pricePiece ?? product.price);
    const dozenPrice = positivePrice(product.priceDozen || product.price);
    let basePrice = pricingUnit === 'dozen' ? dozenPrice : piecePrice;
    if (pricingUnit === 'piece') {
      const salePrice = positivePrice(product.salePrice);
      const saleEndsAt = timestampMillis(product.saleEndsAt);
      if (salePrice > 0 && saleEndsAt > Date.now()) basePrice = salePrice;
    }
    const discountEnabled = pricingUnit !== 'dozen' && item.quantityDiscountEnabled === true;
    let quantityDiscount = 0;
    if (discountEnabled && basePrice > 100) {
      quantityDiscount = quantity >= 3 ? 20 : quantity === 2 ? 10 : 0;
    }
    const canonicalPrice = Math.max(0, basePrice - quantityDiscount);
    if (Math.abs(canonicalPrice - submittedPrice) > 0.01) {
      throw new PartnerOrderError(`تغير سعر ${product.name || 'أحد المنتجات'}. حدّث السلة قبل تأكيد الطلب.`, 409);
    }
    const images = Array.isArray(product.images) ? product.images.filter(value => typeof value === 'string') : [];
    const imageUrl = String(product.imageUrl || product.image || images[0] || '');
    normalizedItems.push({
      productId,
      name: String(product.name || 'Product'),
      category: String(product.category || ''),
      subcategory: String(product.subcategory || product.subCategory || ''),
      productType: String(product.productType || product.type || ''),
      price: canonicalPrice,
      basePrice,
      quantity,
      qty: quantity,
      size: item.size ?? '-',
      color: item.color ?? '-',
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      colors: Array.isArray(product.colors) ? product.colors : [],
      imageUrl,
      images: images.length ? images : (imageUrl ? [imageUrl] : []),
      cost: positivePrice(product.cost),
      pricingUnit,
      unitLabel: pricingUnit === 'dozen' ? 'Dozen / دستة' : 'Piece / قطعة',
      quantityDiscountEnabled: discountEnabled
    });
  }

  const totals = orderData.totals || {};
  const calculatedSubtotal = normalizedItems.reduce((sum, item) => sum + amount(item.price) * item.quantity, 0);
  const submittedSubtotal = amount(totals.subtotal);
  const submittedShipping = amount(totals.shipping);
  const submittedDiscount = amount(totals.discount);
  const submittedTotal = amount(totals.total);
  const shippingExpected = expectedShipping(customer.governorate, calculatedSubtotal, paymentMethod);
  if (Math.abs(calculatedSubtotal - submittedSubtotal) > 0.05 || Math.abs(shippingExpected - submittedShipping) > 0.05) {
    throw new PartnerOrderError('إجمالي السلة تغير. أعد مراجعة الأسعار ورسوم الشحن قبل تأكيد الطلب.', 409);
  }

  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  const promoCode = String(orderData.promoCode || '').trim().toUpperCase();
  let promo = null;
  if (promoCode) {
    const promoSnapshot = await db.collection('promoCodes').where('code', '==', promoCode).where('active', '==', true).limit(1).get();
    if (promoSnapshot.empty) throw new PartnerOrderError('كود الخصم لم يعد صالحًا. أعد تطبيقه قبل تأكيد الطلب.', 409);
    const promoDoc = promoSnapshot.docs[0];
    if (orderData.promoId && orderData.promoId !== promoDoc.id) {
      throw new PartnerOrderError('بيانات كود الخصم غير متطابقة. أعد تطبيقه قبل تأكيد الطلب.', 409);
    }
    promo = { id: promoDoc.id, ...promoDoc.data() };
  }
  const nominalDiscount = promo ? (Number(promo.discount) || 0) * totalQuantity : 0;
  const expectedDiscount = Math.min(nominalDiscount, calculatedSubtotal + shippingExpected);
  const expectedTotal = Math.max(0, calculatedSubtotal + shippingExpected - expectedDiscount);
  if (Math.abs(expectedDiscount - submittedDiscount) > 0.05 || Math.abs(expectedTotal - submittedTotal) > 0.05) {
    throw new PartnerOrderError('تغير الخصم أو إجمالي الطلب. راجع السلة ثم أعد المحاولة.', 409);
  }

  const commissionPercentValue = promo?.commissionPercent ?? promo?.employeeProfitPercent;
  const commissionPercent = commissionPercentValue !== undefined && commissionPercentValue !== null && commissionPercentValue !== ''
    ? Math.max(0, Number(commissionPercentValue) || 0)
    : Math.max(0, Number(promo?.commission ?? 10) || 10);
  const employeeCommission = promo ? calculatedSubtotal * commissionPercent / 100 : 0;
  const productProfit = normalizedItems.reduce((sum, item) => {
    if (item.storeId) return sum;
    return sum + (amount(item.price) - amount(item.cost)) * item.quantity;
  }, 0);
  const lovaraSubtotal = normalizedItems.reduce((sum, item) => sum + (!item.storeId ? amount(item.price) * item.quantity : 0), 0);
  const lovaraDiscount = calculatedSubtotal > 0 ? expectedDiscount * lovaraSubtotal / calculatedSubtotal : 0;
  const profit = productProfit - lovaraDiscount;

  return {
    ...orderData,
    items: normalizedItems,
    totals: {
      ...totals,
      subtotal: `EGP ${calculatedSubtotal.toFixed(2)}`,
      shipping: `EGP ${shippingExpected.toFixed(2)}`,
      discount: `EGP ${expectedDiscount.toFixed(2)}`,
      total: `EGP ${expectedTotal.toFixed(2)}`
    },
    promoCode,
    promoId: promo?.id || '',
    employeeId: String(promo?.employeeId || ''),
    employeeDiscount: nominalDiscount,
    employeeCommission,
    profit,
    payment: { ...(orderData.payment || {}), method: paymentMethod }
  };
}

function buildPartnerOrderRecords(orderData, parentOrderId, db = admin().firestore()) {
  const groups = new Map();
  (Array.isArray(orderData?.items) ? orderData.items : []).forEach(item => {
    const storeId = String(item?.storeId || '').trim();
    if (!storeId) return;
    if (!groups.has(storeId)) groups.set(storeId, []);
    groups.get(storeId).push(item);
  });

  if (!groups.size) return [];
  const allSubtotal = (Array.isArray(orderData.items) ? orderData.items : []).reduce((sum, item) => {
    return sum + amount(item.price) * Math.max(1, Math.floor(Number(item.quantity ?? item.qty) || 1));
  }, 0);
  const shipping = amount(orderData.totals?.shipping);
  const discount = amount(orderData.totals?.discount);
  const orderNumber = String(orderData.orderNumber || parentOrderId || '').trim();
  const timestamp = admin().firestore.FieldValue.serverTimestamp();
  const customer = orderData.customer || {};
  const merchantCustomer = Object.fromEntries(['firstName', 'lastName', 'phone', 'phone2', 'address', 'city', 'governorate', 'notes']
    .filter(key => customer[key] !== undefined && customer[key] !== null && customer[key] !== '')
    .map(key => [key, String(customer[key])]));
  const merchantPayment = {
    method: String(orderData.payment?.method || ''),
    methodName: String(orderData.payment?.methodName || ''),
    status: String(orderData.payment?.status || '')
  };

  return Array.from(groups.entries()).map(([storeId, items]) => {
    const storeSubtotal = items.reduce((sum, item) => sum + amount(item.price) * Math.max(1, Math.floor(Number(item.quantity ?? item.qty) || 1)), 0);
    const share = allSubtotal > 0 ? storeSubtotal / allSubtotal : 1 / groups.size;
    const allocatedShipping = shipping * share;
    const allocatedDiscount = discount * share;
    const merchantItems = items.map(item => ({
      productId: String(item.productId || item.id || ''),
      name: String(item.name || 'منتج'),
      category: String(item.category || ''),
      subcategory: String(item.subcategory || ''),
      productType: String(item.productType || ''),
      price: amount(item.price),
      quantity: Math.max(1, Math.floor(Number(item.quantity ?? item.qty) || 1)),
      size: item.size ?? '-',
      color: item.color ?? '-',
      imageUrl: String(item.imageUrl || item.image || ''),
      storeId,
      storeName: String(item.storeName || 'متجر شريك')
    }));
    const storeName = String(items[0]?.storeName || 'متجر شريك');
    const data = {
      orderNumber,
      parentOrderId: String(parentOrderId || ''),
      parentOrderNumber: orderNumber,
      storeId,
      storeName,
      customer: merchantCustomer,
      items: merchantItems,
      totals: {
        subtotal: `EGP ${storeSubtotal.toFixed(2)}`,
        shipping: `EGP ${allocatedShipping.toFixed(2)}`,
        discount: `EGP ${allocatedDiscount.toFixed(2)}`,
        total: `EGP ${Math.max(0, storeSubtotal + allocatedShipping - allocatedDiscount).toFixed(2)}`
      },
      payment: merchantPayment,
      sellerStatus: 'new',
      date: orderData.date || new Date().toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return { storeId, orderNumber, data, ref: db.collection('shops').doc(storeId).collection('orders').doc(orderNumber) };
  });
}

module.exports = {
  PartnerOrderError,
  amount,
  expectedShipping,
  hasPartnerItems,
  canonicalizeCheckoutOrder,
  buildPartnerOrderRecords
};
