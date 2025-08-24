import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../firebase";

type ApplyResult = {
  remainingDue: number;
  totalPaid: number;
  status: string | undefined;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

function toCents(amount: number | undefined | null): number {
  const n = Number(amount || 0) || 0;
  return Math.round(n * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export async function applyPaymentToInvoice(
  invoiceId: string,
  amount: number
): Promise<ApplyResult> {
  if (!invoiceId) throw new Error("invoiceId required");
  const cents = toCents(amount);
  if (cents <= 0) throw new Error("amount must be positive");
  ensureApp();
  const db = getFirestore();
  const invoiceRef = doc(db, "invoices", invoiceId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error("Invoice not found");
    const inv: any = snap.data();
    const invoiceAmount = toCents(inv?.totalAmount ?? inv?.amount ?? 0);
    const alreadyPaid = toCents(inv?.totalPaid ?? 0);
    const newPaid = alreadyPaid + cents;
    const remaining = Math.max(0, invoiceAmount - newPaid);
    const status = remaining === 0 ? "paid" : inv?.status || "pending";
    tx.update(invoiceRef, {
      totalPaid: fromCents(newPaid),
      status,
      updatedAt: Timestamp.now(),
    });
    return {
      remainingDue: fromCents(remaining),
      totalPaid: fromCents(newPaid),
      status,
    };
  });
}

export async function recomputeInvoicePaymentStatus(
  invoiceId: string
): Promise<ApplyResult> {
  ensureApp();
  const db = getFirestore();
  const ref = doc(db, "invoices", invoiceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Invoice not found");
  const inv: any = snap.data();
  const invoiceAmount = toCents(inv?.totalAmount ?? inv?.amount ?? 0);
  const alreadyPaid = toCents(inv?.totalPaid ?? 0);
  const remaining = Math.max(0, invoiceAmount - alreadyPaid);
  const status = remaining === 0 ? "paid" : inv?.status || "pending";
  await updateDoc(ref, { status });
  return {
    remainingDue: fromCents(remaining),
    totalPaid: fromCents(alreadyPaid),
    status,
  };
}
