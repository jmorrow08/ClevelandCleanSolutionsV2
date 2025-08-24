import { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";

type Location = {
  id: string;
  locationName?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
};

export default function LocationEditModal({
  location,
  onClose,
  onUpdated,
}: {
  location: Location;
  onClose: () => void;
  onUpdated: (partial: Partial<Location>) => void;
}) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [locationName, setLocationName] = useState(location.locationName || "");
  const [line1, setLine1] = useState(location.address?.line1 || "");
  const [line2, setLine2] = useState(location.address?.line2 || "");
  const [city, setCity] = useState(location.address?.city || "");
  const [state, setState] = useState(location.address?.state || "");
  const [zip, setZip] = useState(location.address?.zip || "");

  async function handleSave() {
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const ref = doc(db, "locations", location.id);
      const payload: Partial<Location> = {
        locationName,
        address: { line1, line2, city, state, zip },
      };
      onUpdated(payload);
      await updateDoc(ref, payload as any);
      show({ type: "success", message: "Location updated" });
      onClose();
    } catch (e: any) {
      show({
        type: "error",
        message: e?.message || "Failed to update location",
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
      <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
        <div className="text-lg font-medium">Edit Location</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Location Name</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Address line 1</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Address line 2</label>
            <input
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm mb-1">City</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">State</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Zip</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
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
