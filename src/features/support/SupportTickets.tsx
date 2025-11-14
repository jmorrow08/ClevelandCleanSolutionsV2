import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { formatDateTime } from "./supportUtils";

type SupportTicket = {
  id: string;
  clientId?: string;
  clientName?: string;
  email?: string;
  subject?: string;
  message?: string;
  status?: string;
  adminComment?: string;
  createdAt?: any;
  lastUpdated?: any;
  updatedBy?: string;
};

export default function SupportTickets() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null
  );
  const [adminComment, setAdminComment] = useState("");

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const q = query(
        collection(db, "supportTickets"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: SupportTicket[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setTickets(list);
    } catch (error: any) {
      console.error("Error loading support tickets:", error);
      // Could show error state in UI
      setTickets([]); // Clear tickets on error
    } finally {
      setLoading(false);
    }
  }

  async function updateTicketStatus(ticketId: string, newStatus: string) {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, "supportTickets", ticketId), {
        status: newStatus,
        lastUpdated: serverTimestamp(),
      });
      await loadTickets(); // Refresh the list

      // Show success message
      const statusLabels = {
        open: "Open",
        in_progress: "In Progress",
        resolved: "Resolved",
      };
      alert(
        `✅ Ticket status updated to: ${
          statusLabels[newStatus as keyof typeof statusLabels] || newStatus
        }`
      );
    } catch (error: any) {
      console.error("Error updating ticket status:", error);
      alert(
        `❌ Failed to update ticket status: ${error.message || "Unknown error"}`
      );
    }
  }

  async function saveAdminComment(ticketId: string) {
    if (!adminComment.trim()) return;

    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await updateDoc(doc(db, "supportTickets", ticketId), {
        adminComment: adminComment.trim(),
        lastUpdated: serverTimestamp(),
        updatedBy: "Admin",
      });
      setAdminComment("");
      await loadTickets(); // Refresh the list

      // Show success message
      alert(
        "✅ Admin comment saved successfully! The client will be notified of the update."
      );
    } catch (error: any) {
      console.error("Error saving admin comment:", error);
      alert(
        `❌ Failed to save admin comment: ${error.message || "Unknown error"}`
      );
    }
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "open":
        return (
          <span className="px-2 py-1 rounded-md text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200">
            Open
          </span>
        );
      case "in_progress":
        return (
          <span className="px-2 py-1 rounded-md text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
            In Progress
          </span>
        );
      case "resolved":
        return (
          <span className="px-2 py-1 rounded-md text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200">
            Resolved
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-md text-xs bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {status || "Unknown"}
          </span>
        );
    }
  };

  if (selectedTicket) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedTicket(null)}
            className="px-3 py-2 rounded-md border hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Tickets
          </button>
          <h1 className="text-2xl font-semibold">
            Ticket: {selectedTicket.subject || `ID: ${selectedTicket.id}`}
          </h1>
        </div>

        <div className="rounded-lg card-bg shadow-elev-1 p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  {selectedTicket.subject || "Support Ticket"}
                </h2>
                <div className="text-sm text-zinc-500 space-y-1">
                  <div>Client: {selectedTicket.clientName || "Unknown"}</div>
                  <div>Email: {selectedTicket.email || "No email"}</div>
                  <div>
                    Submitted: {formatDateTime(selectedTicket.createdAt)}
                  </div>
                  {selectedTicket.lastUpdated && (
                    <div>
                      Last Updated: {formatDateTime(selectedTicket.lastUpdated)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedTicket.status)}
                <select
                  value={selectedTicket.status || "open"}
                  onChange={(e) =>
                    updateTicketStatus(selectedTicket.id, e.target.value)
                  }
                  className="px-2 py-1 rounded-md border text-sm"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Client Message:</h3>
              <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-md">
                <p className="whitespace-pre-wrap">
                  {selectedTicket.message || "No message content"}
                </p>
              </div>
            </div>

            {selectedTicket.adminComment && (
              <div className="border-t pt-4">
                <h3 className="font-medium mb-2">Admin Update:</h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                  <p className="whitespace-pre-wrap italic text-zinc-700 dark:text-zinc-300">
                    "{selectedTicket.adminComment}"
                  </p>
                  {selectedTicket.updatedBy && (
                    <div className="text-xs text-zinc-500 mt-2">
                      Updated by {selectedTicket.updatedBy}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Add Admin Update:</h3>
              <textarea
                value={adminComment}
                onChange={(e) => setAdminComment(e.target.value)}
                placeholder="Provide an update for the client..."
                rows={4}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => saveAdminComment(selectedTicket.id)}
                  disabled={!adminComment.trim()}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Update
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support Tickets</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage customer support requests and communications
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {tickets.length}
            </div>
            <div className="text-xs text-zinc-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {tickets.filter((t) => t.status === "open").length}
            </div>
            <div className="text-xs text-zinc-500">Open</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {tickets.filter((t) => t.status === "in_progress").length}
            </div>
            <div className="text-xs text-zinc-500">In Progress</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {tickets.filter((t) => t.status === "resolved").length}
            </div>
            <div className="text-xs text-zinc-500">Resolved</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg card-bg shadow-elev-1">
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading tickets…</div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            No support tickets found.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-semibold text-lg truncate">
                        {ticket.subject === "missed-cleaning" &&
                          "🧹 Missed Cleaning"}
                        {ticket.subject === "billing-issue" &&
                          "💳 Billing Issue"}
                        {ticket.subject === "quality-concern" &&
                          "⭐ Quality Concern"}
                        {ticket.subject === "schedule-change" &&
                          "📅 Schedule Change"}
                        {ticket.subject === "emergency" && "🚨 Emergency"}
                        {ticket.subject === "other" && "❓ Other Issue"}
                        {!ticket.subject && "📋 Support Request"}
                      </h3>
                      {getStatusBadge(ticket.status)}
                      {ticket.adminComment && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 text-xs rounded-full">
                          Response Sent
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div className="space-y-1">
                        <div className="text-sm">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            Client:
                          </span>
                          <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                            {ticket.clientName || "Unknown"}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            Email:
                          </span>
                          <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                            {ticket.email || "No email"}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            Submitted:
                          </span>
                          <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                            {formatDateTime(ticket.createdAt)}
                          </span>
                        </div>
                        {ticket.lastUpdated && (
                          <div className="text-sm">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              Last Updated:
                            </span>
                            <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                              {formatDateTime(ticket.lastUpdated)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {ticket.message && (
                      <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-md mb-3">
                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          Customer Message:
                        </div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                          {ticket.message}
                        </div>
                      </div>
                    )}

                    {ticket.adminComment && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border-l-4 border-blue-400">
                        <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                          Your Response:
                        </div>
                        <div className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                          {ticket.adminComment}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={ticket.status || "open"}
                        onChange={(e) =>
                          updateTicketStatus(ticket.id, e.target.value)
                        }
                        className="px-3 py-2 rounded-md border text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="open">🔴 Open</option>
                        <option value="in_progress">🟡 In Progress</option>
                        <option value="resolved">🟢 Resolved</option>
                      </select>
                      <button
                        onClick={() => setSelectedTicket(ticket)}
                        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                      >
                        Manage
                      </button>
                    </div>
                    <div className="text-xs text-zinc-500">
                      ID: {ticket.id.slice(-8)}
                    </div>
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
