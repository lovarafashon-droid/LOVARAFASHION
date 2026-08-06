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

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Export references for global use
const db = firebase.firestore();
const auth = firebase.auth();

// Storage is optional - only initialize if SDK is loaded
let storage = null;
try {
  if (typeof firebase.storage === 'function') {
    storage = firebase.storage();
  }
} catch (e) {
  console.warn('Firebase Storage SDK not loaded:', e.message);
}