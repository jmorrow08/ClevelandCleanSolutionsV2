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
  clientIdString?: string;
  status?: boolean;
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
  const [status, setStatus] = useState(client.status !== false);

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
        status,
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
      <div className="relative w-full max-w-md rounded-lg card-bg shadow-elev-3 p-4">
        <div className="text-lg font-medium">Edit Client</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Company Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Contact Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Phone</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Client ID String</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-400"
              value={client.clientIdString || ""}
              readOnly
            />
            <small className="text-xs text-gray-500">(Cannot be changed)</small>
          </div>
          <div>
            <label className="block text-sm mb-1">Status</label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={status ? "true" : "false"}
              onChange={(e) => setStatus(e.target.value === "true")}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
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
