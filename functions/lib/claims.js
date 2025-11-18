"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserRoleMirror = exports.setUserRoleByEmail = exports.setUserRole = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const VALID_ROLES = new Set([
    "super_admin",
    "owner",
    "admin",
    "employee",
    "client",
]);
function normalizeRole(input) {
    const role = String(input || "").trim();
    if (!VALID_ROLES.has(role)) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid role. Must be one of super_admin|owner|admin|employee|client");
    }
    return role;
}
function callerRole(context) {
    var _a;
    const token = (((_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) || {});
    if (typeof token.role === "string")
        return token.role;
    if (token["super_admin"] === true)
        return "super_admin";
    if (token["owner"] === true)
        return "owner";
    if (token["admin"] === true)
        return "admin";
    if (token["employee"] === true)
        return "employee";
    if (token["client"] === true)
        return "client";
    return null;
}
exports.setUserRole = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const caller = callerRole(context);
    if (!caller) {
        throw new functions.https.HttpsError("permission-denied", "Missing caller role");
    }
    const targetUid = String((data === null || data === void 0 ? void 0 : data.targetUid) || "").trim();
    const role = normalizeRole(data === null || data === void 0 ? void 0 : data.role);
    if (!targetUid) {
        throw new functions.https.HttpsError("invalid-argument", "targetUid is required");
    }
    const isSuper = caller === "super_admin";
    const isOwner = caller === "owner";
    const allowedByOwner = role === "admin" || role === "employee";
    if (!(isSuper || (isOwner && allowedByOwner))) {
        throw new functions.https.HttpsError("permission-denied", "Insufficient privileges to assign this role");
    }
    if (!isSuper && (role === "super_admin" || role === "owner")) {
        throw new functions.https.HttpsError("permission-denied", "Only super_admin can assign super_admin/owner");
    }
    await admin.auth().setCustomUserClaims(targetUid, { role });
    await db.doc(`users/${targetUid}`).set({ role }, { merge: true });
    // Tell the client to refresh ID token
    return { ok: true, role };
});
// Convenience for super_admin: assign role by email (avoids needing uid lookup client-side)
exports.setUserRoleByEmail = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const caller = callerRole(context);
    if (caller !== "super_admin") {
        throw new functions.https.HttpsError("permission-denied", "Only super_admin can assign roles by email");
    }
    const email = String((data === null || data === void 0 ? void 0 : data.email) || "").trim().toLowerCase();
    const role = normalizeRole(data === null || data === void 0 ? void 0 : data.role);
    if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "email is required");
    }
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role });
    await db.doc(`users/${user.uid}`).set({ role, email }, { merge: true });
    return { ok: true, uid: user.uid, role };
});
// Optional mirror: if a super_admin updates the users/{uid}.role directly,
// keep Auth custom claims in sync.
exports.onUserRoleMirror = functions
    .region("us-central1")
    .firestore.document("users/{uid}")
    .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const uid = context.params.uid;
    const nextRole = normalizeMaybe(after === null || after === void 0 ? void 0 : after.role);
    const prevRole = normalizeMaybe(before === null || before === void 0 ? void 0 : before.role);
    if (!nextRole || nextRole === prevRole)
        return;
    if (!VALID_ROLES.has(nextRole))
        return;
    await admin.auth().setCustomUserClaims(uid, { role: nextRole });
});
function normalizeMaybe(v) {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}
//# sourceMappingURL=claims.js.map