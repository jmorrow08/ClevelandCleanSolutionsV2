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
  contractStartDate?: any;
  contractEndDate?: any;
  serviceAgreementUrl?: string;
  specialInstructions?: string;
  isActive?: boolean;
  agreementName?: string;
  locationId?: string;
  locationName?: string;
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
            const endDate = agreement.contractEndDate.toDate
              ? agreement.contractEndDate.toDate()
              : new Date(agreement.contractEndDate);

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
  const start = agreement.contractStartDate?.toDate
    ? (agreement.contractStartDate.toDate() as Date)
    : undefined;
  const end = agreement.contractEndDate?.toDate
    ? (agreement.contractEndDate.toDate() as Date)
    : undefined;
  const term =
    start && end
      ? `${format(start, "MMM d, yyyy")} → ${format(end, "MMM d, yyyy")}`
      : start
      ? `${format(start, "MMM d, yyyy")} →`
      : end
      ? `→ ${format(end, "MMM d, yyyy")}`
      : "";
  const services = Array.isArray(agreement.includedServices)
    ? agreement.includedServices.join(", ")
    : "";
  const payment =
    (agreement.paymentAmount != null
      ? `$${Number(agreement.paymentAmount).toLocaleString()}`
      : "") +
    (agreement.paymentFrequency ? `/${agreement.paymentFrequency}` : "");

  return (
    <div className="rounded-lg p-3 bg-white dark:bg-zinc-800 shadow-elev-1">
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
        <div>
          <span className="text-zinc-500">Included:</span> {services || "—"}
        </div>
        <div>
          <span className="text-zinc-500">Payment:</span> {payment || "—"}
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
