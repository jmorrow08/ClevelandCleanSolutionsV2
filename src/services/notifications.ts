import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  addDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase";

export type NotificationChannel = "in_app" | "email" | "sms" | string;

export type AppNotification = {
  id: string;
  userId?: string;
  orgId?: string;
  orgWide?: boolean;
  title?: string;
  message?: string;
  channel?: NotificationChannel;
  read?: boolean;
  readBy?: Record<string, boolean>;
  createdAt?: Timestamp | { seconds: number; nanoseconds: number } | Date;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

export function subscribeToUserNotifications(
  userId: string,
  options: {
    channel?: NotificationChannel | "all";
    includeOrgWide?: boolean;
  } = {}
): {
  unsubscribe: () => void;
  on: (cb: (list: AppNotification[]) => void) => void;
} {
  ensureApp();
  const db = getFirestore();
  const { channel, includeOrgWide } = options;

  const constraints: any[] = [];
  // Allow user-specific notifications and optionally org-wide (admin announcements)
  // We cannot OR queries client-side, so if includeOrgWide we fetch two streams and merge in UI.
  // Here we default to user-specific stream only; org-wide support will be handled by caller with a second subscription if needed.
  constraints.push(where("userId", "==", userId));
  if (channel && channel !== "all")
    constraints.push(where("channel", "==", channel));
  constraints.push(orderBy("createdAt", "desc"));

  const qref = query(collection(db, "notifications"), ...constraints);
  let handler: ((list: AppNotification[]) => void) | null = null;
  const unsub = onSnapshot(qref, (snap) => {
    const list: AppNotification[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
    handler && handler(list);
  });

  return {
    unsubscribe: () => unsub(),
    on: (cb: (list: AppNotification[]) => void) => {
      handler = cb;
    },
  };
}

export async function markAsRead(notificationId: string): Promise<void> {
  if (!notificationId) return;
  ensureApp();
  const db = getFirestore();
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

export async function markAsReadForUser(
  notificationId: string,
  userId: string,
  isOrgWide?: boolean
): Promise<void> {
  if (!notificationId || !userId) return;
  ensureApp();
  const db = getFirestore();
  const ref = doc(db, "notifications", notificationId);
  if (isOrgWide) {
    await updateDoc(ref, { ["readBy." + userId]: true });
    return;
  }
  await updateDoc(ref, { read: true });
}

export function subscribeToOrgAnnouncements(
  options: { channel?: NotificationChannel | "all" } = {}
): {
  unsubscribe: () => void;
  on: (cb: (list: AppNotification[]) => void) => void;
} {
  ensureApp();
  const db = getFirestore();
  const constraints: any[] = [where("orgWide", "==", true)];
  if (options.channel && options.channel !== "all")
    constraints.push(where("channel", "==", options.channel));
  constraints.push(orderBy("createdAt", "desc"));
  const qref = query(collection(db, "notifications"), ...constraints);
  let handler: ((list: AppNotification[]) => void) | null = null;
  const unsub = onSnapshot(qref, (snap) => {
    const list: AppNotification[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
    handler && handler(list);
  });
  return {
    unsubscribe: () => unsub(),
    on: (cb: (list: AppNotification[]) => void) => {
      handler = cb;
    },
  };
}

export async function createOrgAnnouncement(payload: {
  title: string;
  message: string;
  channel?: NotificationChannel;
  orgId?: string | null;
}): Promise<{ id: string }> {
  ensureApp();
  const db = getFirestore();
  const ref = await addDoc(collection(db, "notifications"), {
    orgWide: true,
    orgId: payload.orgId ?? null,
    title: payload.title || "",
    message: payload.message || "",
    channel: payload.channel || "in_app",
    createdAt: serverTimestamp(),
    readBy: {},
  });
  return { id: ref.id };
}
