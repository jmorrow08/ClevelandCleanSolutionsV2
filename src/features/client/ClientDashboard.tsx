import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig, makeDayBounds } from "../../services/firebase";
import { useSettings } from "../../context/SettingsContext";
import {
  getLocationName,
  getLocationNames,
  getEmployeeNames,
} from "../../services/queries/resolvers";

type RecentService = {
  id: string;
  serviceDate?: any;
  locationId?: string;
  locationName?: string;
  status?: string;
};

type Agreement = {
  id: string;
  frequency?: string;
  includedServices?: string[];
  paymentAmount?: number;
  paymentFrequency?: string;
  isActive?: boolean;
  agreementName?: string;
  serviceType?: string;
  locationId?: string;
  locationName?: string;
  contractStartDate?: Date;
  contractEndDate?: Date;
  renewalTerms?: string;
  serviceAgreementUrl?: string;
  specialInstructions?: string;
  serviceDays?: string[];
  scheduleDetails?: {
    serviceDays?: string[];
    monthlyDay?: number;
    oneTimeDate?: any;
  };
  paymentScheduleDetails?: {
    monthlyPaymentDay?: number;
    quarterlyMonth?: number;
    quarterlyDay?: number;
  };
};

// Generate a meaningful agreement name if none exists
function generateAgreementName(agreement: Agreement): string {
  if (agreement.agreementName) {
    return agreement.agreementName;
  }

  const frequencyMap: Record<string, string> = {
    weekly: "Weekly",
    "bi-weekly": "Bi-Weekly",
    monthly: "Monthly",
    "one-time": "One-Time",
  };

  const frequency =
    frequencyMap[agreement.frequency || ""] || agreement.frequency || "Regular";
  const serviceType = agreement.serviceType || "Cleaning";
  const locationName = agreement.locationName || "Service";

  return `${frequency} ${serviceType} - ${locationName}`;
}

export default function ClientDashboard() {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [nextService, setNextService] = useState<RecentService | null>(null);
  const [jobsCompleted, setJobsCompleted] = useState<number>(0);
  const [unpaidCount, setUnpaidCount] = useState<number>(0);
  const [totalOutstanding, setTotalOutstanding] = useState<number>(0);
  const [recent, setRecent] = useState<RecentService[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [clientName, setClientName] = useState<string>("Client");
  const [modal, setModal] = useState<
    | { type: "service"; job: RecentService }
    | { type: "agreement"; agreement: Agreement }
    | null
  >(null);

  useEffect(() => {
    async function load() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) {
          console.log("No authenticated user found");
          return setLoading(false);
        }

        console.log("User authenticated:", user.uid, user.email);
        const db = getFirestore();

        // Resolve profileId
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userDoc = (userSnap.data() as any) || {};
        const profileId = (userDoc?.profileId as string) || undefined;
        const email = user.email || "";

        console.log("User document:", userDoc);
        console.log("Profile ID:", profileId);
        console.log("Email:", email);

        if (!profileId) {
          console.log("No profile ID found for user");
          return setLoading(false);
        }

        // Welcome name
        try {
          const cSnap = await getDoc(doc(db, "clientMasterList", profileId));
          const c = (cSnap.data() as any) || {};
          console.log("Client document:", c);
          setClientName(c.contactName || c.companyName || "Client");
        } catch (error) {
          console.error("Error fetching client document:", error);
        }

        // Next service (future earliest)
        try {
          console.log("Querying next service for profileId:", profileId);
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(new Date())),
            orderBy("serviceDate", "asc"),
            limit(1)
          );
          const snap = await getDocs(q);
          console.log(
            "Next service query result:",
            snap.docs.length,
            "documents"
          );
          const d = snap.docs[0];
          if (d) {
            const serviceData = d.data() as any;
            console.log("Next service data:", serviceData);
            // Try to resolve location name
            let locationName =
              serviceData.locationName ||
              serviceData.name ||
              serviceData.location;
            if (!locationName && serviceData.locationId) {
              try {
                locationName = await getLocationName(serviceData.locationId);
              } catch (locError) {
                console.warn("Failed to resolve location name:", locError);
                locationName = serviceData.locationId
                  ? `Location ${serviceData.locationId.slice(0, 8)}...`
                  : "Unknown Location";
              }
            }
            setNextService({
              id: d.id,
              ...serviceData,
              locationName: locationName || "Unknown Location",
            });
          }
        } catch (e: any) {
          console.error("Client next service query failed:", e?.message, e);
        }

        // Jobs completed this month
        try {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          console.log("Querying jobs completed for profileId:", profileId);
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(startOfMonth)),
            where("serviceDate", "<", Timestamp.fromDate(endOfMonth)),
            orderBy("serviceDate", "asc")
          );
          const snap = await getDocs(q);
          console.log(
            "Jobs completed query result:",
            snap.docs.length,
            "documents"
          );
          const count = snap.docs.filter(
            (d) => (d.data() as any)?.status === "Completed"
          ).length;
          console.log("Jobs completed count:", count);
          setJobsCompleted(count);
        } catch (e: any) {
          console.error("Client jobs completed query failed:", e?.message, e);
        }

        // Payment status: unpaid invoices (still used for invoices page; dashboard hides this card)
        try {
          const invQ = query(
            collection(db, "invoices"),
            where("payeeEmail", "==", email),
            where("status", "==", "Unpaid")
          );
          const invSnap = await getDocs(invQ);
          let cnt = 0;
          let total = 0;
          invSnap.forEach((d) => {
            const v = d.data() as any;
            cnt += 1;
            total += Number(v?.totalAmount ?? v?.amount ?? 0) || 0;
          });
          setUnpaidCount(cnt);
          setTotalOutstanding(total);
        } catch (e: any) {
          console.warn("Client unpaid invoices may need index", e?.message);
        }

        // Most recent completed service
        try {
          console.log(
            "Querying most recent completed service for profileId:",
            profileId
          );
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("status", "==", "Completed"),
            orderBy("serviceDate", "desc"),
            limit(1)
          );
          const snap = await getDocs(q);
          console.log(
            "Most recent completed service query result:",
            snap.docs.length,
            "documents"
          );
          if (snap.docs.length > 0) {
            const d = snap.docs[0];
            const serviceData = d.data() as any;
            console.log("Most recent completed service data:", serviceData);
            // Try to resolve location name
            let locationName =
              serviceData.locationName ||
              serviceData.name ||
              serviceData.location;
            if (!locationName && serviceData.locationId) {
              try {
                locationName = await getLocationName(serviceData.locationId);
              } catch (locError) {
                console.warn(
                  "Failed to resolve location name for recent completed service:",
                  locError
                );
                locationName = serviceData.locationId
                  ? `Location ${serviceData.locationId.slice(0, 8)}...`
                  : "Unknown Location";
              }
            }
            const completedService = {
              id: d.id,
              ...serviceData,
              locationName: locationName || "Unknown Location",
            };
            console.log(
              "Most recent completed service processed:",
              completedService
            );
            setRecent([completedService]);
          } else {
            console.log("No completed services found");
            setRecent([]);
          }
        } catch (e: any) {
          console.error(
            "Client most recent completed service query failed:",
            e?.message,
            e
          );
          setRecent([]);
        }

        // Service agreements list (active) with location names resolved
        try {
          const q = query(
            collection(db, "serviceAgreements"),
            where("clientId", "==", profileId),
            where("isActive", "==", true)
          );
          const snap = await getDocs(q);
          const list: Agreement[] = [];

          // First, collect all agreements
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));

          // Filter out expired contracts
          const today = new Date();
          const activeAgreements = list.filter((agreement) => {
            if (!agreement.contractEndDate) {
              // If no end date, consider it active
              return true;
            }

            try {
              const endDate = agreement.contractEndDate
                ? typeof (agreement.contractEndDate as any).toDate ===
                  "function"
                  ? (agreement.contractEndDate as any).toDate()
                  : new Date(agreement.contractEndDate)
                : null;

              // Keep only contracts that haven't expired (end date is in the future or today)
              return endDate >= today;
            } catch (error) {
              console.warn(
                "Error parsing contract end date for agreement:",
                agreement.id,
                error
              );
              // If we can't parse the date, keep it to be safe
              return true;
            }
          });

          console.log(
            `Filtered out ${
              list.length - activeAgreements.length
            } expired agreements`
          );

          // Use agreements directly since we don't need to display location names
          const agreementsWithLocationNames = activeAgreements;

          // Custom sorting logic to prioritize specific agreements
          const sortedAgreements = agreementsWithLocationNames.sort((a, b) => {
            // Helper function to get agreement display name
            const getAgreementDisplayName = (agreement: Agreement) => {
              if (agreement.agreementName) {
                return agreement.agreementName.toLowerCase();
              }

              // Generate name from location and service type
              const locationName = agreement.locationName || "";
              const serviceType = agreement.serviceType || "Cleaning";
              return `${locationName} ${serviceType}`.toLowerCase();
            };

            const aName = getAgreementDisplayName(a);
            const bName = getAgreementDisplayName(b);

            // Priority order: "CPP - Main" first, then "CPP - Extra Office & Warehouse Space"
            if (aName.includes("cpp") && aName.includes("main")) return -1;
            if (bName.includes("cpp") && bName.includes("main")) return 1;
            if (aName.includes("cpp") && aName.includes("extra")) return -1;
            if (bName.includes("cpp") && bName.includes("extra")) return 1;

            // For other agreements, sort by contract start date (oldest first)
            const safeToMillis = (value: any) => {
              if (!value) return 0;
              try {
                if (value.toDate) return value.toDate().getTime();
                if (value.seconds) return value.seconds * 1000; // Firestore Timestamp-like
                const d = new Date(value);
                return isNaN(d.getTime()) ? 0 : d.getTime();
              } catch (_) {
                return 0;
              }
            };

            const aMillis = safeToMillis(a.contractStartDate);
            const bMillis = safeToMillis(b.contractStartDate);
            return aMillis - bMillis;
          });

          setAgreements(sortedAgreements);
        } catch (e: any) {
          console.warn("Client agreements read failed", e?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [settings?.billingTermsDays]);

  const cards = useMemo(
    () => [
      {
        label: "Next Service",
        value: nextService?.serviceDate?.toDate
          ? nextService.serviceDate.toDate().toLocaleString("en-US", {
              timeZone: "America/New_York",
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "No upcoming service",
        hint: nextService?.locationName
          ? `@ ${nextService.locationName}`
          : undefined,
      },
      {
        label: "Payment Status",
        value:
          totalOutstanding > 0
            ? `$${totalOutstanding.toLocaleString()}`
            : "All paid",
        hint: unpaidCount > 0 ? `${unpaidCount} unpaid` : undefined,
      },
      {
        label: "Jobs Completed",
        value: String(jobsCompleted),
        hint: "This month",
      },
    ],
    [nextService, totalOutstanding, unpaidCount, jobsCompleted]
  );

  return (
    <div className="space-y-6">
      <div className="text-2xl font-semibold">Welcome, {clientName}!</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg p-4 card-bg shadow-elev-1">
            <div className="text-xs uppercase text-zinc-500">{c.label}</div>
            <div className="text-xl font-semibold mt-1">
              {loading ? "…" : c.value}
            </div>
            {c.hint ? (
              <div className="text-xs text-zinc-500 mt-1">{c.hint}</div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="font-medium">Most Recent Completed Job</div>
          {loading ? (
            <div className="text-sm text-zinc-500 mt-2">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-zinc-500 mt-2">
              No completed jobs yet
            </div>
          ) : (
            <div className="mt-2 text-sm">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="p-3 rounded-md border border-zinc-200 dark:border-zinc-700"
                >
                  <div className="font-medium">
                    {r.serviceDate?.toDate
                      ? r.serviceDate.toDate().toLocaleDateString("en-US", {
                          timeZone: "America/New_York",
                        })
                      : "—"}
                  </div>
                  <div className="text-zinc-600 dark:text-zinc-400 mt-1">
                    {r.locationName || "Unknown Location"}
                  </div>
                  {(r as any).serviceType && (
                    <div className="text-xs text-zinc-500 mt-1">
                      {(r as any).serviceType}
                    </div>
                  )}
                  <div className="mt-3">
                    <button
                      className="px-3 py-1.5 text-xs rounded-md border bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => setModal({ type: "service", job: r })}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="font-medium">Service Agreement Summary</div>
          {loading ? (
            <div className="text-sm text-zinc-500 mt-2">Loading…</div>
          ) : agreements.length === 0 ? (
            <div className="text-sm text-zinc-500 mt-2">
              No active agreements
            </div>
          ) : (
            <ul className="mt-2 text-sm space-y-2">
              {agreements.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-700 p-2"
                >
                  <div className="font-medium">{generateAgreementName(a)}</div>
                  <button
                    className="px-2 py-1 text-xs rounded-md border"
                    onClick={() =>
                      setModal({ type: "agreement", agreement: a })
                    }
                  >
                    See summary
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modal?.type === "service" && (
        <ServiceDetailsModal job={modal.job} onClose={() => setModal(null)} />
      )}
      {modal?.type === "agreement" && (
        <AgreementModal
          agreement={modal.agreement}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function ServiceDetailsModal({
  job,
  onClose,
}: {
  job: RecentService;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<
    Array<{ id: string; photoUrl?: string; uploadedAt?: any }>
  >([]);
  const [locationNameResolved, setLocationNameResolved] = useState<string>("");
  const [assignedNames, setAssignedNames] = useState<string[]>([]);
  const [adminNote, setAdminNote] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [name] = await getLocationNames([(job as any).locationId]);
      setLocationNameResolved(
        name ||
          (job as any).locationName ||
          ((job as any).locationId
            ? `Location ${(job as any).locationId.slice(0, 8)}...`
            : "—")
      );
      // Resolve staff names with client-safe precedence:
      // 1) employeeDisplayNames (preferred)
      // 2) employeeAssignments[].name (legacy)
      // 3) assignedEmployees (IDs) → resolver lookup
      const displayNames = Array.isArray((job as any).employeeDisplayNames)
        ? ((job as any).employeeDisplayNames as string[]).filter(Boolean)
        : [];
      const assignmentNames = Array.isArray((job as any).employeeAssignments)
        ? ((job as any).employeeAssignments as any[])
            .map((a) => a?.name || a?.employeeName || a?.uid || "")
            .filter((v: string) => typeof v === "string" && !!v)
        : [];
      if (displayNames.length) {
        setAssignedNames(Array.from(new Set(displayNames)));
      } else if (assignmentNames.length) {
        setAssignedNames(Array.from(new Set(assignmentNames)));
      } else {
        const assignedIds = Array.isArray((job as any).assignedEmployees)
          ? ((job as any).assignedEmployees as string[])
          : [];
        try {
          const names = assignedIds.length
            ? await getEmployeeNames(assignedIds)
            : [];
          setAssignedNames(names.filter(Boolean));
        } catch {
          setAssignedNames([]);
        }
      }
      // Prefer top-level adminNotes on the job; else fetch the latest admin job note
      const jAdmin = (job as any).adminNotes as string | undefined;
      if (jAdmin && jAdmin.trim()) {
        setAdminNote(jAdmin.trim());
      } else {
        try {
          if (!getApps().length) initializeApp(firebaseConfig);
          const db = getFirestore();
          const nq = query(
            collection(db, "jobNotes"),
            where("jobId", "==", job.id),
            where("authorRole", "==", "admin"),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const ns = await getDocs(nq);
          const doc0 = ns.docs[0];
          const data: any = doc0 ? doc0.data() : null;
          setAdminNote((data?.message as string) || "");
        } catch {
          setAdminNote("");
        }
      }
    })();
  }, [job]);

  useEffect(() => {
    async function loadPhotos() {
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const svcDate: Date | null = job.serviceDate?.toDate
          ? job.serviceDate.toDate()
          : null;
        const { start, end } = makeDayBounds(
          svcDate || new Date(),
          "America/New_York"
        );
        const qref = query(
          collection(db, "servicePhotos"),
          where("locationId", "==", (job as any).locationId || ""),
          where("uploadedAt", ">=", Timestamp.fromDate(start)),
          where("uploadedAt", "<=", Timestamp.fromDate(end)),
          where("isClientVisible", "==", true),
          orderBy("uploadedAt", "desc")
        );
        const snap = await getDocs(qref);
        const list: Array<{ id: string; photoUrl?: string; uploadedAt?: any }> =
          [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setPhotos(list);
      } catch (e: any) {
        console.warn("Client photos query may require index", e?.message);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    }
    loadPhotos();
  }, [job.id]);

  const dt = job.serviceDate?.toDate ? job.serviceDate.toDate() : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="card-bg border border-[var(--border)] rounded-lg shadow-elev-2 max-w-4xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Completed Job Details</div>
          <button
            className="px-2 py-1 text-sm rounded-md border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="text-sm text-zinc-500 mt-1">
          {dt
            ? dt.toLocaleString("en-US", { timeZone: "America/New_York" })
            : "—"}
        </div>

        {/* Overview cards */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-1">Location</div>
            <div className="text-sm">
              {locationNameResolved || (job as any).locationId || "—"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-1">Staff Assigned</div>
            <div className="text-sm">
              {assignedNames.length ? assignedNames.join(", ") : "—"}
            </div>
          </div>
        </div>

        {/* Service Type */}
        {(job as any).serviceType && (
          <div className="mt-3 rounded-md border p-3">
            <div className="text-sm font-medium mb-1">Service Type</div>
            <div className="text-sm">{(job as any).serviceType}</div>
          </div>
        )}

        {/* Photos */}
        <div className="mt-4">
          <div className="text-sm font-medium">Photos</div>
          <div className="text-xs text-zinc-500">Available Images</div>
          <div className="mt-2">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : photos.length === 0 ? (
              <div className="text-sm text-zinc-500">
                No photos for this service.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                  <div>
                    {photos.length} photo{photos.length === 1 ? "" : "s"}
                  </div>
                  {photos.length > 6 ? <div>Scroll for more photos</div> : null}
                </div>
                <div className="rounded-md border p-2 max-h-[360px] overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {photos.map((p) => (
                      <a
                        key={p.id}
                        href={p.photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={p.photoUrl}
                          alt="Service photo"
                          className="w-full h-32 object-cover rounded-md"
                        />
                        <div className="mt-1 text-[10px] text-zinc-500">
                          {p.uploadedAt?.toDate
                            ? p.uploadedAt.toDate().toLocaleString()
                            : ""}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Admin Notes */}
        <div className="mt-4">
          <div className="text-sm font-medium">Admin Notes</div>
          <div className="mt-2 rounded-md border p-3 text-sm bg-[var(--muted)]">
            {adminNote ? adminNote : "No notes provided"}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgreementModal({
  agreement,
  onClose,
}: {
  agreement: Agreement;
  onClose: () => void;
}) {
  // Helper function to format dates
  const formatDate = (date: any) => {
    if (!date) return "—";
    try {
      const d = date?.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  // Helper function to format payment schedule
  const formatPaymentSchedule = () => {
    if (!agreement.paymentScheduleDetails) return null;

    const { monthlyPaymentDay, quarterlyMonth, quarterlyDay } =
      agreement.paymentScheduleDetails;

    if (agreement.paymentFrequency === "monthly" && monthlyPaymentDay) {
      const suffix =
        monthlyPaymentDay === 1
          ? "st"
          : monthlyPaymentDay === 2
          ? "nd"
          : monthlyPaymentDay === 3
          ? "rd"
          : "th";
      return `${monthlyPaymentDay}${suffix} of each month`;
    }

    if (
      agreement.paymentFrequency === "quarterly" &&
      quarterlyMonth &&
      quarterlyDay
    ) {
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const suffix =
        quarterlyDay === 1
          ? "st"
          : quarterlyDay === 2
          ? "nd"
          : quarterlyDay === 3
          ? "rd"
          : "th";
      return `${
        monthNames[quarterlyMonth - 1]
      } ${quarterlyDay}${suffix} each quarter`;
    }

    return null;
  };

  // Helper function to format service days
  const formatServiceDays = () => {
    const serviceDays =
      agreement.serviceDays || agreement.scheduleDetails?.serviceDays;
    if (Array.isArray(serviceDays) && serviceDays.length > 0) {
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      return serviceDays
        .map((day) => {
          const dayIndex = parseInt(day);
          return isNaN(dayIndex) ? day : dayNames[dayIndex] || day;
        })
        .join(", ");
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="card-bg border border-[var(--border)] rounded-lg shadow-elev-2 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="text-xl font-semibold">
            {generateAgreementName(agreement)}
          </div>
          <button
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-zinc-100 dark:hover:bg-zinc-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Basic Information */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3 text-zinc-800 dark:text-zinc-200">
            Basic Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Service Type
              </div>
              <div className="text-base text-zinc-900 dark:text-zinc-200">
                {agreement.serviceType || "Cleaning Service"}
              </div>
            </div>
            <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Frequency
              </div>
              <div className="text-base capitalize text-zinc-900 dark:text-zinc-200">
                {agreement.frequency || "—"}
              </div>
            </div>
            <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Status
              </div>
              <div className="text-base">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    agreement.isActive
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                  }`}
                >
                  {agreement.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            {agreement.locationName && (
              <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Location
                </div>
                <div className="text-base text-zinc-900 dark:text-zinc-200">
                  {agreement.locationName}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Details */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3 text-zinc-800 dark:text-zinc-200">
            Schedule Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formatServiceDays() && (
              <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Service Days
                </div>
                <div className="text-base text-zinc-900 dark:text-zinc-200">
                  {formatServiceDays()}
                </div>
              </div>
            )}
            {agreement.scheduleDetails?.monthlyDay &&
              agreement.frequency === "monthly" && (
                <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                  <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Monthly Service Day
                  </div>
                  <div className="text-base text-zinc-900 dark:text-zinc-200">
                    {agreement.scheduleDetails.monthlyDay}
                    {agreement.scheduleDetails.monthlyDay === 1
                      ? "st"
                      : agreement.scheduleDetails.monthlyDay === 2
                      ? "nd"
                      : agreement.scheduleDetails.monthlyDay === 3
                      ? "rd"
                      : "th"}{" "}
                    of each month
                  </div>
                </div>
              )}
            {agreement.contractStartDate && (
              <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Contract Start Date
                </div>
                <div className="text-base text-zinc-900 dark:text-zinc-200">
                  {formatDate(agreement.contractStartDate)}
                </div>
              </div>
            )}
            {agreement.contractEndDate && (
              <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Contract End Date
                </div>
                <div className="text-base text-zinc-900 dark:text-zinc-200">
                  {formatDate(agreement.contractEndDate)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Information */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3 text-zinc-800 dark:text-zinc-200">
            Payment Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Payment Amount
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-200">
                {agreement.paymentAmount
                  ? `$${Number(agreement.paymentAmount).toLocaleString()}`
                  : "—"}
              </div>
            </div>
            <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Payment Frequency
              </div>
              <div className="text-base capitalize text-zinc-900 dark:text-zinc-200">
                {agreement.paymentFrequency || "—"}
              </div>
            </div>
            {formatPaymentSchedule() && (
              <div className="card-bg border border-[var(--border)] p-4 rounded-lg md:col-span-2">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Payment Schedule
                </div>
                <div className="text-base text-zinc-900 dark:text-zinc-200">
                  {formatPaymentSchedule()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Services */}
        {Array.isArray(agreement.includedServices) &&
          agreement.includedServices.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-zinc-800 dark:text-zinc-200">
                Included Services
              </h3>
              <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                <div className="flex flex-wrap gap-2">
                  {agreement.includedServices.map((service, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                    >
                      {service}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

        {/* Additional Details */}
        {(agreement.specialInstructions ||
          agreement.renewalTerms ||
          agreement.serviceAgreementUrl) && (
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-zinc-800 dark:text-zinc-200">
              Additional Details
            </h3>
            <div className="space-y-4">
              {agreement.specialInstructions && (
                <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                  <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                    Special Instructions
                  </div>
                  <div className="text-base whitespace-pre-wrap text-zinc-900 dark:text-zinc-200">
                    {agreement.specialInstructions}
                  </div>
                </div>
              )}
              {agreement.renewalTerms && (
                <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                  <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                    Renewal Terms
                  </div>
                  <div className="text-base capitalize text-zinc-900 dark:text-zinc-200">
                    {agreement.renewalTerms}
                  </div>
                </div>
              )}
              {agreement.serviceAgreementUrl && (
                <div className="card-bg border border-[var(--border)] p-4 rounded-lg">
                  <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                    Service Agreement Document
                  </div>
                  <div className="text-base">
                    <a
                      href={agreement.serviceAgreementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      View Agreement PDF
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
