import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { primeClientName } from "../../services/queries/resolvers";

type NewClientContextValue = {
  open: () => void;
};

const NewClientContext = createContext<NewClientContextValue>({
  open: () => {},
});

export function useNewClientModal() {
  return useContext(NewClientContext);
}

export function NewClientProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState(false);
  const open = useCallback(() => setOpenState(true), []);
  const close = useCallback(() => setOpenState(false), []);

  return (
    <NewClientContext.Provider value={{ open }}>
      {children}
      {openState && <NewClientModal onClose={close} />}
    </NewClientContext.Provider>
  );
}

function NewClientModal({ onClose }: { onClose: () => void }) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clientIdString, setClientIdString] = useState("");
  const [status, setStatus] = useState(true);

  async function handleCreate() {
    const company = companyName.trim();
    const contact = contactName.trim();
    const emailStr = email.trim();
    const phoneStr = phone.trim();
    const clientId = clientIdString.trim();
    if (!company) {
      show({ type: "error", message: "Company name is required" });
      return;
    }
    if (!clientId) {
      show({ type: "error", message: "Client ID String is required" });
      return;
    }

    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const ref = await addDoc(collection(db, "clientMasterList"), {
        companyName: company,
        contactName: contact || null,
        email: emailStr || null,
        phone: phoneStr || null,
        clientIdString: clientId,
        status: status,
        createdAt: serverTimestamp(),
      });
      primeClientName(ref.id, company);
      show({ type: "success", message: "Client created" });
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to create client" });
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
        <div className="text-lg font-medium">New Client</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Company name</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Contact name</label>
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
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={clientIdString}
              onChange={(e) => setClientIdString(e.target.value)}
              placeholder="e.g., CCS-1234"
            />
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
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border card-bg"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewClientModal;
