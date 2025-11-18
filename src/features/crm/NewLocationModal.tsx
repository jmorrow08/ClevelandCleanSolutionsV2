import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { primeLocationName } from "../../services/queries/resolvers";

type Option = { id: string; label: string };

type NewLocationContextValue = {
  open: () => void;
};

const NewLocationContext = createContext<NewLocationContextValue>({
  open: () => {},
});

export function useNewLocationModal() {
  return useContext(NewLocationContext);
}

export function NewLocationProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState(false);
  const open = useCallback(() => setOpenState(true), []);
  const close = useCallback(() => setOpenState(false), []);

  return (
    <NewLocationContext.Provider value={{ open }}>
      {children}
      {openState && <NewLocationModal onClose={close} />}
    </NewLocationContext.Provider>
  );
}

function NewLocationModal({ onClose }: { onClose: () => void }) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [clients, setClients] = useState<Option[]>([]);
  const [clientProfileId, setClientProfileId] = useState("");
  const [locationName, setLocationName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    async function loadClients() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        // Prefer ordered active clients
        const list: Option[] = [];
        try {
          const snap = await getDocs(
            query(
              collection(db, "clientMasterList"),
              where("status", "==", true),
              orderBy("companyName")
            )
          );
          snap.forEach((d) => {
            const data = d.data() as any;
            const label =
              data.companyName ||
              data.name ||
              data.contactName ||
              data.email ||
              d.id;
            list.push({ id: d.id, label });
          });
        } catch (_) {
          const snap = await getDocs(
            query(
              collection(db, "clientMasterList"),
              where("status", "==", true)
            )
          );
          snap.forEach((d) => {
            const data = d.data() as any;
            const label =
              data.companyName ||
              data.name ||
              data.contactName ||
              data.email ||
              d.id;
            list.push({ id: d.id, label });
          });
        }
        setClients(list);
      } catch (e) {
        // Soft-fail
      }
    }
    loadClients();
  }, []);

  async function handleCreate() {
    const clientId = clientProfileId.trim();
    const locName = locationName.trim();
    if (!clientId) {
      show({ type: "error", message: "Client is required" });
      return;
    }
    if (!locName) {
      show({ type: "error", message: "Location name is required" });
      return;
    }
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const ref = await addDoc(collection(db, "locations"), {
        clientProfileId: clientId,
        locationName: locName,
        address: {
          line1: line1.trim() || null,
          line2: line2.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
        },
        status: true,
        createdAt: serverTimestamp(),
      });
      primeLocationName(ref.id, locName);
      show({ type: "success", message: "Location created" });
      onClose();
    } catch (e: any) {
      show({
        type: "error",
        message: e?.message || "Failed to create location",
      });
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
        <div className="text-lg font-medium">New Location</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Client</label>
            <input
              list="new-location-clients"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={clientProfileId}
              onChange={(e) => setClientProfileId(e.target.value)}
              placeholder="client id"
            />
            <datalist id="new-location-clients">
              {clients.map((c) => (
                <option key={c.id} value={c.id} label={c.label} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm mb-1">Location name</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Address line 1</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Address line 2</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm mb-1">City</label>
              <input
                className="w-full border rounded-md px-3 py-2 card-bg"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">State</label>
              <input
                className="w-full border rounded-md px-3 py-2 card-bg"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">ZIP</label>
              <input
                className="w-full border rounded-md px-3 py-2 card-bg"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
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

export default NewLocationModal;
