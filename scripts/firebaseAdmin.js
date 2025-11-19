/* eslint-disable no-console */
import * as admin from "firebase-admin";

export function initializeAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountJson = process.env.FIREBASE_ADMIN_CREDENTIALS;

  if (serviceAccountJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown JSON parsing error";
      throw new Error(`Failed to parse FIREBASE_ADMIN_CREDENTIALS: ${message}`);
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return admin.app();
  }

  if (process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    return admin.app();
  }

  throw new Error(
    "FIREBASE_ADMIN_CREDENTIALS environment variable is missing! Check Vercel settings."
  );
}

export { admin };

