import * as admin from "firebase-admin";

function initializeAdminApp(): void {
  if (admin.apps.length > 0) {
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_ADMIN_CREDENTIALS;

  if (serviceAccountJson) {
    let serviceAccount: admin.ServiceAccount | Record<string, unknown>;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (error) {
      throw new Error(
        `Failed to parse FIREBASE_ADMIN_CREDENTIALS: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    return;
  }

  if (process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    return;
  }

  throw new Error(
    "FIREBASE_ADMIN_CREDENTIALS environment variable is missing! Check Vercel settings."
  );
}

export function ensureAdminApp(): admin.app.App {
  initializeAdminApp();
  return admin.app();
}

ensureAdminApp();

export { admin };

