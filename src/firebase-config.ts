// src/firebase-config.ts

import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
// --- ADDED: This line is required to use Firestore ---
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyAJEuOcNLg8dYtzhMEyhMZtidfIXNALcgU',
  authDomain: 'cleveland-clean-portal.firebaseapp.com',
  projectId: 'cleveland-clean-portal',
  storageBucket: 'cleveland-clean-portal.appspot.com', // Corrected this line, ".firebasestorage.app" is for a different API
  messagingSenderId: '938625547862',
  appId: '1:938625547862:web:3655b2b380b858702705f7',
  measurementId: 'G-7KZMMKZ1XW',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Your existing analytics setup is preserved
const analytics = getAnalytics(app);

// --- ADDED: This creates the database instance and exports it so other files can import it ---
export const db = getFirestore(app);
