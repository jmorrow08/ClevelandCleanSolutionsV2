"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantSuperAdminByEmail = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
exports.grantSuperAdminByEmail = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const token = (context.auth.token || {});
    const isSuper = token["role"] === "super_admin" || token["super_admin"] === true;
    if (!isSuper) {
        throw new functions.https.HttpsError("permission-denied", "Only super_admin may grant super_admin");
    }
    const email = String((data === null || data === void 0 ? void 0 : data.email) || "").trim().toLowerCase();
    if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "email is required");
    }
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: "super_admin" });
    await admin.firestore().doc(`users/${user.uid}`).set({
        role: "super_admin",
    }, { merge: true });
    return { ok: true, uid: user.uid, role: "super_admin" };
});
//# sourceMappingURL=bootstrap.js.map