// Firebase init shared with V1 project (no migrations). Paste your existing config into .env.
// Expected env vars:
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_MEASUREMENT_ID

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// README:
// Create a .env.local in project root with:
// VITE_FIREBASE_API_KEY="<from V1>"
// VITE_FIREBASE_AUTH_DOMAIN="cleveland-clean-portal.firebaseapp.com"
// VITE_FIREBASE_PROJECT_ID="cleveland-clean-portal"
// VITE_FIREBASE_STORAGE_BUCKET="cleveland-clean-portal.firebasestorage.app"
// VITE_FIREBASE_MESSAGING_SENDER_ID="938625547862"
// VITE_FIREBASE_APP_ID="1:938625547862:web:3655b2b380b858702705f7"
// VITE_FIREBASE_MEASUREMENT_ID="G-7KZMMKZ1XW"

