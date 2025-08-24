import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";
import LocationEditModal from "./LocationEditModal";
import { getClientName } from "../../services/queries/resolvers";

type Location = {
  id: string;
  clientProfileId?: string;
  clientName?: string;
  locationName?: string;
  address?: any;
};

export default function LocationDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<Location | null>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clientLabel, setClientLabel] = useState("Client");

  useEffect(() => {
    async function load() {
      try {
        if (!id) return;
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "locations", id));
        if (!snap.exists()) {
          setLocation(null);
          return;
        }
        const l = { id: snap.id, ...(snap.data() as any) } as Location;
        setLocation(l);
        if (l.clientProfileId) {
          const name = await getClientName(l.clientProfileId);
          setClientLabel(name);
        }

        // Upcoming jobs for this location (serviceHistory future)
        try {
          const now = new Date();
          const snap2 = await getDocs(
            query(
              collection(db, "serviceHistory"),
              where("locationId", "==", id),
              orderBy("serviceDate", "asc"),
              limit(50)
            )
          );
          const list: any[] = [];
          snap2.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setUpcoming(
            list.filter((j) => {
              const dt = j.serviceDate?.toDate ? j.serviceDate.toDate() : null;
              return dt ? dt >= now : false;
            })
          );
        } catch (_) {
          setUpcoming([]);
        }

        // Recent notes from jobNotes for this location (last 10)
        try {
          const snap3 = await getDocs(
            query(
              collection(db, "serviceHistory"),
              where("locationId", "==", id),
              orderBy("serviceDate", "desc"),
              limit(20)
            )
          );
          const list: any[] = [];
          snap3.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setNotes(list.filter((x) => !!(x as any).jobNotes));
        } catch (_) {
          setNotes([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (!location) return <div className="p-4">Location not found.</div>;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">
            {location.locationName || location.id}
          </div>
          {location.clientProfileId && (
            <Link
              to={`/crm/clients/${location.clientProfileId}`}
              className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800"
            >
              {clientLabel}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RoleGuard allow={["owner", "super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-800"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </button>
          </RoleGuard>
          <RoleGuard allow={["super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md border bg-red-600 text-white disabled:opacity-60"
              disabled={deleting}
              onClick={async () => {
                if (!id) return;
                if (!confirm("Delete this location? This cannot be undone."))
                  return;
                try {
                  setDeleting(true);
                  const db = getFirestore();
                  await deleteDoc(doc(db, "locations", id));
                  // Note: leaving navigation to browser back
                  window.history.back();
                } catch (e) {
                  // no toast provider here; keep silent
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Delete
            </button>
          </RoleGuard>
        </div>
      </div>

      <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Location Name" value={location.locationName || "—"} />
          <Field label="Address" value={formatAddress(location.address)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-3">
          <div className="font-medium mb-2">Upcoming Jobs</div>
          {upcoming.length === 0 ? (
            <div className="text-sm text-zinc-500">No upcoming jobs.</div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((j) => (
                <div
                  key={j.id}
                  className="text-sm flex items-center justify-between"
                >
                  <div>{j.serviceType || "Service"}</div>
                  <div className="text-zinc-500">
                    {j.serviceDate?.toDate
                      ? j.serviceDate.toDate().toLocaleString()
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg bg-white dark:bg-zinc-800 shadow-elev-1 p-3">
          <div className="font-medium mb-2">Recent Notes</div>
          {notes.length === 0 ? (
            <div className="text-sm text-zinc-500">No recent notes.</div>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="text-sm">
                  <div className="text-zinc-500">
                    {n.serviceDate?.toDate
                      ? n.serviceDate.toDate().toLocaleDateString()
                      : ""}
                  </div>
                  <div className="whitespace-pre-wrap">{n.jobNotes}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <LocationEditModal
          location={location}
          onClose={() => setEditOpen(false)}
          onUpdated={(partial) =>
            setLocation((prev) => (prev ? { ...prev, ...partial } : prev))
          }
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  const parts: string[] = [];
  const a = addr || {};
  const line1 = a.line1 || a.street || "";
  const line2 = a.line2 || "";
  const city = a.city || "";
  const state = a.state || "";
  const zip = a.zip || "";
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);
  const cs = [city, state].filter(Boolean).join(", ");
  const tail = [cs, zip].filter(Boolean).join(" ");
  if (tail) parts.push(tail);
  return parts.join(", ");
}
