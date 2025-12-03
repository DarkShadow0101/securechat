// client/src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB5O9KkWg1-WalzACLxsm1WWVQLbgOCSoo",
  authDomain: "login-page-3264b.firebaseapp.com",
  projectId: "login-page-3264b",
  storageBucket: "login-page-3264b.firebasestorage.app",
  messagingSenderId: "749413747391",
  appId: "1:749413747391:web:20c25166d0f391ff1fd40a",
  measurementId: "G-XL70TZJVQV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Default export
export default app;
