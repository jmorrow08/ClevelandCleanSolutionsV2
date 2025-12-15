import * as functions from 'firebase-functions';
import { admin } from './firebaseAdmin';

const db = admin.firestore();

const ADMIN_ROLES = new Set(['super_admin', 'owner', 'admin']);

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

async function resolveCallerRole(context: functions.https.CallableContext): Promise<string | null> {
  const tokenRole = getCallerRole(context);
  if (tokenRole) return tokenRole;

  const uid = context.auth?.uid;
  if (!uid) return null;

  try {
    const snap = await db.collection('users').doc(uid).get();
    const docRole = (snap.data()?.role as string | undefined)?.trim();
    if (docRole && ADMIN_ROLES.has(docRole)) {
      // Repair missing custom claims so future calls are authorized without fallback
      try {
        const safeClaims: Record<string, unknown> = {};
        const allowedKeys = [
          'profileId',
          'employeeProfileId',
          'clientProfileId',
          'super_admin',
          'owner',
          'admin',
          'employee',
          'client',
        ];
        for (const key of allowedKeys) {
          const value = (context.auth?.token as any)?.[key];
          if (value !== undefined) safeClaims[key] = value;
        }
        safeClaims.role = docRole;
        safeClaims[docRole] = true;
        await admin.auth().setCustomUserClaims(uid, safeClaims);
      } catch (err) {
        functions.logger.warn('Failed to refresh caller claims from user document', err);
      }
      return docRole;
    }
  } catch (err) {
    functions.logger.warn('Unable to read caller role from users/{uid}', err);
  }

  return null;
}

function normalizeRole(input: unknown, callerRole: string): 'employee' | 'admin' {
  const raw = String(input || '').trim();
  if (!raw) return 'employee';
  if (raw === 'admin') {
    return callerRole === 'super_admin' ? 'admin' : 'employee';
  }
  return 'employee';
}

export const createEmployeeUser = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const callerRole = await resolveCallerRole(context);
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Insufficient privileges to create employee users',
      );
    }

    const firstName = String(data?.firstName || '').trim();
    const lastName = String(data?.lastName || '').trim();
    const employeeIdString = String(data?.employeeIdString || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();
    const phone = String(data?.phone || '').trim();
    const jobTitle = String(data?.jobTitle || '').trim();
    const password = String(data?.password || '');
    const targetRole = normalizeRole(data?.role, callerRole);

    if (!firstName || !lastName || !employeeIdString || !email || !password) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'firstName, lastName, employeeIdString, email, and password are required',
      );
    }

    if (password.length < 6) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Password must be at least 6 characters',
      );
    }

    const displayName = `${firstName} ${lastName}`.trim() || email;
    const employeeRef = db.collection('employeeMasterList').doc();
    const timestamps = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await employeeRef.set({
      firstName,
      lastName,
      fullName: displayName,
      email,
      phone: phone || null,
      jobTitle: jobTitle || null,
      employeeIdString,
      role: targetRole,
      status: true,
      createdBy: context.auth.uid,
      ...timestamps,
    });

    let userRecord: admin.auth.UserRecord | null = null;

    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });

      const claims: Record<string, unknown> = {
        role: targetRole,
        profileId: employeeRef.id,
      };
      claims[targetRole] = true;

      await admin.auth().setCustomUserClaims(userRecord.uid, claims);

      await db
        .collection('users')
        .doc(userRecord.uid)
        .set(
          {
            uid: userRecord.uid,
            email,
            role: targetRole,
            profileId: employeeRef.id,
            employeeProfileId: employeeRef.id,
            firstName,
            lastName,
            fullName: displayName,
            phone: phone || null,
            employeeIdString,
            jobTitle: jobTitle || null,
            status: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid,
          },
          { merge: true },
        );

      await employeeRef.set(
        {
          userId: userRecord.uid,
          authUid: userRecord.uid,
        },
        { merge: true },
      );

      return {
        success: true,
        uid: userRecord.uid,
        profileId: employeeRef.id,
      };
    } catch (err) {
      try {
        await employeeRef.delete();
      } catch {
        // ignore cleanup errors
      }
      if (userRecord?.uid) {
        try {
          await admin.auth().deleteUser(userRecord.uid);
        } catch {
          // ignore cleanup errors
        }
      }
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      const code = (err as any)?.code || 'unknown';
      const message = (err as any)?.message || 'Failed to create employee user';
      throw new functions.https.HttpsError('internal', `${code}: ${message}`);
    }
  });
