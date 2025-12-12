import * as functions from 'firebase-functions';
import { admin } from './firebaseAdmin';

const db = admin.firestore();

function getCallerRole(context: functions.https.CallableContext): string | null {
  const token = (context.auth?.token || {}) as Record<string, unknown>;
  if (typeof token.role === 'string') return String(token.role);
  if (token['super_admin'] === true) return 'super_admin';
  if (token['owner'] === true) return 'owner';
  if (token['admin'] === true) return 'admin';
  if (token['employee'] === true) return 'employee';
  if (token['client'] === true) return 'client';
  return null;
}

export const createClientUser = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    // Allow super_admin, owner, admin to create client users
    const role = getCallerRole(context);
    if (!role || !['super_admin', 'owner', 'admin'].includes(role)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Insufficient privileges to create client users',
      );
    }

    const email = String(data?.email || '')
      .trim()
      .toLowerCase();
    const password = String(data?.password || '');
    const companyName = String(data?.companyName || '').trim();
    const contactName = String((data?.contactName as string) || '').trim();
    const phone = String((data?.phone as string) || '').trim();
    const clientIdString = String(data?.clientIdString || '').trim();

    if (!email || !password || !companyName || !clientIdString) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'email, password, companyName and clientIdString are required',
      );
    }
    if (password.length < 6) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Password must be at least 6 characters',
      );
    }

    // Create client profile first so we can link profileId to the auth user
    const clientRef = await db.collection('clientMasterList').add({
      companyName,
      contactName: contactName || null,
      email,
      phone: phone || null,
      clientIdString,
      status: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // Create the auth user
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: contactName || companyName || email,
      });

      // Set custom claims for client role and attach profileId for faster reads
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        role: 'client',
        client: true,
        profileId: clientRef.id,
      });

      // Create users/{uid} document with linkage to client profile
      await db
        .collection('users')
        .doc(userRecord.uid)
        .set(
          {
            uid: userRecord.uid,
            email,
            phone: phone || null,
            role: 'client',
            profileId: clientRef.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid,
          },
          { merge: true },
        );

      return {
        success: true,
        uid: userRecord.uid,
        profileId: clientRef.id,
      };
    } catch (err) {
      // Rollback the client profile if user creation fails
      try {
        await clientRef.delete();
      } catch {}
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      const code = (err as any)?.code || 'unknown';
      const message = (err as any)?.message || 'Failed to create client user account';
      throw new functions.https.HttpsError('internal', `${code}: ${message}`);
    }
  });
