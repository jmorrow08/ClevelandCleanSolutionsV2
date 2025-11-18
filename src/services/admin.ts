import { getFirebaseApp } from "./firebase";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

export type AssignableRole = "super_admin" | "owner" | "admin" | "employee" | "client";

function getFns() {
  const app = getFirebaseApp();
  const fns = getFunctions(app, "us-central1");
  try {
    if (
      import.meta.env.DEV &&
      (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === "true"
    ) {
      connectFunctionsEmulator(fns, "127.0.0.1", 5001);
    }
  } catch {}
  return fns;
}

export async function assignUserRoleByEmail(email: string, role: AssignableRole) {
  const fns = getFns();
  const setByEmail = httpsCallable(fns, "setUserRoleByEmail");
  const res = await setByEmail({ email, role });
  return res.data as any;
}


