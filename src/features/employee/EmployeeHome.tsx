import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import {
  Clock,
  Camera,
  Briefcase,
  MapPin,
  Upload,
  StickyNote,
  DollarSign,
} from "lucide-react";
import { Link } from "react-router-dom";
import DashboardStats from "./DashboardStats";
import QuickActions from "./QuickActions";
import TodaysJobs from "./TodaysJobs";

export default function EmployeeHome() {
  const { user } = useAuth();
  const [employeeName, setEmployeeName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEmployeeInfo() {
      if (!user?.uid) return;

      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Get user document to find profileId
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as any;
          const profileId = userData.profileId;

          if (profileId) {
            // Get employee profile
            const employeeDoc = await getDoc(
              doc(db, "employeeMasterList", profileId)
            );
            if (employeeDoc.exists()) {
              const employeeData = employeeDoc.data() as any;
              const name =
                employeeData.fullName ||
                employeeData.firstName + " " + employeeData.lastName ||
                user.displayName ||
                user.email ||
                "Employee";
              setEmployeeName(name);
            } else {
              // Fallback to user display name
              setEmployeeName(user.displayName || user.email || "Employee");
            }
          } else {
            setEmployeeName(user.displayName || user.email || "Employee");
          }
        } else {
          setEmployeeName(user.displayName || user.email || "Employee");
        }
      } catch (error) {
        console.error("Error loading employee info:", error);
        setEmployeeName(user.displayName || user.email || "Employee");
      } finally {
        setLoading(false);
      }
    }

    loadEmployeeInfo();
  }, [user]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Message */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {employeeName}!
        </h1>
        <p className="text-muted-foreground">
          Cleveland Clean Solutions Employee Portal
        </p>
      </div>

      {/* Dashboard Stats */}
      <DashboardStats />

      {/* Today's Jobs Section */}
      <div className="bg-white dark:bg-zinc-800 border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Today's Jobs</h2>
          <TodaysJobs />
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}
