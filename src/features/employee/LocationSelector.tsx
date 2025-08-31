import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { MapPin, Info } from "lucide-react";

type Location = {
  id: string;
  locationName: string;
};

export default function LocationSelector() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load saved location from localStorage
    const savedLocation = localStorage.getItem("employee-selected-location");
    if (savedLocation) {
      setSelectedLocationId(savedLocation);
    }
  }, []);

  useEffect(() => {
    async function loadLocations() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        const locationsQuery = query(
          collection(db, "locations"),
          where("status", "==", true),
          orderBy("locationName", "asc")
        );

        const snapshot = await getDocs(locationsQuery);
        const locationsList: Location[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          locationsList.push({
            id: doc.id,
            locationName: data.locationName || "Unnamed Location",
          });
        });

        setLocations(locationsList);
      } catch (error) {
        console.error("Error loading locations:", error);
      } finally {
        setLoading(false);
      }
    }

    loadLocations();
  }, []);

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId);
    // Save to localStorage for persistence
    localStorage.setItem("employee-selected-location", locationId);
  };

  return (
    <div className="card-bg border border-border rounded-lg shadow-sm mb-6">
      <div className="p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5" />
          Current Location
        </h2>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="location-select"
              className="block text-sm font-medium mb-2"
            >
              Select your working location:
            </label>
            <select
              id="location-select"
              value={selectedLocationId}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring card-bg"
              disabled={loading}
            >
              <option value="">
                {loading
                  ? "-- Loading Locations --"
                  : "-- Select a Location --"}
              </option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.locationName}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Location is required for clock-in, photo uploads, and job notes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
