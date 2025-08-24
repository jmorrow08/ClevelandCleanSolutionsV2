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
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";

type Ticket = {
  id: string;
  subject?: string;
  message?: string;
  status?: string;
};

export default function SupportPage() {
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sent, setSent] = useState<"" | "ok" | "err">("");

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
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
          const list: Ticket[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setTickets(list);
        } catch (e: any) {
          console.warn("Client support tickets read", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSent("");
    if (!subject || !message) return;
    try {
      const auth = getAuth();
      const email = auth.currentUser?.email;
      if (!email) return;
      const db = getFirestore();
      await addDoc(collection(db, "supportTickets"), {
        subject,
        message,
        email,
        status: "open",
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
      setSubject("");
      setMessage("");
      setSent("ok");
    } catch (e) {
      setSent("err");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Support</h1>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Subject</label>
            <select
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            >
              <option value="">Select…</option>
              <option value="missed-cleaning">Missed Cleaning</option>
              <option value="billing-issue">Billing Issue</option>
              <option value="quality-concern">Quality Concern</option>
              <option value="schedule-change">Schedule Change Request</option>
              <option value="emergency">Emergency Service</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Message</label>
            <textarea
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <button className="px-3 py-2 rounded-md border" type="submit">
            Send
          </button>
          {sent === "ok" ? (
            <div className="text-green-600 text-sm">Message sent.</div>
          ) : sent === "err" ? (
            <div className="text-red-600 text-sm">Failed to send.</div>
          ) : null}
        </form>
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <div className="font-medium">Past Support Requests</div>
        {loading ? (
          <div className="text-sm text-zinc-500 mt-2">Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-zinc-500 mt-2">No previous tickets.</div>
        ) : (
          <ul className="text-sm mt-2 space-y-2">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="py-1 border-b border-zinc-200 dark:border-zinc-700"
              >
                {t.subject || "Ticket"} — {t.status || "open"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
