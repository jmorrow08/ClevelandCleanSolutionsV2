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
  onSave?: (updated: Partial<SupportTicket>) => Promise<void> | void;
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
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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
    if (!onSave) return;
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

  async function handleAttachSubmit() {
    if (files.length === 0 || !writeComment) return;
    setUploading(true);
    try {
      const metas = await uploadSupportAttachments(ticket.id, files);
      await writeComment({ ticketId: ticket.id, attachments: metas });
      setFiles([]);
    } finally {
      setUploading(false);
    }
  }

  const statusOptions: SupportStatus[] = useMemo(
    () => ["open", "in_progress", "resolved"],
    []
  );

  return (
    <div className="space-y-4">
      {/* Ticket Management Section - only show if user can edit */}
      {onSave && (
        <div className="rounded-lg card-bg shadow-elev-1 p-4">
          <h3 className="text-lg font-semibold mb-4">Update Ticket</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm mb-1" htmlFor="support-status">
                Status
              </label>
              <select
                id="support-status"
                className="w-full border rounded-md p-2 card-bg"
                value={status}
                onChange={(e) => setStatus(e.target.value as SupportStatus)}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
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
                className="w-full border rounded-md p-2 card-bg"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">— Unassigned —</option>
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
        </div>
      )}

      {/* Comment & Attachment Section - only show if user can comment */}
      {writeComment && (
        <div className="rounded-lg card-bg shadow-elev-1 p-4">
          <h3 className="text-lg font-semibold mb-4">
            Add Comment & Attachments
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1" htmlFor="support-comment">
                Comment
              </label>
              <textarea
                id="support-comment"
                className="w-full border rounded-md p-2 card-bg"
                rows={4}
                placeholder="Add a comment to this ticket..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1" htmlFor="support-files">
                Attachments (optional)
              </label>
              <input
                id="support-files"
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="w-full border rounded-md p-2 card-bg"
              />
              {files.length > 0 && (
                <div className="mt-2 text-sm text-zinc-600">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-zinc-500">
                {comment.trim() || files.length > 0
                  ? "Comment and attachments will be posted together"
                  : "Add a comment or select files to attach"}
              </div>
              <div className="flex gap-2">
                {(comment.trim() || files.length > 0) && (
                  <button
                    className={`px-3 py-2 rounded-md text-white ${
                      uploading
                        ? "bg-zinc-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700"
                    }`}
                    onClick={handleAttachSubmit}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading…" : "Post Comment"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "supportTickets", id));
        if (snap.exists()) {
          const ticketData = snap.data() as any;
          const ticket = { id: snap.id, ...ticketData } as SupportTicket;

          // Log for debugging - check if message field exists
          if (!ticket.message) {
            console.warn(
              `Support ticket ${id} is missing message field`,
              ticketData
            );
          }

          setTicket(ticket);
        } else {
          console.warn(`Support ticket ${id} not found`);
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

      {/* Combined Edit Form - renders once with both editing and commenting capabilities */}
      {editable || commentable ? (
        <SupportEditForm
          ticket={ticket}
          onSave={editable ? onSave : undefined}
          writeComment={commentable ? (p) => writeComment(p) : undefined}
          loadEmployees={editable ? loadAssignableEmployees : undefined}
        />
      ) : (
        <div className="text-xs text-zinc-500">
          You do not have permission to edit this ticket or add comments.
        </div>
      )}

      {/* Original Client Message Section */}
      {ticket?.message && ticket.message.trim() && (
        <div className="rounded-lg card-bg shadow-elev-1 p-4">
          <div className="text-sm font-medium mb-2">
            Client's Original Message
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {ticket.message}
            </div>
          </div>
        </div>
      )}

      {/* Fallback message if ticket exists but no message */}
      {ticket && (!ticket.message || !ticket.message.trim()) && (
        <div className="rounded-lg card-bg shadow-elev-1 p-4">
          <div className="text-sm font-medium mb-2">
            Client's Original Message
          </div>
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ The original message for this ticket could not be loaded. The
              ticket may have been created with incomplete data.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg card-bg shadow-elev-1 p-4">
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
    </div>
  );
}
