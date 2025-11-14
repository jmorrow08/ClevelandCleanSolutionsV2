import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { format } from "date-fns";

type Agreement = {
  id: string;
  clientId?: string;
  serviceType?: string;
  frequency?: string;
  includedServices?: string[];
  paymentAmount?: number;
  paymentFrequency?: string;
  contractStartDate?: Date;
  contractEndDate?: Date;
  serviceAgreementUrl?: string;
  specialInstructions?: string;
  isActive?: boolean;
  agreementName?: string;
  locationId?: string;
  locationName?: string;
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

export default function Agreements() {
  const { profileId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<Agreement[]>([]);

  useEffect(() => {
    async function load() {
      try {
        if (!profileId) {
          setAgreements([]);
          return;
        }
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
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
              ? typeof (agreement.contractEndDate as any).toDate === "function"
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
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    load();
  }, [profileId]);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : agreements.length === 0 ? (
        <div className="text-sm text-zinc-500">No active agreements.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agreements.map((a) => (
            <AgreementCard key={a.id} agreement={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgreementCard({ agreement }: { agreement: Agreement }) {
  const title = generateAgreementName(agreement);
  const start = agreement.contractStartDate
    ? typeof (agreement.contractStartDate as any).toDate === "function"
      ? (agreement.contractStartDate as any).toDate()
      : new Date(agreement.contractStartDate)
    : null;
  const end = agreement.contractEndDate
    ? typeof (agreement.contractEndDate as any).toDate === "function"
      ? (agreement.contractEndDate as any).toDate()
      : new Date(agreement.contractEndDate)
    : null;
  const term =
    start && end
      ? `${format(start, "MMM d, yyyy")} → ${format(end, "MMM d, yyyy")}`
      : start
      ? `${format(start, "MMM d, yyyy")} →`
      : end
      ? `→ ${format(end, "MMM d, yyyy")}`
      : "";
  const services = Array.isArray(agreement.includedServices)
    ? agreement.includedServices.map((s) => s.replace(/-/g, " ")).join(", ")
    : "";

  // Format service days
  const serviceDays =
    agreement.serviceDays || agreement.scheduleDetails?.serviceDays;
  const formattedServiceDays =
    Array.isArray(serviceDays) && serviceDays.length > 0
      ? serviceDays
          .map((day) => day.charAt(0).toUpperCase() + day.slice(1))
          .join(", ")
      : null;

  // Format payment information
  let payment = "";
  if (agreement.paymentAmount != null) {
    payment = `$${Number(agreement.paymentAmount).toLocaleString()}`;
    if (agreement.paymentFrequency) {
      payment += `/${agreement.paymentFrequency}`;
    }

    // Add payment schedule details
    if (
      agreement.paymentFrequency === "monthly" &&
      agreement.paymentScheduleDetails?.monthlyPaymentDay
    ) {
      payment += ` (on the ${
        agreement.paymentScheduleDetails.monthlyPaymentDay
      }${
        agreement.paymentScheduleDetails.monthlyPaymentDay === 1
          ? "st"
          : agreement.paymentScheduleDetails.monthlyPaymentDay === 2
          ? "nd"
          : agreement.paymentScheduleDetails.monthlyPaymentDay === 3
          ? "rd"
          : "th"
      })`;
    } else if (
      agreement.paymentFrequency === "quarterly" &&
      agreement.paymentScheduleDetails?.quarterlyMonth &&
      agreement.paymentScheduleDetails?.quarterlyDay
    ) {
      const monthNames = [
        "",
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
      const monthName =
        monthNames[agreement.paymentScheduleDetails.quarterlyMonth] || "";
      const day = agreement.paymentScheduleDetails.quarterlyDay;
      payment += ` (${monthName} ${day}${
        day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"
      })`;
    }
  }

  return (
    <div className="rounded-lg p-3 card-bg shadow-elev-1">
      <div className="flex items-start justify-between">
        <div className="font-medium">{title}</div>
        {agreement.serviceAgreementUrl ? (
          <a
            href={agreement.serviceAgreementUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 underline"
          >
            View PDF
          </a>
        ) : null}
      </div>
      {term && <div className="text-sm text-zinc-500 mt-0.5">Term: {term}</div>}
      <div className="text-sm mt-2 space-y-1">
        <div>
          <span className="text-zinc-500">Frequency:</span>{" "}
          {agreement.frequency || "—"}
        </div>
        {/* Service Days with Check Marks */}
        {formattedServiceDays && (
          <div>
            <span className="text-zinc-500">Service Days:</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {[
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
              ].map((day) => {
                const serviceDays =
                  agreement.serviceDays ||
                  agreement.scheduleDetails?.serviceDays ||
                  [];
                const isSelected =
                  Array.isArray(serviceDays) && serviceDays.includes(day);
                return (
                  <div key={day} className="flex items-center gap-1">
                    <div
                      className={`w-3 h-3 rounded-full flex items-center justify-center text-xs ${
                        isSelected
                          ? "bg-green-500 text-white"
                          : "bg-zinc-200 dark:bg-zinc-600 text-zinc-400"
                      }`}
                    >
                      {isSelected && "✓"}
                    </div>
                    <span
                      className={`text-xs capitalize ${
                        isSelected
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-400"
                      }`}
                    >
                      {day.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {agreement.frequency === "monthly" &&
          agreement.scheduleDetails?.monthlyDay && (
            <div>
              <span className="text-zinc-500">Service Day:</span>{" "}
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
          )}
        <div>
          <span className="text-zinc-500">Included:</span> {services || "—"}
        </div>
      </div>
      {agreement.specialInstructions ? (
        <details className="mt-2">
          <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer">
            Special instructions
          </summary>
          <div className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-wrap">
            {agreement.specialInstructions}
          </div>
        </details>
      ) : null}
    </div>
  );
}
