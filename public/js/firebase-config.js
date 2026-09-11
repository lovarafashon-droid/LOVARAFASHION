// Firebase Configuration - Shared across all pages
const firebaseConfig = {
  apiKey: "AIzaSyBPp-NP-EiFglFIl0cTABG4vIElgoOPXFY",
  authDomain: "lovara-89510.firebaseapp.com",
  projectId: "lovara-89510",
  storageBucket: "lovara-89510.firebasestorage.app",
  messagingSenderId: "904172951814",
  appId: "1:904172951814:web:e572ad13ff3b3e4adfa687",
  measurementId: "G-8R4YLNQ9V7"
};

// Initialize Firebase when the SDK is available. A blocked or slow CDN must
// not crash the entire homepage before its fallback can run.
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Export references for global use; keep them nullable if the SDK is missing.
const db = typeof firebase !== 'undefined' && typeof firebase.firestore === 'function'
  ? firebase.firestore() : null;
const auth = typeof firebase !== 'undefined' && typeof firebase.auth === 'function'
  ? firebase.auth() : null;

// Storage is optional - only initialize if SDK is loaded
let storage = null;
try {
  if (typeof firebase.storage === 'function') {
    storage = firebase.storage();
  }
} catch (e) {
  console.warn('Firebase Storage SDK not loaded:', e.message);
}
