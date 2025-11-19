// Usage: node scripts/ensureSuperAdmin.js info@clevelandcleansolutions.com
// Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON.
// This script is idempotent and safe to re-run.
import { admin, initializeAdminApp } from "./firebaseAdmin.js";

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Email required. Example: node scripts/ensureSuperAdmin.js info@clevelandcleansolutions.com");
    process.exit(1);
  }
  try {
    initializeAdminApp();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const auth = admin.auth();
  const db = admin.firestore();

  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role: "super_admin" });
  await db.doc(`users/${user.uid}`).set({ role: "super_admin" }, { merge: true });
  console.log(`Ensured super_admin for ${email} (uid=${user.uid}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


