import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const VALID_ROLES = new Set([
  "super_admin",
  "owner",
  "admin",
  "employee",
  "client",
]);

function normalizeRole(input: unknown): string {
  const role = String(input || "").trim();
  if (!VALID_ROLES.has(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid role. Must be one of super_admin|owner|admin|employee|client"
    );
  }
  return role;
}

function callerRole(context: functions.https.CallableContext): string | null {
  const token = (context.auth?.token || {}) as Record<string, unknown>;
  if (typeof token.role === "string") return token.role as string;
  if (token["super_admin"] === true) return "super_admin";
  if (token["owner"] === true) return "owner";
  if (token["admin"] === true) return "admin";
  if (token["employee"] === true) return "employee";
  if (token["client"] === true) return "client";
  return null;
}

export const setUserRole = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required"
      );
    }
    const caller = callerRole(context);
    if (!caller) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Missing caller role"
      );
    }
    const targetUid = String(data?.targetUid || "").trim();
    const role = normalizeRole(data?.role);
    if (!targetUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "targetUid is required"
      );
    }

    const isSuper = caller === "super_admin";
    const isOwner = caller === "owner";
    const allowedByOwner = role === "admin" || role === "employee";

    if (!(isSuper || (isOwner && allowedByOwner))) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Insufficient privileges to assign this role"
      );
    }
    if (!isSuper && (role === "super_admin" || role === "owner")) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only super_admin can assign super_admin/owner"
      );
    }

    await admin.auth().setCustomUserClaims(targetUid, { role });
    await db.doc(`users/${targetUid}`).set({ role }, { merge: true });

    // Tell the client to refresh ID token
    return { ok: true, role };
  });

// Optional mirror: if a super_admin updates the users/{uid}.role directly,
// keep Auth custom claims in sync.
export const onUserRoleMirror = functions
  .region("us-central1")
  .firestore.document("users/{uid}")
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    const uid = context.params.uid as string;
    const nextRole = normalizeMaybe(after?.role);
    const prevRole = normalizeMaybe(before?.role);
    if (!nextRole || nextRole === prevRole) return;
    if (!VALID_ROLES.has(nextRole)) return;
    await admin.auth().setCustomUserClaims(uid, { role: nextRole });
  });

function normalizeMaybe(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}


