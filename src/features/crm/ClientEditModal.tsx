import { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";

type Client = {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
};

export default function ClientEditModal({
  client,
  onClose,
  onUpdated,
}: {
  client: Client;
  onClose: () => void;
  onUpdated: (partial: Partial<Client>) => void;
}) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState(client.companyName || "");
  const [contactName, setContactName] = useState(client.contactName || "");
  const [email, setEmail] = useState(client.email || "");
  const [phone, setPhone] = useState(client.phone || "");

  async function handleSave() {
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const ref = doc(db, "clientMasterList", client.id);

      const payload = {
        companyName,
        contactName,
        email,
        phone,
      } as Partial<Client>;
      // Optimistic update
      onUpdated(payload);
      await updateDoc(ref, payload as any);
      show({ type: "success", message: "Client updated" });
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to update client" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Edit Client</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Company Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Contact Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Phone</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <RoleGuard allow={["owner", "super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md border bg-blue-600 text-white disabled:opacity-60"
              onClick={handleSave}
              disabled={submitting}
            >
              Save
            </button>
          </RoleGuard>
        </div>
      </div>
    </div>
  );
}
