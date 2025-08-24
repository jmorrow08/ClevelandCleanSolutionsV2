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
};

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
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setAgreements(list);
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
  const title = agreement.serviceType || "Service Agreement";
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
