import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { Clock, Camera, Briefcase, MapPin } from "lucide-react";

type DashboardStatsData = {
  clockStatus: string;
  isClockedIn: boolean;
  photosToday: number;
  assignedJobs: number;
  currentLocation: string;
};

export default function DashboardStats() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStatsData>({
    clockStatus: "Loading...",
    isClockedIn: false,
    photosToday: 0,
    assignedJobs: 0,
    currentLocation: "Not Selected",
  });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    async function loadStats() {
      if (!user?.uid) return;

      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Load locations for display
        try {
          const locationsQuery = query(
            collection(db, "locations"),
            where("status", "==", true),
            orderBy("locationName", "asc")
          );
          const locationsSnap = await getDocs(locationsQuery);
          const locationsMap: { [key: string]: string } = {};
          locationsSnap.forEach((doc) => {
            const data = doc.data() as any;
            locationsMap[doc.id] = data.locationName || "Unnamed Location";
          });
          setLocations(locationsMap);
        } catch (error) {
          console.warn("Error loading locations:", error);
        }

        // Get profileId
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as any;
          const pid = userData.profileId;
          setProfileId(pid);

          if (pid) {
            // Set up real-time clock status listener
            const clockQuery = query(
              collection(db, "employeeTimeTracking"),
              where("employeeProfileId", "==", pid),
              where("clockOutTime", "==", null),
              orderBy("clockInTime", "desc"),
              limit(1)
            );

            const clockUnsub = onSnapshot(
              clockQuery,
              async (snapshot) => {
                if (!snapshot.empty) {
                  const clockData = snapshot.docs[0].data() as any;
                  const clockInTime =
                    clockData.clockInTime?.toDate?.() || clockData.clockInTime;

                  // Get location name - try from time tracking first, then fetch from locations collection
                  let locationName = clockData.locationName;
                  if (!locationName && clockData.locationId) {
                    try {
                      const locationDoc = await getDoc(
                        doc(db, "locations", clockData.locationId)
                      );
                      if (locationDoc.exists()) {
                        const locationData = locationDoc.data() as any;
                        locationName =
                          locationData.locationName || "Unknown Location";
                      } else {
                        locationName = "Unknown Location";
                      }
                    } catch (error) {
                      console.warn("Error fetching location name:", error);
                      locationName = "Unknown Location";
                    }
                  }

                  const timeStr = clockInTime
                    ? clockInTime.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "";
                  setStats((prev) => ({
                    ...prev,
                    clockStatus: `Clocked In @ ${locationName} since ${timeStr}`,
                    isClockedIn: true,
                    currentLocation: locationName,
                  }));
                } else {
                  // When not clocked in, show saved location
                  const savedLocationId = localStorage.getItem(
                    "employee-selected-location"
                  );
                  const savedLocationName = savedLocationId
                    ? locations[savedLocationId]
                    : null;
                  setStats((prev) => ({
                    ...prev,
                    clockStatus: "Clocked Out",
                    isClockedIn: false,
                    currentLocation: savedLocationName || "Not Selected",
                  }));
                }
              },
              (error) => {
                console.warn("Error listening to clock status:", error);
                setStats((prev) => ({
                  ...prev,
                  clockStatus: "Clocked Out",
                  isClockedIn: false,
                }));
              }
            );

            // Set up real-time photos count listener
            const now = new Date();
            const todayStart = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              0,
              0,
              0,
              0
            );
            const todayEnd = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              23,
              59,
              59,
              999
            );

            const photosQuery = query(
              collection(db, "servicePhotos"),
              where("employeeProfileId", "==", pid),
              where("uploadedAt", ">=", Timestamp.fromDate(todayStart)),
              where("uploadedAt", "<=", Timestamp.fromDate(todayEnd))
            );

            const photosUnsub = onSnapshot(
              photosQuery,
              (snapshot) => {
                setStats((prev) => ({
                  ...prev,
                  photosToday: snapshot.size,
                }));
              },
              (error) => {
                console.warn("Error listening to photos count:", error);
              }
            );

            // Load assigned jobs count (not real-time for performance)
            try {
              const jobsQuery = query(
                collection(db, "serviceHistory"),
                where("assignedEmployees", "array-contains", pid),
                where("serviceDate", ">=", Timestamp.fromDate(todayStart)),
                orderBy("serviceDate", "asc")
              );
              const jobsSnap = await getDocs(jobsQuery);
              setStats((prev) => ({
                ...prev,
                assignedJobs: jobsSnap.size,
              }));
            } catch (error) {
              console.warn("Error counting assigned jobs:", error);
            }

            // Cleanup listeners on unmount
            return () => {
              clockUnsub();
              photosUnsub();
            };
          }
        }
      } catch (error) {
        console.error("Error loading dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    }

    const cleanup = loadStats();
    return () => {
      if (cleanup && typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [user?.uid, locations]);

  // Update location display when locations are loaded
  useEffect(() => {
    if (!stats.isClockedIn) {
      const savedLocationId = localStorage.getItem(
        "employee-selected-location"
      );
      const savedLocationName = savedLocationId
        ? locations[savedLocationId]
        : null;
      setStats((prev) => ({
        ...prev,
        currentLocation: savedLocationName || "Not Selected",
      }));
    }
  }, [locations, stats.isClockedIn]);

  const getClockIndicatorClass = () => {
    return stats.isClockedIn ? "bg-green-500" : "bg-red-500";
  };

  const cards = [
    {
      icon: Clock,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      label: "Clock Status",
      value: stats.clockStatus,
      indicator: (
        <div
          className={`h-2 w-2 rounded-full ${getClockIndicatorClass()}`}
        ></div>
      ),
    },
    {
      icon: Camera,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      label: "Photos Today",
      value: `${stats.photosToday} photos`,
    },
    {
      icon: Briefcase,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      label: "Assigned Jobs",
      value: `${stats.assignedJobs} jobs`,
    },
    {
      icon: MapPin,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      label: "Current Location",
      value: stats.currentLocation,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white dark:bg-zinc-800 border border-border rounded-lg shadow-sm p-6"
        >
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 ${card.iconBg} rounded-lg flex items-center justify-center`}
            >
              <card.icon className={`h-6 w-6 ${card.iconColor}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <div className="flex items-center gap-2">
                {card.indicator}
                <span className="font-semibold text-sm">{card.value}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
