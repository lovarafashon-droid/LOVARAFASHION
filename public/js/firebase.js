// استيراد Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// الكونفيج بتاعك (من Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyBPp-NP-EiFglFIl0cTABG4vIElgoOPXFY",
  authDomain: "lovara-89510.firebaseapp.com",
  projectId: "lovara-89510",
  storageBucket: "lovara-89510.firebasestorage.app",
  messagingSenderId: "904172951814",
  appId: "1:904172951814:web:e572ad13ff3b3e4adfa687",
  measurementId: "G-8R4YLNQ9V7"
};

// تشغيل Firebase
const app = initializeApp(firebaseConfig);

// 👇 أهم سطرين
export const auth = getAuth(app);
export const db = getFirestore(app);