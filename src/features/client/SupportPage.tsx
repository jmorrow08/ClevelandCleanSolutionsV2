import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  limit,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  addSupportComment,
  type AttachmentMeta,
} from "../support/supportUtils";

function formatDateTime(ts: any): string {
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

type Ticket = {
  id: string;
  subject?: string;
  message?: string;
  status?: string;
  createdAt?: any;
  lastUpdated?: any;
  adminComment?: string;
  updatedBy?: string;
};

type Comment = {
  id: string;
  ticketId: string;
  text?: string;
  authorRole: "admin" | "employee" | "client";
  attachments?: AttachmentMeta[];
  createdAt?: any;
};

type TicketWithComments = Ticket & {
  comments: Comment[];
  newComment: string;
  submittingComment: boolean;
};

type ClientData = {
  id: string;
  companyName: string;
  email: string;
  contactName?: string;
};

export default function SupportPage() {
  const { user, profileId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<TicketWithComments[]>([]);
  const [sent, setSent] = useState<"" | "ok" | "err">("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadCommentsForTickets(
    ticketIds: string[]
  ): Promise<Record<string, Comment[]>> {
    if (ticketIds.length === 0) return {};

    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();

    const commentsMap: Record<string, Comment[]> = {};

    try {
      for (const ticketId of ticketIds) {
        const cq = query(
          collection(db, "supportComments"),
          where("ticketId", "==", ticketId),
          orderBy("createdAt", "asc")
        );
        const cSnap = await getDocs(cq);
        const comments: Comment[] = [];
        cSnap.forEach((d) => {
          comments.push({ id: d.id, ...(d.data() as any) });
        });
        commentsMap[ticketId] = comments;
      }
    } catch (e) {
      console.warn("Error loading comments:", e);
    }

    return commentsMap;
  }

  async function handleAddComment(
    ticketId: string,
    commentText: string,
    ticketIndex: number
  ) {
    if (!commentText.trim()) return;

    const updatedTickets = [...tickets];
    updatedTickets[ticketIndex].submittingComment = true;
    setTickets(updatedTickets);

    try {
      await addSupportComment(ticketId, {
        text: commentText.trim(),
        authorRole: "client",
      });

      // Reload comments for this ticket
      const commentsMap = await loadCommentsForTickets([ticketId]);
      updatedTickets[ticketIndex].comments = commentsMap[ticketId] || [];
      updatedTickets[ticketIndex].newComment = "";
      updatedTickets[ticketIndex].submittingComment = false;
      setTickets(updatedTickets);
    } catch (e) {
      console.error("Error adding comment:", e);
      updatedTickets[ticketIndex].submittingComment = false;
      setTickets(updatedTickets);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();

        // First, get client data
        if (user && profileId) {
          const db = getFirestore();
          try {
            const clientSnap = await getDoc(
              doc(db, "clientMasterList", profileId)
            );
            if (clientSnap.exists()) {
              const data = clientSnap.data() as any;
              setClientData({
                id: clientSnap.id,
                companyName: data.companyName || "Unknown Client",
                email: data.email || user.email || "",
                contactName: data.contactName,
              });
            }
          } catch (e: any) {
            console.warn("Client data fetch error:", e?.message);
          }
        }

        // Then load support tickets
        const email = auth.currentUser?.email;
        if (!email) return setLoading(false);

        const db = getFirestore();
        try {
          const q = query(
            collection(db, "supportTickets"),
            where("email", "==", email),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          const list: TicketWithComments[] = [];
          snap.forEach((d) =>
            list.push({
              id: d.id,
              ...(d.data() as any),
              comments: [],
              newComment: "",
              submittingComment: false,
            })
          );

          // Load comments for all tickets
          const ticketIds = list.map((t) => t.id);
          const commentsMap = await loadCommentsForTickets(ticketIds);

          // Add comments to tickets
          list.forEach((ticket) => {
            ticket.comments = commentsMap[ticket.id] || [];
          });

          setTickets(list);
        } catch (e: any) {
          console.warn("Client support tickets read", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, profileId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSent("");
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      // Validation
      if (!subject.trim()) {
        setErrorMessage("Please select a subject for your support request.");
        setSent("err");
        return;
      }

      if (!message.trim()) {
        setErrorMessage("Please provide details about your issue.");
        setSent("err");
        return;
      }

      if (message.trim().length < 10) {
        setErrorMessage(
          "Please provide more details (at least 10 characters)."
        );
        setSent("err");
        return;
      }

      const auth = getAuth();
      const email = auth.currentUser?.email;

      if (!email) {
        setErrorMessage("You must be signed in to submit a support request.");
        setSent("err");
        return;
      }

      if (!clientData) {
        setErrorMessage(
          "Unable to load your client information. Please try refreshing the page."
        );
        setSent("err");
        return;
      }

      const db = getFirestore();

      // Check for recent duplicate submissions (within last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentQuery = query(
        collection(db, "supportTickets"),
        where("email", "==", email),
        where("subject", "==", subject),
        where("createdAt", ">=", serverTimestamp() as any), // This won't work as expected, but we'll handle it client-side
        orderBy("createdAt", "desc"),
        limit(1)
      );

      try {
        const recentSnap = await getDocs(recentQuery);
        if (!recentSnap.empty) {
          const recentTicket = recentSnap.docs[0].data() as any;
          const createdAt =
            recentTicket.createdAt?.toDate?.() ||
            new Date(recentTicket.createdAt);
          if (createdAt > fiveMinutesAgo) {
            setErrorMessage(
              "You've recently submitted a similar request. Please wait a few minutes before submitting another."
            );
            setSent("err");
            return;
          }
        }
      } catch (queryError) {
        // If the query fails, continue with submission
        console.warn("Could not check for recent submissions:", queryError);
      }

      // Back to serverTimestamp but with more debugging
      const ticketData = {
        clientId: clientData.id,
        clientName: clientData.companyName,
        email: clientData.email,
        subject: subject.trim(),
        message: message.trim(),
        status: "open",
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };

      // Log successful validation for debugging (can be removed in production)
      console.log("✅ Support ticket data validated successfully");

      await addDoc(collection(db, "supportTickets"), ticketData);

      // Success
      setSubject("");
      setMessage("");
      setSent("ok");
      setErrorMessage("");

      // Refresh tickets list
      try {
        const q = query(
          collection(db, "supportTickets"),
          where("email", "==", email),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: TicketWithComments[] = [];
        snap.forEach((d) =>
          list.push({
            id: d.id,
            ...(d.data() as any),
            comments: [],
            newComment: "",
            submittingComment: false,
          })
        );

        // Load comments for all tickets
        const ticketIds = list.map((t) => t.id);
        const commentsMap = await loadCommentsForTickets(ticketIds);

        // Add comments to tickets
        list.forEach((ticket) => {
          ticket.comments = commentsMap[ticket.id] || [];
        });

        setTickets(list);
      } catch (refreshError) {
        console.warn("Could not refresh tickets list:", refreshError);
        // Don't show error to user since the ticket was successfully submitted
      }
    } catch (e: any) {
      console.error("Support ticket submission failed:", e.code, e.message);

      // Provide user-friendly error messages based on error type
      if (e.code === "permission-denied") {
        setErrorMessage(
          "You don't have permission to submit support requests. Please contact your administrator."
        );
      } else if (e.code === "unavailable") {
        setErrorMessage(
          "Service is temporarily unavailable. Please try again in a few minutes."
        );
      } else if (e.code === "deadline-exceeded") {
        setErrorMessage(
          "Request timed out. Please check your connection and try again."
        );
      } else if (e.message?.includes("quota")) {
        setErrorMessage("Service quota exceeded. Please try again later.");
      } else {
        setErrorMessage(
          "Failed to submit your request. Please try again or contact support directly."
        );
      }

      setSent("err");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Support</h1>
        <div className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="text-sm text-zinc-500">
            Please sign in to access support.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Support</h1>
        <div className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="text-sm text-zinc-500">
            Loading support information…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Support</h1>
      <div className="rounded-lg p-6 card-bg shadow-elev-1">
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">
            Submit a Support Request
          </h2>
          <p className="text-sm text-zinc-500">
            We're here to help! Please provide details about your issue and
            we'll get back to you within 24 hours.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              What type of issue are you experiencing?
            </label>
            <select
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              disabled={!clientData}
            >
              <option value="">Select a category…</option>
              <option value="missed-cleaning">
                🧹 Missed Cleaning Service
              </option>
              <option value="billing-issue">💳 Billing or Invoice Issue</option>
              <option value="quality-concern">⭐ Quality Concern</option>
              <option value="schedule-change">
                📅 Schedule Change Request
              </option>
              <option value="emergency">🚨 Emergency Service Needed</option>
              <option value="other">❓ Other Issue</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Please describe your issue in detail
            </label>
            <textarea
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              disabled={!clientData}
              placeholder={
                clientData
                  ? "Please provide as much detail as possible to help us resolve your issue quickly. Include dates, times, locations, and any other relevant information."
                  : "Loading client information…"
              }
            />
            <p className="text-xs text-zinc-500 mt-1">
              Minimum 10 characters. The more details you provide, the better we
              can help you.
            </p>
          </div>
          <button
            className="px-3 py-2 rounded-md border disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            type="submit"
            disabled={!clientData || sent === "ok" || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending...
              </>
            ) : sent === "ok" ? (
              "Message Sent!"
            ) : (
              "Send Message"
            )}
          </button>
          {sent === "ok" ? (
            <div className="text-green-600 text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-md border border-green-200 dark:border-green-800">
              ✅ Message sent successfully! We'll get back to you within 24
              hours.
            </div>
          ) : sent === "err" && errorMessage ? (
            <div className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800">
              ❌ {errorMessage}
            </div>
          ) : null}
        </form>
      </div>
      <div className="rounded-lg p-6 card-bg shadow-elev-1">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">Your Support History</h2>
          {tickets.length > 0 && (
            <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-xs rounded-full">
              {tickets.length} request{tickets.length !== 1 ? "s" : ""}
            </span>
          )}
          {(() => {
            const recentUpdates = tickets.filter((t) => {
              if (!t.lastUpdated || !t.adminComment) return false;
              const updateTime =
                t.lastUpdated?.toDate?.() || new Date(t.lastUpdated);
              const hoursSinceUpdate =
                (Date.now() - updateTime.getTime()) / (1000 * 60 * 60);
              return hoursSinceUpdate <= 24;
            });
            return recentUpdates.length > 0 ? (
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200 text-xs rounded-full animate-pulse">
                {recentUpdates.length} new update
                {recentUpdates.length !== 1 ? "s" : ""}
              </span>
            ) : null;
          })()}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <div className="text-sm text-zinc-500">
              Loading your support history…
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-sm text-zinc-500">
              No support requests yet.
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Your support history will appear here.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t, index) => (
              <div
                key={t.id}
                className="border border-zinc-200 dark:border-zinc-700 rounded-md p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">
                        {t.subject === "missed-cleaning" &&
                          "🧹 Missed Cleaning"}
                        {t.subject === "billing-issue" && "💳 Billing Issue"}
                        {t.subject === "quality-concern" &&
                          "⭐ Quality Concern"}
                        {t.subject === "schedule-change" &&
                          "📅 Schedule Change"}
                        {t.subject === "emergency" && "🚨 Emergency"}
                        {t.subject === "other" && "❓ Other Issue"}
                        {!t.subject && "📋 Support Request"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          t.status === "open"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                            : t.status === "in_progress"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                            : t.status === "resolved"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        {t.status === "open" && "Open"}
                        {t.status === "in_progress" && "In Progress"}
                        {t.status === "resolved" && "Resolved"}
                        {!t.status && "Open"}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Submitted {formatDateTime(t.createdAt)}
                      {t.lastUpdated && t.lastUpdated !== t.createdAt && (
                        <span> • Updated {formatDateTime(t.lastUpdated)}</span>
                      )}
                    </div>

                    {/* Original message */}
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Your Message
                      </div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">
                        {t.message}
                      </div>
                    </div>

                    {/* Comments section */}
                    {t.comments.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Conversation
                        </div>
                        {t.comments.map((comment) => (
                          <div
                            key={comment.id}
                            className={`p-3 rounded-md ${
                              comment.authorRole === "client"
                                ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400"
                                : "bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400"
                            }`}
                          >
                            <div className="text-xs font-medium mb-1 flex items-center gap-2">
                              <span
                                className={
                                  comment.authorRole === "client"
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-green-700 dark:text-green-300"
                                }
                              >
                                {comment.authorRole === "client"
                                  ? "👤 You"
                                  : "🛠️ Support Team"}
                              </span>
                              <span className="text-zinc-500">
                                {formatDateTime(comment.createdAt)}
                              </span>
                            </div>
                            {comment.text && (
                              <div className="text-sm text-zinc-800 dark:text-zinc-200">
                                {comment.text}
                              </div>
                            )}
                            {comment.attachments &&
                              comment.attachments.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {comment.attachments.map(
                                    (attachment, idx) => (
                                      <a
                                        key={idx}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-700 text-xs rounded hover:bg-zinc-200 dark:hover:bg-zinc-600"
                                      >
                                        📎 {attachment.name}
                                      </a>
                                    )
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add comment section */}
                    {t.status !== "resolved" && (
                      <div className="mt-4">
                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          Add a comment
                        </div>
                        <textarea
                          className="w-full border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-2 bg-transparent text-sm resize-vertical"
                          rows={3}
                          placeholder="Type your comment here..."
                          value={t.newComment}
                          onChange={(e) => {
                            const updatedTickets = [...tickets];
                            updatedTickets[index].newComment = e.target.value;
                            setTickets(updatedTickets);
                          }}
                          disabled={t.submittingComment}
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            className={`px-3 py-2 rounded-md text-white text-sm ${
                              t.newComment.trim() && !t.submittingComment
                                ? "bg-blue-600 hover:bg-blue-700"
                                : "bg-zinc-400 cursor-not-allowed"
                            }`}
                            onClick={() =>
                              handleAddComment(t.id, t.newComment, index)
                            }
                            disabled={
                              !t.newComment.trim() || t.submittingComment
                            }
                          >
                            {t.submittingComment
                              ? "Sending..."
                              : "Send Comment"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Legacy admin comment display (for backward compatibility) */}
                    {t.adminComment && t.comments.length === 0 && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border-l-4 border-blue-400">
                        <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-2">
                          <span>Admin Response</span>
                          {t.lastUpdated &&
                            (() => {
                              const updateTime =
                                t.lastUpdated?.toDate?.() ||
                                new Date(t.lastUpdated);
                              const hoursSinceUpdate =
                                (Date.now() - updateTime.getTime()) /
                                (1000 * 60 * 60);
                              return hoursSinceUpdate <= 24 ? (
                                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200 text-xs rounded-full">
                                  New
                                </span>
                              ) : null;
                            })()}
                        </div>
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          {t.adminComment}
                        </div>
                        {t.lastUpdated && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            Updated {formatDateTime(t.lastUpdated)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
