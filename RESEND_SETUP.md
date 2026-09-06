# إعداد إشعارات البريد لطلبات الاسترجاع

صفحة `public/orders.html` ترسل طلب POST إلى العنوان الموجود في:

```js
window.LOVARA_RETURN_EMAIL_ENDPOINT
```

يجب أن يكون هذا العنوان Endpoint على خادم آمن، وليس استدعاء Resend مباشرة من المتصفح. يجب حفظ `RESEND_API_KEY` في متغيرات البيئة على الخادم وعدم وضعه داخل ملفات `public`.

الـ Endpoint يستقبل JSON بالشكل التالي:

```json
{
  "email": "customer@example.com",
  "customerName": "Customer Name",
  "orderNumber": "ORD-123",
  "status": "approved",
  "productName": "Product name"
}
```

قيمة `status` تكون `approved` عند القبول أو `rejected` عند الرفض. يجب أن يرسل الخادم رسالة إلى `email` باستخدام Resend، ثم يعيد HTTP 2xx عند نجاح الإرسال.

بعد نشر الـ Endpoint، أضف هذا السطر قبل سكريبت لوحة الطلبات:

```html
<script>window.LOVARA_RETURN_EMAIL_ENDPOINT = 'https://your-domain.example/api/return-email';</script>
```

لا تستخدم مفتاح Resend داخل HTML أو JavaScript الموجود في المتصفح. بدون هذا الـ Endpoint، ستظل حالة الطلب تتغير في Firestore، لكن لن تُرسل رسالة بريد تلقائية.

> تأكد أيضًا من أن قواعد Firebase تسمح للوحة الإدارة بقراءة وتحديث مجموعة `returns`، وأن قواعد Storage تسمح برفع صور طلبات الاسترجاع.
