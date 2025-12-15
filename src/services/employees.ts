import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseApp } from './firebase';

type CreateEmployeeUserParams = {
  firstName: string;
  lastName: string;
  employeeIdString: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  password: string;
  role?: 'employee' | 'admin';
};

function getFns() {
  const app = getFirebaseApp();
  const fns = getFunctions(app, 'us-central1');
  try {
    if (import.meta.env.DEV && (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === 'true') {
      connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    }
  } catch {
    // ignore emulator connection issues
  }
  return fns;
}

export async function createEmployeeUser(params: CreateEmployeeUserParams) {
  const fns = getFns();
  const callable = httpsCallable(fns, 'createEmployeeUser');
  const res = await callable(params);
  return res.data as any;
}
