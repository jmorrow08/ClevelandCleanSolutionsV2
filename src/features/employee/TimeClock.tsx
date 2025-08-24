import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  serverTimestamp,
  GeoPoint,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";

type LocationItem = { id: string; locationName?: string | null };

export default function TimeClock() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [clockInAt, setClockInAt] = useState<Date | null>(null);
  const [clockInLocName, setClockInLocName] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Load active locations
        try {
          const qLoc = query(
            collection(db, "locations"),
            where("status", "==", true),
            orderBy("locationName", "asc")
          );
          const snap = await getDocs(qLoc);
          const list: LocationItem[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setLocations(list);
        } catch {}

        if (!user?.uid) return;
        // Resolve employee profileId
        try {
          const us = await getDoc(doc(db, "users", user.uid));
          const pid =
            us.exists() && typeof (us.data() as any).profileId === "string"
              ? (us.data() as any).profileId
              : null;
          setProfileId(pid);
        } catch {}

        // Check current active time entry
        if (profileId) {
          const qy = query(
            collection(db, "employeeTimeTracking"),
            where("employeeProfileId", "==", profileId),
            where("clockOutTime", "==", null),
            orderBy("clockInTime", "desc"),
            limit(1)
          );
          try {
            const activeSnap = await getDocs(qy);
            if (!activeSnap.empty) {
              const d = activeSnap.docs[0];
              setActiveEntryId(d.id);
              const data = d.data() as any;
              const t = data?.clockInTime?.toDate
                ? data.clockInTime.toDate()
                : data?.clockInTime?.seconds
                ? new Date(data.clockInTime.seconds * 1000)
                : null;
              setClockInAt(t);
              setClockInLocName(data?.locationName || "");
              setSelectedLocationId(data?.locationId || "");
            } else {
              setActiveEntryId(null);
              setClockInAt(null);
              setClockInLocName("");
            }
          } catch {}
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profileId]);

  const indicatorClass = useMemo(() => {
    if (activeEntryId) return "bg-green-500";
    return "bg-red-500";
  }, [activeEntryId]);

  function currentStatusText(): string {
    if (activeEntryId) {
      const loc =
        clockInLocName ||
        locations.find((l) => l.id === selectedLocationId)?.locationName ||
        "Selected Location";
      const t = clockInAt
        ? clockInAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "—";
      return `Clocked In @ ${loc} since ${t}`;
    }
    return "Clocked Out";
  }

  async function getCoords(): Promise<GeoPoint | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve(new GeoPoint(pos.coords.latitude, pos.coords.longitude)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async function clockIn() {
    if (!user?.uid || !profileId) return;
    if (!selectedLocationId) {
      setMessage("Please select a location.");
      return;
    }
    try {
      setSaving(true);
      setMessage("Getting location & clocking in…");
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const coords = await getCoords();
      const locationName =
        locations.find((l) => l.id === selectedLocationId)?.locationName ||
        null;
      const ref = await addDoc(collection(db, "employeeTimeTracking"), {
        employeeProfileId: profileId,
        locationId: selectedLocationId,
        locationName,
        clockInTime: serverTimestamp(),
        clockOutTime: null,
        status: "Clocked In",
        clockInCoordinates: coords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveEntryId(ref.id);
      setClockInAt(new Date());
      setClockInLocName(locationName || "");
      setMessage("Clocked In!");
    } catch (e: any) {
      setMessage(e?.message || "Error clocking in.");
    } finally {
      setSaving(false);
    }
  }

  async function clockOut() {
    if (!activeEntryId) return;
    try {
      setSaving(true);
      setMessage("Getting location & clocking out…");
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const coords = await getCoords();
      await updateDoc(doc(db, "employeeTimeTracking", activeEntryId), {
        clockOutTime: serverTimestamp(),
        status: "Clocked Out",
        clockOutCoordinates: coords,
        updatedAt: serverTimestamp(),
      });
      setActiveEntryId(null);
      setClockInAt(null);
      setMessage("Clocked Out!");
    } catch (e: any) {
      setMessage(e?.message || "Error clocking out.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Time Clock</h1>

      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-md bg-zinc-50 dark:bg-zinc-900">
          <div className="text-sm">
            <div className="font-medium flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${indicatorClass}`}></span>
              Current Status
            </div>
            <div className="text-zinc-500">
              {loading ? "Checking…" : currentStatusText()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!activeEntryId ? (
              <button
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:bg-zinc-400"
                onClick={clockIn}
                disabled={saving || !selectedLocationId}
              >
                {saving ? "Working…" : "Clock In"}
              </button>
            ) : (
              <button
                className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm disabled:bg-zinc-400"
                onClick={clockOut}
                disabled={saving}
              >
                {saving ? "Working…" : "Clock Out"}
              </button>
            )}
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs text-zinc-500 mb-1">
            Select your working location
          </div>
          <select
            className="w-full px-3 py-2 rounded-md border bg-white dark:bg-zinc-900"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={Boolean(activeEntryId)}
          >
            <option value="">
              {locations.length
                ? "-- Select a Location --"
                : "-- Loading Locations --"}
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.locationName || l.id}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
            Location is required for clock-in.
          </div>
        </div>

        {message ? <div className="text-sm">{message}</div> : null}

        {clockInAt ? (
          <div className="text-xs text-zinc-500">
            Clocked in at: {clockInAt.toLocaleString()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
