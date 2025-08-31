import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

type Option = { id: string; label: string };

type ScheduleJobContextValue = {
  open: () => void;
};

const ScheduleJobContext = createContext<ScheduleJobContextValue>({
  open: () => {},
});

export function useScheduleJobModal() {
  return useContext(ScheduleJobContext);
}

export function ScheduleJobProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState(false);
  const open = useCallback(() => setOpenState(true), []);
  const close = useCallback(() => setOpenState(false), []);

  return (
    <ScheduleJobContext.Provider value={{ open }}>
      {children}
      {openState && <ScheduleJobModal onClose={close} />}
    </ScheduleJobContext.Provider>
  );
}

function ScheduleJobModal({ onClose }: { onClose: () => void }) {
  const { show } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [clients, setClients] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);

  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function loadInitial() {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      // Clients
      try {
        const snap = await getDocs(
          query(
            collection(db, "clientMasterList"),
            where("status", "==", true),
            orderBy("companyName")
          )
        );
        const list: Option[] = [];
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
        setClients(list);
      } catch (_) {
        // fallback to un-ordered fetch
        try {
          const snap = await getDocs(
            query(
              collection(db, "clientMasterList"),
              where("status", "==", true)
            )
          );
          const list: Option[] = [];
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
          setClients(list);
        } catch (e) {
          console.warn("Failed loading clients", e);
        }
      }

      // Employees
      try {
        const snap = await getDocs(
          query(
            collection(db, "employeeMasterList"),
            where("status", "==", true)
          )
        );
        const list: Option[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const label = data.fullName || data.name || data.email || d.id;
          list.push({ id: d.id, label });
        });
        setEmployees(list);
      } catch (e) {
        console.warn("Failed loading employees", e);
      }
    }
    loadInitial();
  }, []);

  // Load locations when client changes
  useEffect(() => {
    async function loadLocations() {
      if (!clientId) {
        setLocations([]);
        setLocationId("");
        return;
      }
      const db = getFirestore();
      try {
        const snap = await getDocs(
          query(
            collection(db, "locations"),
            where("clientProfileId", "==", clientId),
            where("status", "==", true)
          )
        );
        const list: Option[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const label = data.locationName || data.address || data.name || d.id;
          list.push({ id: d.id, label });
        });
        setLocations(list);
        // If current location isn't in new list, clear it
        if (!list.find((x) => x.id === locationId)) setLocationId("");
      } catch (e) {
        console.warn("Failed loading locations", e);
      }
    }
    loadLocations();
  }, [clientId]);

  const canSubmit = useMemo(() => {
    return (
      !!clientId && !!(locationId || clientId) && !!dateTime && !submitting
    );
  }, [clientId, locationId, dateTime, submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-md rounded-lg card-bg shadow-elev-3 p-4">
        <div className="text-lg font-medium">Schedule Job</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Client</label>
            <input
              list="schedule-clients"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="client id"
            />
            <datalist id="schedule-clients">
              {clients.map((c) => (
                <option key={c.id} value={c.id} label={c.label} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm mb-1">Location</label>
            <input
              list="schedule-locations"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="location id (optional if client-only)"
            />
            <datalist id="schedule-locations">
              {locations.map((l) => (
                <option key={l.id} value={l.id} label={l.label} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm mb-1">Date/Time</label>
            <input
              type="datetime-local"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Assigned employees</label>
            <select
              multiple
              className="w-full border rounded-md px-3 py-2 card-bg min-h-[100px]"
              value={assigned}
              onChange={(e) =>
                setAssigned(
                  Array.from(e.target.selectedOptions).map((o) => o.value)
                )
              }
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Notes (optional)</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-2 text-sm"
            onClick={() => !submitting && onClose()}
          >
            Cancel
          </button>
          <button
            className="px-3 py-2 text-sm rounded-md bg-brand-600 text-white disabled:opacity-50"
            disabled={!canSubmit}
            onClick={async () => {
              try {
                setSubmitting(true);
                if (!getApps().length) initializeApp(firebaseConfig);
                const db = getFirestore();
                const when = Timestamp.fromDate(new Date(dateTime));
                const payload: any = {
                  clientProfileId: clientId || null,
                  locationId: locationId || null,
                  serviceDate: when,
                  assignedEmployees: assigned,
                  status: "scheduled",
                  notes: notes || "",
                  createdAt: serverTimestamp(),
                  createdBy: user?.uid || null,
                };
                await addDoc(collection(db, "serviceHistory"), payload);
                show({ type: "success", message: "Job scheduled" });
                onClose();
                navigate("/scheduling");
              } catch (e: any) {
                show({
                  type: "error",
                  message: e?.message || "Failed to schedule job",
                });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
