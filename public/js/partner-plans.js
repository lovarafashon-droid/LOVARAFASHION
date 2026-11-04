(function (root) {
  'use strict';
  root.LovaraPartnerPlans = Object.freeze({
    free_trial: Object.freeze({ id: 'free_trial', name: 'مجانية', amount: 0, durationDays: 7, durationMonths: 0, productLimit: 20, storeBranding: false, advancedStorefront: false, discounts: false, prioritySupport24h: false, perks: ['20 منتجًا خلال التجربة'] }),
    plus: Object.freeze({ id: 'plus', name: 'Plus', amount: 105, durationDays: 0, durationMonths: 1, productLimit: 20, storeBranding: false, advancedStorefront: false, discounts: false, prioritySupport24h: false, perks: ['حتى 20 منتجًا', 'صفحة متجر مستقلة', 'إدارة الطلبات'] }),
    super_plus: Object.freeze({ id: 'super_plus', name: 'Super Plus', amount: 225, durationDays: 0, durationMonths: 3, productLimit: 75, storeBranding: true, advancedStorefront: false, discounts: false, prioritySupport24h: false, perks: ['حتى 75 منتجًا', 'اختيار لون المتجر', 'تخصيص رسالة ترحيب المتجر'] }),
    premium: Object.freeze({ id: 'premium', name: 'Premium', amount: 555, durationDays: 0, durationMonths: 6, productLimit: 150, storeBranding: true, advancedStorefront: true, discounts: true, prioritySupport24h: true, perks: ['حتى 150 منتجًا', 'تحكم أوسع في واجهة المتجر', 'خصومات بموعد انتهاء وعدّاد تنازلي', 'دعم فني على مدار 24 ساعة'] })
  });
})(typeof window !== 'undefined' ? window : globalThis);
