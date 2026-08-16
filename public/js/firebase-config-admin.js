// ============================================
// LOVARA - Admin Firebase Config (Named App)
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyBPp-NP-EiFglFIl0cTABG4vIElgoOPXFY",
  authDomain: "lovara-89510.firebaseapp.com",
  projectId: "lovara-89510",
  storageBucket: "lovara-89510.firebasestorage.app",
  messagingSenderId: "904172951814",
  appId: "1:904172951814:web:e572ad13ff3b3e4adfa687",
  measurementId: "G-8R4YLNQ9V7"
};

let adminApp;
try {
  adminApp = firebase.app('admin');
  console.log('✅ Admin Firebase already initialized, reusing...');
} catch (e) {
  adminApp = firebase.initializeApp(firebaseConfig, 'admin');
  console.log('✅ Admin Firebase initialized');
}

const adminDb = adminApp.firestore();
const adminStorage = adminApp.storage();
const adminAuth = adminApp.auth();

window.adminDb = adminDb;
window.adminStorage = adminStorage;
window.adminAuth = adminAuth;

console.log('✅ Admin Firebase ready');
console.log('📦 Storage bucket:', firebaseConfig.storageBucket);