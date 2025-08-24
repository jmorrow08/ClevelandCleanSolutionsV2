import { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  getDoc,
  doc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";

type LocationItem = { id: string; locationName?: string | null };

export default function UploadPhotos() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [activeTimeEntryId, setActiveTimeEntryId] = useState<string | null>(
    null
  );

  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      try {
        // Locations
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
      try {
        // Resolve profile & display name
        const us = await getDoc(doc(db, "users", user.uid));
        if (us.exists()) {
          const u = us.data() as any;
          setProfileId(typeof u.profileId === "string" ? u.profileId : null);
          const name =
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
            user.displayName ||
            user.email ||
            "Employee";
          setEmployeeName(name);
        }
      } catch {}
    })();
  }, [user?.uid]);

  const locationName = useMemo(
    () =>
      locations.find((l) => l.id === selectedLocationId)?.locationName || null,
    [locations, selectedLocationId]
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length) setFiles((prev) => prev.concat(selected));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!user?.uid || !profileId) {
      setMessage("Auth error. Please log in again.");
      return;
    }
    if (!selectedLocationId) {
      setMessage("Please select a location.");
      return;
    }
    if (files.length === 0) {
      setMessage("No photos selected.");
      return;
    }

    setMessage("Uploading…");
    setProgress("");
    const storage = getStorage();
    const db = getFirestore();
    try {
      const results: Array<{ url: string; original: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const timestamp = Date.now();
        const parts = f.name.split(".");
        const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
        const base = parts.join(".").replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `employeeUploads/${user.uid}/${timestamp}_${base}.${ext}`;
        const r = ref(storage, path);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        setProgress(`Uploaded ${i + 1}/${files.length}`);
        results.push({ url, original: f.name });
      }

      // Save metadata
      const location = locationName;
      const writes = results.map((res) =>
        addDoc(collection(db, "servicePhotos"), {
          photoUrl: res.url,
          originalFileName: res.original,
          locationId: selectedLocationId,
          locationName: location,
          employeeProfileId: profileId,
          employeeName,
          uploadedAt: serverTimestamp(),
          timeEntryId: activeTimeEntryId || null,
          notes: notes ? notes : null,
        })
      );
      await Promise.all(writes);

      setMessage("Upload complete!");
      setFiles([]);
      setNotes("");
      setProgress("");
    } catch (e: any) {
      setMessage(e?.message || "Upload failed.");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Upload Photos</h1>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1 space-y-3">
        <div className="text-sm">
          <div className="text-xs text-zinc-500 mb-1">Select location</div>
          <select
            className="w-full px-3 py-2 rounded-md border bg-white dark:bg-zinc-900"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-center cursor-pointer text-sm">
            Take/Choose Photos
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPick}
            />
          </label>
          <div className="px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900 text-sm">
            {files.length ? `Selected (${files.length})` : "No files selected"}
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs text-zinc-500 mb-1">
            Photo Notes (optional)
          </div>
          <textarea
            rows={3}
            className="w-full px-3 py-2 rounded-md border bg-white dark:bg-zinc-900"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:bg-zinc-400"
            disabled={!selectedLocationId || files.length === 0}
            onClick={handleUpload}
          >
            Submit Selected Photos
          </button>
          {progress ? (
            <div className="text-xs text-zinc-500">{progress}</div>
          ) : null}
        </div>

        {message ? <div className="text-sm">{message}</div> : null}
      </div>
    </div>
  );
}
