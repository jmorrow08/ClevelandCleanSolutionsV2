import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  getDoc,
  doc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  limit,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";

type LocationItem = { id: string; locationName?: string | null };
type TimeEntry = {
  id: string;
  locationId: string;
  locationName?: string | null;
};
type NoteItem = {
  id: string;
  employeeName?: string;
  notes?: string;
  createdAt?: any;
};

export default function JobNotes() {
  const { user, claims } = useAuth();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [activeTimeEntryId, setActiveTimeEntryId] = useState<string | null>(
    null
  );
  const [isClockedIn, setIsClockedIn] = useState<boolean>(false);
  const [activeLocationName, setActiveLocationName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [rows, setRows] = useState<NoteItem[]>([]);
  const hasLinkedProfile = Boolean(profileId);
  const isOwnerActingAsEmployee = Boolean(claims?.owner && !claims?.employee);
  const noteActionsDisabled = submitting || !hasLinkedProfile;

  useEffect(() => {
    (async () => {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      // First, load locations
      const locationsList: LocationItem[] = [];
      try {
        const qLoc = query(
          collection(db, "locations"),
          where("status", "==", true),
          orderBy("locationName", "asc")
        );
        const snap = await getDocs(qLoc);
        snap.forEach((d) =>
          locationsList.push({ id: d.id, ...(d.data() as any) })
        );
        setLocations(locationsList);
      } catch (error) {
        console.error("Failed to load locations:", error);
      }

      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        const us = await getDoc(doc(db, "users", user.uid));
        if (us.exists()) {
          const u = us.data() as any;
          const profileIdValue =
            typeof u.profileId === "string" ? u.profileId : null;
          setProfileId(profileIdValue);
          setEmployeeName(
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
              user.displayName ||
              user.email ||
              "Employee"
          );

          // Check if employee is currently clocked in
          if (profileIdValue) {
            const timeEntryQuery = query(
              collection(db, "employeeTimeTracking"),
              where("employeeProfileId", "==", profileIdValue),
              where("clockOutTime", "==", null),
              orderBy("clockInTime", "desc"),
              limit(1)
            );
            const timeEntrySnap = await getDocs(timeEntryQuery);

            if (!timeEntrySnap.empty) {
              const timeEntry = timeEntrySnap.docs[0];
              const timeEntryData = timeEntry.data() as TimeEntry;
              setActiveTimeEntryId(timeEntry.id);
              setIsClockedIn(true);
              setSelectedLocationId(timeEntryData.locationId);

              // Get location name for display - now using the loaded locationsList
              const locationName =
                locationsList.find((l) => l.id === timeEntryData.locationId)
                  ?.locationName ||
                timeEntryData.locationName ||
                "Unknown Location";
              setActiveLocationName(locationName);
            } else {
              setIsClockedIn(false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
      }
      setLoading(false);
    })();
  }, [user?.uid]);

  const locationName = useMemo(
    () =>
      locations.find((l) => l.id === selectedLocationId)?.locationName || null,
    [locations, selectedLocationId]
  );

  async function loadNotes() {
    if (!selectedLocationId) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();
    try {
      setNotesLoading(true);

      // Get current day start and end timestamps
      const now = new Date();
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      const end = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999
      );

      const qy = query(
        collection(db, "generalJobNotes"),
        where("locationId", "==", selectedLocationId),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qy);
      const list: NoteItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setRows(list);
    } finally {
      setNotesLoading(false);
    }
  }

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

  async function submitNote() {
    if (!user?.uid || !profileId || !selectedLocationId) return;
    if (!notes.trim()) return;
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await addDoc(collection(db, "generalJobNotes"), {
        employeeProfileId: profileId,
        employeeName,
        locationId: selectedLocationId,
        locationName: isClockedIn ? activeLocationName : locationName,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        timeEntryId: activeTimeEntryId || null,
      });
      setNotes("");
      await loadNotes();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Job Notes (Today)</h1>
        <div className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="text-sm text-zinc-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Job Notes (Today)</h1>
      {!hasLinkedProfile ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50">
          <p className="font-semibold">Link required</p>
          <p className="mt-1">
            Notes are tied to an employee profile. We couldn&apos;t find one for
            this account, so creating notes is disabled until HR links your
            user to an employee record.
          </p>
          {isOwnerActingAsEmployee && (
            <p className="mt-2 text-xs opacity-80">
              You&apos;re signed in as an owner. Ask HR to attach this user to your
              employee profile so you can leave notes from the employee portal.
            </p>
          )}
        </div>
      ) : null}
      {hasLinkedProfile && isOwnerActingAsEmployee ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100">
          Notes submitted here will appear under your employee profile while in
          owner mode.
        </div>
      ) : null}

      <div className="rounded-lg p-4 card-bg shadow-elev-1 space-y-3">
        {isClockedIn ? (
          <div className="text-sm">
            <div className="text-xs text-zinc-500 mb-1">Current Location</div>
            <div className="px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">{activeLocationName}</span>
                <span className="text-xs">(Clocked In)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <div className="text-xs text-zinc-500 mb-1">Select location</div>
            <select
              className="w-full px-3 py-2 rounded-md border card-bg"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
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
          </div>
        )}

        <div className="text-sm">
          <div className="text-xs text-zinc-500 mb-1">Your Notes</div>
          <textarea
            rows={4}
            className="w-full px-3 py-2 rounded-md border card-bg"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isClockedIn
                ? "Add notes about your current work..."
                : "Add notes about this location..."
            }
            disabled={!hasLinkedProfile}
          />
          <div className="text-xs text-zinc-400 mt-1">
            Only today's notes are shown and will clear daily.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:bg-zinc-400 disabled:cursor-not-allowed"
            disabled={
              !selectedLocationId || !notes.trim() || noteActionsDisabled
            }
            onClick={submitNote}
          >
            {submitting ? "Saving…" : "Save Job Notes"}
          </button>
          {notesLoading ? (
            <div className="text-xs text-zinc-500">Loading notes…</div>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-zinc-500">No notes for today yet.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 font-medium">
              Today's Notes:
            </div>
            {rows.map((n) => (
              <div
                key={n.id}
                className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3 card-bg"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{n.employeeName || "Employee"}</span>
                  <span>
                    {n.createdAt?.toDate
                      ? n.createdAt.toDate().toLocaleString()
                      : n.createdAt?.seconds
                      ? new Date(n.createdAt.seconds * 1000).toLocaleString()
                      : ""}
                  </span>
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">
                  {n.notes}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
