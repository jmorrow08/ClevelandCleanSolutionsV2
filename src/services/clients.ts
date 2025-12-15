import { getFirebaseApp } from './firebase';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

type CreateClientUserParams = {
  email: string;
  password: string;
  clientIdString: string;
  companyName: string;
  contactName?: string;
  phone?: string;
};

function getFns() {
  const app = getFirebaseApp();
  const fns = getFunctions(app, 'us-central1');
  try {
    if (import.meta.env.DEV && (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === 'true') {
      connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    }
  } catch {}
  return fns;
}

export async function createClientUser(params: CreateClientUserParams) {
  const fns = getFns();
  const callable = httpsCallable(fns, 'createClientUser');
  const res = await callable(params);
  return res.data as any;
}

export async function deleteClient(params: { clientId: string }) {
  const fns = getFns();
  const callable = httpsCallable(fns, 'deleteClient');
  const res = await callable(params);
  return res.data as any;
}






