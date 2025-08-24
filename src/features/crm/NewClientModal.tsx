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

  async function handleCreate() {
    const company = companyName.trim();
    const contact = contactName.trim();
    const emailStr = email.trim();
    const phoneStr = phone.trim();
    if (!company) {
      show({ type: "error", message: "Company name is required" });
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
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">New Client</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Company name</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Contact name</label>
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
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
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
