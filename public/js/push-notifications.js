/* LOVARA admin push notification registration. */
(function () {
  const VAPID_KEY = 'BA04TkI55Td1squsjzf650tFCildoMmAGVENoEZezzD1_xCM49EcqDqBfnfHqyMQzqjQFu1FbR65Pq479O8DBd8';

  function tokenId(token) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `device_${(hash >>> 0).toString(36)}`;
  }

  async function enable(db, uid) {
    if (!uid) throw new Error('يجب تسجيل الدخول كأدمن أولًا.');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('هذا المتصفح لا يدعم إشعارات الموقع.');
    }
    if (!window.isSecureContext) {
      throw new Error('الإشعارات تحتاج فتح الموقع من HTTPS.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('لم يتم السماح بالإشعارات على هذا الجهاز.');
    if (typeof firebase === 'undefined' || !firebase.messaging) throw new Error('خدمة الإشعارات غير جاهزة.');

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = firebase.messaging();
    if (!messaging.__lovaraForegroundListener) {
      messaging.onMessage((payload) => {
        const notification = payload.notification || {};
        const data = payload.data || {};
        const title = notification.title || data.title || 'طلب جديد - LOVARA';
        const body = notification.body || data.body || 'وصل طلب جديد إلى المتجر.';
        if (Notification.permission === 'granted') {
          const popup = new Notification(title, { body, icon: '/LOVARA.jpeg', tag: data.orderNumber || 'lovara-new-order' });
          popup.onclick = () => { window.focus(); window.location.href = data.url || '/admin.html'; };
        }
      });
      messaging.__lovaraForegroundListener = true;
    }
    const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error('تعذر تسجيل هذا الجهاز للإشعارات.');

    const currentUser = firebase.auth && firebase.auth().currentUser;
    if (!currentUser) throw new Error('انتهت جلسة الأدمن. سجّل الدخول مرة أخرى.');
    const idToken = await currentUser.getIdToken(true);
    const response = await fetch('/api/notifications/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, uid, userAgent: navigator.userAgent })
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || 'تعذر تسجيل هذا الجهاز. تأكد من صلاحية حساب الأدمن.');
    }
    localStorage.setItem('lovara_push_enabled', '1');
    return token;
  }

  async function disable(db, uid) {
    if (!db || !uid) return;
    const messaging = typeof firebase !== 'undefined' && firebase.messaging ? firebase.messaging() : null;
    let token = null;
    try { if (messaging) token = await messaging.getToken({ vapidKey: VAPID_KEY }); } catch (_) {}
    if (token) await db.collection('notificationTokens').doc(tokenId(token)).set({ active: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    localStorage.removeItem('lovara_push_enabled');
  }

  window.LovaraPushNotifications = { enable, disable };
})();
