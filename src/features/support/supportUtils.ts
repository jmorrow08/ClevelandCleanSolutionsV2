import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import type { User } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";
import { getEmployeeNames } from "../../services/queries/resolvers";

export type SupportStatus = "open" | "in_progress" | "resolved";
export type SupportPriority = "low" | "normal" | "high" | "urgent";

export type SupportTicket = {
  id: string;
  subject?: string;
  clientId?: string | null;
  locationId?: string | null;
  status?: SupportStatus;
  priority?: SupportPriority;
  assigneeId?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

export type AttachmentMeta = {
  name: string;
  path: string;
  size: number;
  contentType?: string;
  url: string;
};

export type SupportComment = {
  id: string;
  ticketId: string;
  text?: string;
  authorRole: "admin" | "employee" | "client";
  attachments?: AttachmentMeta[];
  createdAt?: any;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

export function getPrioritySLAHours(priority?: SupportPriority): number {
  switch (priority) {
    case "urgent":
      return 8;
    case "high":
      return 24;
    case "normal":
      return 48;
    case "low":
      return 72;
    default:
      return 48;
  }
}

export function getSLAStatus(
  createdAt: any,
  priority?: SupportPriority
): {
  label: string;
  variant: "ok" | "warning" | "danger";
  msRemaining: number;
  dueAt: Date;
} {
  const hours = getPrioritySLAHours(priority);
  const createdDate: Date = createdAt?.toDate
    ? createdAt.toDate()
    : createdAt instanceof Date
    ? createdAt
    : new Date();
  const dueAt = new Date(createdDate.getTime() + hours * 60 * 60 * 1000);
  const msRemaining = dueAt.getTime() - Date.now();
  let variant: "ok" | "warning" | "danger" = "ok";
  if (msRemaining < 0) variant = "danger";
  else if (msRemaining < 6 * 60 * 60 * 1000) variant = "warning"; // <6h left
  const hrs = Math.abs(Math.round(msRemaining / (60 * 60 * 1000)));
  const tense = msRemaining >= 0 ? "due in" : "overdue by";
  const label = `SLA ${tense} ${hrs}h`;
  return { label, variant, msRemaining, dueAt };
}

export function canEditTicket(claims: Record<string, any> | null): boolean {
  return !!(claims?.owner || claims?.super_admin);
}

export function currentEmployeeIds(
  user: User | null,
  claims: Record<string, any> | null
): string[] {
  const ids: string[] = [];
  if (user?.uid) ids.push(user.uid);
  if ((claims as any)?.profileId) ids.push((claims as any).profileId);
  return Array.from(new Set(ids.filter(Boolean)));
}

export function canCommentOnTicket(
  user: User | null,
  claims: Record<string, any> | null,
  ticket: Pick<SupportTicket, "assigneeId"> | null
): boolean {
  if (!user) return false;
  if (canEditTicket(claims)) return true; // owners/super_admins always can
  if (!ticket?.assigneeId) return false;
  const ids = currentEmployeeIds(user, claims);
  return ids.includes(ticket.assigneeId);
}

export type SimpleEmployee = { id: string; fullName: string };

export async function loadAssignableEmployees(): Promise<SimpleEmployee[]> {
  ensureApp();
  const db = getFirestore();
  // Primary: employeeMasterList
  let list: SimpleEmployee[] = [];
  try {
    const snap = await getDocs(collection(db, "employeeMasterList"));
    const temp: SimpleEmployee[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      const parts = [data.firstName, data.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const name = data.fullName || parts || data.name || "Employee";
      temp.push({ id: d.id, fullName: name });
    });
    temp.sort((a, b) => a.fullName.localeCompare(b.fullName));
    list = temp;
  } catch (e) {
    // ignore and fallback
  }
  if (list.length === 0) {
    // Fallback: users with role in set
    try {
      const roles = ["employee", "admin", "owner", "super_admin"];
      const snapUsers = await getDocs(
        query(collection(db, "users"), where("role", "in", roles))
      );
      const conv: SimpleEmployee[] = [];
      snapUsers.forEach((d) => {
        const u = d.data() as any;
        const idForDetail = u.profileId || d.id;
        const display =
          u.fullName ||
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.displayName ||
          u.name ||
          u.email ||
          idForDetail;
        conv.push({ id: idForDetail, fullName: display });
      });
      conv.sort((a, b) => a.fullName.localeCompare(b.fullName));
      list = conv;
    } catch (e) {
      // keep empty
    }
  }
  return list;
}

export async function getEmployeeName(id?: string | null): Promise<string> {
  if (!id) return "—";
  const [name] = await getEmployeeNames([id]);
  return name || id;
}

export async function uploadSupportAttachments(
  ticketId: string,
  files: File[]
): Promise<AttachmentMeta[]> {
  if (!files || files.length === 0) return [];
  ensureApp();
  const storage = getStorage();
  const metas: AttachmentMeta[] = [];
  for (const file of files) {
    const path = `media/support/${ticketId}/${Date.now()}-${file.name}`;
    const ref = storageRef(storage, path);
    const snap = await uploadBytes(ref, file, {
      contentType: file.type || undefined,
    });
    const url = await getDownloadURL(snap.ref);
    metas.push({
      name: file.name,
      path,
      size: file.size,
      contentType: file.type || undefined,
      url,
    });
  }
  return metas;
}

export async function addSupportComment(
  ticketId: string,
  payload: {
    text?: string;
    authorRole: "admin" | "employee" | "client";
    attachments?: AttachmentMeta[];
  }
): Promise<{ id: string }> {
  ensureApp();
  const db = getFirestore();
  const ref = await addDoc(collection(db, "supportComments"), {
    ticketId,
    text: (payload.text || "").toString(),
    authorRole: payload.authorRole,
    attachments: payload.attachments || [],
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function createSupportTicket(
  ticket: Omit<SupportTicket, "id" | "createdAt" | "updatedAt"> &
    Partial<Pick<SupportTicket, "createdAt" | "updatedAt">>
): Promise<{ id: string }> {
  ensureApp();
  const db = getFirestore();
  const ref = await addDoc(collection(db, "supportTickets"), {
    ...ticket,
    status: (ticket.status || "open") as SupportStatus,
    priority: (ticket.priority || "normal") as SupportPriority,
    createdAt: ticket.createdAt || serverTimestamp(),
    updatedAt: ticket.updatedAt || serverTimestamp(),
  });

  // Enqueue notification for client acknowledgment (stub only)
  try {
    await addDoc(collection(db, "notifications"), {
      type: "support_ack",
      ticketId: ref.id,
      toClientId: ticket.clientId || null,
      status: "queued",
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // best-effort; ignore
  }

  return { id: ref.id };
}

export async function fetchTicketById(
  id: string
): Promise<SupportTicket | null> {
  ensureApp();
  const db = getFirestore();
  const snap = await getDoc(doc(db, "supportTickets", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as SupportTicket;
}

export function formatDateTime(ts: any): string {
  const d: Date = ts?.toDate
    ? ts.toDate()
    : ts instanceof Date
    ? ts
    : new Date();
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
