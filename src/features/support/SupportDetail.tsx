import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  addSupportComment,
  canCommentOnTicket,
  canEditTicket,
  getSLAStatus,
  loadAssignableEmployees,
  uploadSupportAttachments,
  type AttachmentMeta,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from "./supportUtils";
// import { getEmployeeNames } from "../../services/queries/resolvers";

type Employee = { id: string; fullName: string };

export function SupportEditForm({
  ticket,
  onSave,
  loadEmployees,
  writeComment,
}: {
  ticket: SupportTicket;
  onSave: (updated: Partial<SupportTicket>) => Promise<void> | void;
  loadEmployees?: () => Promise<Employee[]>;
  writeComment?: (payload: {
    ticketId: string;
    text?: string;
    attachments?: AttachmentMeta[];
  }) => Promise<{ id: string } | void>;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [status, setStatus] = useState<SupportStatus>(ticket.status || "open");
  const [assignee, setAssignee] = useState<string>(ticket.assigneeId || "");
  const [comment, setComment] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (loadEmployees) {
        setEmployees(await loadEmployees());
      } else {
        setEmployees(await loadAssignableEmployees());
      }
    }
    load();
  }, [loadEmployees]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ status, assigneeId: assignee || null });
      if (comment.trim() && writeComment) {
        await writeComment({ ticketId: ticket.id, text: comment.trim() });
        setComment("");
      }
    } finally {
      setSaving(false);
    }
  }

  const statusOptions: SupportStatus[] = useMemo(
    () => ["open", "in_progress", "resolved"],
    []
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-sm mb-1" htmlFor="support-status">
            Status
          </label>
          <select
            id="support-status"
            className="w-full border rounded-md p-2 bg-white dark:bg-zinc-900"
            value={status}
            onChange={(e) => setStatus(e.target.value as SupportStatus)}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1" htmlFor="support-assignee">
            Assignee
          </label>
          <select
            id="support-assignee"
            className="w-full border rounded-md p-2 bg-white dark:bg-zinc-900"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <button
            className={`px-3 py-2 rounded-md text-white ${
              saving
                ? "bg-zinc-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-1">Add a comment</div>
        <textarea
          className="w-full border rounded-md p-2 bg-white dark:bg-zinc-900"
          rows={3}
          placeholder="Write a comment…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
    </div>
  );
}

export default function SupportDetail() {
  const { id } = useParams();
  const { user, claims } = useAuth();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<
    Array<{
      id: string;
      text?: string;
      authorRole?: string;
      attachments?: AttachmentMeta[];
      createdAt?: any;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "supportTickets", id));
        if (snap.exists()) {
          setTicket({ id: snap.id, ...(snap.data() as any) } as SupportTicket);
        } else {
          setTicket(null);
        }
        const cq = query(
          collection(db, "supportComments"),
          where("ticketId", "==", id),
          orderBy("createdAt", "asc")
        );
        const cSnap = await getDocs(cq);
        const list: any[] = [];
        cSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setComments(list);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const sla = useMemo(
    () => getSLAStatus(ticket?.createdAt, ticket?.priority as SupportPriority),
    [ticket?.createdAt, ticket?.priority]
  );

  if (!id) return <div className="text-sm text-zinc-500">Ticket not found</div>;
  if (loading) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!ticket)
    return <div className="text-sm text-zinc-500">Ticket not found</div>;

  const editable = canEditTicket(claims);
  const commentable = canCommentOnTicket(user, claims, ticket);

  async function onSave(updated: Partial<SupportTicket>) {
    if (!editable) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    if (!ticket) return;
    await updateDoc(doc(db, "supportTickets", ticket.id), {
      ...updated,
      updatedAt: serverTimestamp(),
    });
    setTicket((prev) => ({ ...(prev as any), ...updated }));
  }

  async function writeComment(payload: {
    ticketId: string;
    text?: string;
    attachments?: AttachmentMeta[];
  }) {
    if (!commentable) return;
    const auth = getAuth();
    const token = await auth.currentUser?.getIdTokenResult(true);
    const role =
      token?.claims?.admin || token?.claims?.owner || token?.claims?.super_admin
        ? "admin"
        : "employee";
    if (!ticket) return;
    const ref = await addSupportComment(ticket.id, {
      text: payload.text,
      attachments: payload.attachments,
      authorRole: role as any,
    });
    setComments((prev) => [
      ...prev,
      {
        id: (ref as any).id,
        text: payload.text,
        attachments: payload.attachments,
        createdAt: new Date(),
        authorRole: role,
      },
    ]);
  }

  async function handleUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(ev.target.files || []);
    setFiles(list);
  }

  async function handleAttachSubmit() {
    if (!commentable || files.length === 0) return;
    if (!ticket) return;
    setUploading(true);
    try {
      const metas = await uploadSupportAttachments(ticket.id, files);
      await writeComment({ ticketId: ticket.id, attachments: metas });
      setFiles([]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {ticket.subject || `Ticket ${ticket.id}`}
          </h1>
          <div className="text-xs text-zinc-500">ID: {ticket.id}</div>
        </div>
        <div>
          <span
            className={`inline-block px-2 py-1 rounded-md text-xs ${
              sla.variant === "danger"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                : sla.variant === "warning"
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
            }`}
            title={sla.dueAt.toLocaleString()}
          >
            {sla.label}
          </span>
        </div>
      </div>

      {editable ? (
        <SupportEditForm ticket={ticket} onSave={onSave} />
      ) : (
        <div className="text-xs text-zinc-500">
          You do not have permission to edit status or assignee.
        </div>
      )}

      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4">
        <div className="text-sm font-medium mb-2">Comments</div>
        {comments.length === 0 ? (
          <div className="text-sm text-zinc-500">No comments yet.</div>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                {c.text ? <div className="mb-1">{c.text}</div> : null}
                {Array.isArray(c.attachments) && c.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {c.attachments.map((a, idx) => (
                      <a
                        key={`${c.id}:${idx}`}
                        className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-700 text-xs"
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        title={a.name}
                      >
                        {a.contentType?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.url}
                            alt={a.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : null}
                        <span className="truncate max-w-[160px]" title={a.name}>
                          {a.name}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="text-xs text-zinc-500 mt-1">
                  {c.authorRole || "employee"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {commentable ? (
        <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-4 space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">Add a comment</div>
            <SupportEditForm
              ticket={ticket}
              onSave={onSave}
              writeComment={(p) => writeComment(p)}
            />
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Add attachments</div>
            <input type="file" multiple onChange={handleUpload} />
            <div className="mt-2">
              <button
                className={`px-3 py-2 rounded-md text-white ${
                  uploading || files.length === 0
                    ? "bg-zinc-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={handleAttachSubmit}
                disabled={uploading || files.length === 0}
              >
                {uploading ? "Uploading…" : "Upload & Comment"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">
          You can view comments but cannot add new ones.
        </div>
      )}
    </div>
  );
}
