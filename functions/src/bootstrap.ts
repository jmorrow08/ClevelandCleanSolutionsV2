import * as functions from "firebase-functions";
import { admin } from "./firebaseAdmin";

export const grantSuperAdminByEmail = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required"
      );
    }
    const token = (context.auth.token || {}) as Record<string, unknown>;
    const isSuper =
      token["role"] === "super_admin" || token["super_admin"] === true;
    if (!isSuper) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only super_admin may grant super_admin"
      );
    }
    const email = String(data?.email || "").trim().toLowerCase();
    if (!email) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "email is required"
      );
    }
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: "super_admin" });
    await admin.firestore().doc(`users/${user.uid}`).set(
      {
        role: "super_admin",
      },
      { merge: true }
    );
    return { ok: true, uid: user.uid, role: "super_admin" };
  });


