import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../../services/firebase";
import {
  getClientNames,
  getLocationNames,
  getEmployeeNames,
} from "../../../services/queries/resolvers";
import { deriveAdminStatus } from "../../../services/statusMap";
import { Clock, ArrowRight } from "lucide-react";
import JobModal from "../../../components/ui/JobModal";

type Job = {
  id: string;
  status?: string;
  statusV2?: string;
  serviceDate?: Timestamp;
  clientProfileId?: string;
  locationId?: string;
  assignedEmployees?: string[];
  createdAt?: Timestamp;
};

type ProcessedJob = {
  id: string;
  clientName: string;
  locationName: string;
  assignedEmployeeNames: string[];
  assignedEmployeesCount: number;
  serviceDate: Date | null;
  status: string;
  daysInProgress: number;
  hoursInProgress: number;
};

export default function JobsNeedingCompletion() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ProcessedJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalJobIndex, setModalJobIndex] = useState(0);

  useEffect(() => {
    async function loadJobsNeedingCompletion() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Query for jobs that are in progress
        // We need to get jobs with status "In Progress", "Pending Approval", or statusV2 = "in_progress"
        // Since Firestore doesn't support OR queries well with compound filters, we'll get a broader set and filter in code
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        ); // Last 30 days

        const q = query(
          collection(db, "serviceHistory"),
          where("serviceDate", ">=", Timestamp.fromDate(thirtyDaysAgo)),
          orderBy("serviceDate", "asc") // Oldest first so we can identify longest-running jobs
          // limit(50) - removed limit to get all potential jobs
        );

        const snap = await getDocs(q);
        const allJobs: Job[] = [];
        snap.forEach((doc) => {
          allJobs.push({ id: doc.id, ...doc.data() } as Job);
        });

        // Filter for jobs that are actually in progress
        const inProgressJobs = allJobs.filter((job) => {
          const adminStatus = deriveAdminStatus({
            status: job.status,
            serviceDate: job.serviceDate,
            payrollProcessed: false, // We don't care about payroll for this filter
            qaApproved: false,
          });

          return adminStatus.primary === "in_progress";
        });

        if (inProgressJobs.length === 0) {
          setJobs([]);
          setLoading(false);
          return;
        }

        // Sort by service date (oldest first = longest in progress)
        inProgressJobs.sort((a, b) => {
          const dateA = a.serviceDate?.toDate()?.getTime() || 0;
          const dateB = b.serviceDate?.toDate()?.getTime() || 0;
          return dateA - dateB;
        });

        // Get unique IDs for batch fetching
        const clientIds = Array.from(
          new Set(inProgressJobs.map((j) => j.clientProfileId).filter(Boolean))
        );
        const locationIds = Array.from(
          new Set(inProgressJobs.map((j) => j.locationId).filter(Boolean))
        );
        const allEmployeeIds = Array.from(
          new Set(
            inProgressJobs
              .flatMap((j) => j.assignedEmployees || [])
              .filter(Boolean)
          )
        );

        // Fetch names in parallel
        const [clientNames, locationNames, employeeNames] = await Promise.all([
          getClientNames(clientIds),
          getLocationNames(locationIds),
          getEmployeeNames(allEmployeeIds),
        ]);

        // Create lookup maps
        const clientNameMap = new Map(
          clientIds.map((id, i) => [id, clientNames[i] || "Unknown Client"])
        );
        const locationNameMap = new Map(
          locationIds.map((id, i) => [
            id,
            locationNames[i] || "Unknown Location",
          ])
        );
        const employeeNameMap = new Map(
          allEmployeeIds.map((id, i) => [
            id,
            employeeNames[i] || "Unknown Employee",
          ])
        );

        // Process jobs
        const processed: ProcessedJob[] = inProgressJobs.map((job) => {
          const serviceDate = job.serviceDate?.toDate() || null;
          const now = new Date();

          // Calculate days/hours in progress
          let daysInProgress = 0;
          let hoursInProgress = 0;
          if (serviceDate) {
            const diffMs = now.getTime() - serviceDate.getTime();
            daysInProgress = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            hoursInProgress = Math.floor(
              (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
            );
          }

          // Get assigned employee names
          const assignedEmployeeNames = (job.assignedEmployees || [])
            .map((empId) => employeeNameMap.get(empId) || "Unknown Employee")
            .slice(0, 3); // Limit to 3 names for display

          return {
            id: job.id,
            clientName:
              clientNameMap.get(job.clientProfileId || "") || "Unknown Client",
            locationName:
              locationNameMap.get(job.locationId || "") || "Unknown Location",
            assignedEmployeeNames,
            assignedEmployeesCount: job.assignedEmployees?.length || 0,
            serviceDate,
            status: job.status || "In Progress",
            daysInProgress,
            hoursInProgress,
          };
        });

        setJobs(processed);
      } catch (e: any) {
        console.error("Error loading jobs needing completion:", e);
        setError(e?.message || "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    }

    loadJobsNeedingCompletion();

    // Auto-refresh every 5 minutes for job status updates
    const interval = setInterval(loadJobsNeedingCompletion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const nextJob = () => {
    if (jobs.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % jobs.length);
    }
  };

  const openJobModal = (jobIndex: number) => {
    setModalJobIndex(jobIndex);
    setModalOpen(true);
  };

  const closeJobModal = () => {
    setModalOpen(false);
  };

  const handleModalIndexChange = (newIndex: number) => {
    setModalJobIndex(newIndex);
  };

  const formatTimeInProgress = (days: number, hours: number): string => {
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  const currentJob = jobs[currentIndex];

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">Jobs Needing Completion</div>
        {jobs.length > 1 && (
          <button
            onClick={nextJob}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors"
          >
            Next Job
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading jobs...</div>
      ) : error ? (
        <div className="text-sm text-red-500">Error: {error}</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-sm text-zinc-500 mb-2">All caught up!</div>
          <div className="text-xs text-zinc-400">
            No jobs currently in progress
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Current Job Display */}
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {formatTimeInProgress(
                      currentJob.daysInProgress,
                      currentJob.hoursInProgress
                    )}{" "}
                    in progress
                  </span>
                </div>
                <h3
                  className="font-medium text-sm truncate"
                  title={currentJob.locationName}
                >
                  {currentJob.locationName}
                </h3>
                <p
                  className="text-xs text-zinc-600 dark:text-zinc-400 truncate"
                  title={currentJob.clientName}
                >
                  {currentJob.clientName}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-500">
                  {currentJob.serviceDate?.toLocaleDateString()}
                </div>
                <div className="text-xs text-zinc-500">
                  {currentJob.serviceDate?.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                {currentJob.assignedEmployeeNames.length > 0 && (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    Assigned: {currentJob.assignedEmployeeNames.join(", ")}
                    {currentJob.assignedEmployeeNames.length <
                      currentJob.assignedEmployeesCount && " + more"}
                  </div>
                )}
              </div>
              <button
                onClick={() => openJobModal(currentIndex)}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                View Job
              </button>
            </div>
          </div>

          {/* Job Counter */}
          {jobs.length > 1 && (
            <div className="text-center">
              <div className="text-xs text-zinc-500">
                {currentIndex + 1} of {jobs.length} jobs
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-zinc-400 text-center">
        Auto-refreshes every 5 minutes
      </div>

      {/* Job Modal */}
      <JobModal
        isOpen={modalOpen}
        onClose={closeJobModal}
        jobs={jobs}
        currentIndex={modalJobIndex}
        onIndexChange={handleModalIndexChange}
      />
    </div>
  );
}
