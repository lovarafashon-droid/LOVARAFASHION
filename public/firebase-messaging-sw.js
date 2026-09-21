/* LOVARA background push notifications. Keep this file at the domain root. */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBPp-NP-EiFglFIl0cTABG4vIElgoOPXFY',
  authDomain: 'lovara-89510.firebaseapp.com',
  projectId: 'lovara-89510',
  storageBucket: 'lovara-89510.firebasestorage.app',
  messagingSenderId: '904172951814',
  appId: '1:904172951814:web:e572ad13ff3b3e4adfa687'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'طلب جديد - LOVARA';
  const body = notification.body || data.body || 'وصل طلب جديد إلى المتجر.';
  self.registration.showNotification(title, {
    body,
    icon: '/LOVARA.jpeg',
    badge: '/LOVARA.jpeg',
    data: { url: data.url || '/orders.html' },
    tag: data.orderNumber || 'lovara-new-order',
    renotify: true
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/orders.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if ('focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  }));
});
