import { useState, useEffect } from "react";
import { format } from "date-fns";
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
import { getTodayBounds, toFirestoreTimestamp } from "../../utils/timezone";
import {
  getClientNames,
  getLocationNames,
  getEmployeeNames,
} from "../../services/queries/resolvers";
import { X, Calendar, Clock, MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";

interface Job {
  id: string;
  clientProfileId?: string;
  locationId?: string;
  serviceDate?: any;
  assignedEmployees?: string[];
  employeeAssignments?: Array<{ uid?: string; name?: string }>;
  employeeDisplayNames?: string[];
  status?: string;
  locationName?: string;
  clientName?: string;
  employeeNames?: string[];
}

interface JobsTodayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function extractNames(job: Job): string[] {
  if (
    Array.isArray(job.employeeDisplayNames) &&
    job.employeeDisplayNames.length
  )
    return job.employeeDisplayNames;
  if (Array.isArray(job.employeeAssignments) && job.employeeAssignments.length)
    return job.employeeAssignments
      .map((a) => a?.name || a?.uid || "")
      .filter(Boolean);
  if (Array.isArray(job.assignedEmployees)) return job.assignedEmployees;
  return [];
}

export default function JobsTodayModal({
  isOpen,
  onClose,
}: JobsTodayModalProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadJobs();
    }
  }, [isOpen]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const bounds = getTodayBounds();

      const q = query(
        collection(db, "serviceHistory"),
        where("serviceDate", ">=", toFirestoreTimestamp(bounds.start)),
        where("serviceDate", "<", toFirestoreTimestamp(bounds.end)),
        orderBy("serviceDate", "asc")
      );

      const snap = await getDocs(q);
      const jobsList: Job[] = [];

      snap.forEach((d) => {
        jobsList.push({ id: d.id, ...(d.data() as any) });
      });

      // Resolve names for all jobs
      const resolvedJobs = await resolveJobNames(jobsList);
      setJobs(resolvedJobs);
    } catch (err: any) {
      console.error("Error loading today's jobs:", err);
      setError(err?.message || "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  const resolveJobNames = async (jobsList: Job[]): Promise<Job[]> => {
    try {
      // Get unique IDs
      const locationIds = Array.from(
        new Set(
          jobsList
            .map((j) => j.locationId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );

      const clientIds = Array.from(
        new Set(
          jobsList
            .map((j) => j.clientProfileId)
            .filter((v): v is string => typeof v === "string" && !!v)
        )
      );

      // Resolve names in parallel
      const [locationNames, clientNames] = await Promise.all([
        locationIds.length
          ? getLocationNames(locationIds)
          : Promise.resolve([]),
        clientIds.length ? getClientNames(clientIds) : Promise.resolve([]),
      ]);

      // Create lookup maps
      const locationNameMap: Record<string, string> = {};
      locationIds.forEach((id, i) => {
        locationNameMap[id] = locationNames[i] || id;
      });

      const clientNameMap: Record<string, string> = {};
      clientIds.forEach((id, i) => {
        clientNameMap[id] = clientNames[i] || id;
      });

      // Resolve employee names for jobs that need it
      const jobsWithEmployees = jobsList.filter(
        (j) =>
          extractNames(j).length === 0 &&
          Array.isArray(j.assignedEmployees) &&
          j.assignedEmployees.length
      );

      const employeeNamePromises = jobsWithEmployees.map(async (j) => {
        const names = await getEmployeeNames(j.assignedEmployees!);
        return { jobId: j.id, names };
      });

      const employeeResults = await Promise.all(employeeNamePromises);
      const employeeNameMap: Record<string, string[]> = {};
      employeeResults.forEach(({ jobId, names }) => {
        employeeNameMap[jobId] = names;
      });

      // Return jobs with resolved names
      return jobsList.map((job) => ({
        ...job,
        locationName: job.locationId
          ? locationNameMap[job.locationId]
          : undefined,
        clientName: job.clientProfileId
          ? clientNameMap[job.clientProfileId]
          : undefined,
        employeeNames:
          extractNames(job).length > 0
            ? extractNames(job)
            : employeeNameMap[job.id] || [],
      }));
    } catch (err) {
      console.error("Error resolving job names:", err);
      return jobsList;
    }
  };

  const formatJobTime = (serviceDate: any): string => {
    if (!serviceDate) return "No time specified";

    let date: Date;
    if (serviceDate.toDate) {
      date = serviceDate.toDate();
    } else if (serviceDate instanceof Date) {
      date = serviceDate;
    } else if (serviceDate.seconds) {
      date = new Date(serviceDate.seconds * 1000);
    } else {
      date = new Date(serviceDate);
    }

    return format(date, "h:mm a");
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
      case "in progress":
        return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20";
      case "scheduled":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card-bg rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Today's Jobs
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {format(new Date(), "EEEE, MMMM d, yyyy")} • {jobs.length} job
                {jobs.length !== 1 ? "s" : ""} scheduled
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">
                  Loading today's jobs...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">{error}</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No jobs scheduled for today
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Jobs List */}
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-[var(--muted)] rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Job Title and Location */}
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 dark:text-white truncate">
                              {job.locationName ||
                                job.clientName ||
                                "Unknown Location"}
                            </h3>
                            {job.locationName && job.clientName && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {job.clientName}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Time and Status */}
                        <div className="flex items-center gap-4 mb-2">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {formatJobTime(job.serviceDate)}
                            </span>
                          </div>
                          {job.status && (
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                                job.status
                              )}`}
                            >
                              {job.status}
                            </span>
                          )}
                        </div>

                        {/* Assigned Employees */}
                        {job.employeeNames && job.employeeNames.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {job.employeeNames.join(", ")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* View Job Button */}
                      <div className="ml-4 flex-shrink-0">
                        <Link
                          to={`/service-history/${job.id}`}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          View Job
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
