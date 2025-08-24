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
import { firebaseConfig } from "../../services/firebase";
import { useSettings } from "../../context/SettingsContext";
import { getLocationName } from "../../services/queries/resolvers";

type RecentService = {
  id: string;
  serviceDate?: any;
  locationId?: string;
  status?: string;
};

type Agreement = {
  id: string;
  frequency?: string;
  includedServices?: string[];
  paymentAmount?: number;
  paymentFrequency?: string;
  isActive?: boolean;
};

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
        if (!user) return setLoading(false);
        const db = getFirestore();

        // Resolve profileId
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userDoc = (userSnap.data() as any) || {};
        const profileId = (userDoc?.profileId as string) || undefined;
        const email = user.email || "";
        if (!profileId) return setLoading(false);

        // Welcome name
        try {
          const cSnap = await getDoc(doc(db, "clientMasterList", profileId));
          const c = (cSnap.data() as any) || {};
          setClientName(c.contactName || c.companyName || "Client");
        } catch {}

        // Next service (future earliest)
        try {
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(new Date())),
            orderBy("serviceDate", "asc"),
            limit(1)
          );
          const snap = await getDocs(q);
          const d = snap.docs[0];
          if (d) setNextService({ id: d.id, ...(d.data() as any) });
        } catch (e: any) {
          console.warn(
            "Client next service may require composite index",
            e?.message
          );
        }

        // Jobs completed this month
        try {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            where("serviceDate", ">=", Timestamp.fromDate(startOfMonth)),
            where("serviceDate", "<", Timestamp.fromDate(endOfMonth)),
            orderBy("serviceDate", "asc")
          );
          const snap = await getDocs(q);
          const count = snap.docs.filter(
            (d) => (d.data() as any)?.status === "Completed"
          ).length;
          setJobsCompleted(count);
        } catch (e: any) {
          console.warn(
            "Client jobs completed query may require index",
            e?.message
          );
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

        // Recent services (last 5)
        try {
          const q = query(
            collection(db, "serviceHistory"),
            where("clientProfileId", "==", profileId),
            orderBy("serviceDate", "desc"),
            limit(5)
          );
          const snap = await getDocs(q);
          setRecent(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        } catch (e: any) {
          console.warn("Client recent services may require index", e?.message);
        }

        // Service agreements list (active)
        try {
          const q = query(
            collection(db, "serviceAgreements"),
            where("clientId", "==", profileId),
            where("isActive", "==", true)
          );
          const snap = await getDocs(q);
          const list: Agreement[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setAgreements(list);
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
          ? nextService.serviceDate
              .toDate()
              .toLocaleString("en-US", { timeZone: "America/New_York" })
          : "No upcoming service",
        hint: nextService?.locationId
          ? `@ ${nextService.locationId}`
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
          <div
            key={c.label}
            className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1"
          >
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
        <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
          <div className="font-medium">Recent Cleaning Services</div>
          {loading ? (
            <div className="text-sm text-zinc-500 mt-2">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-zinc-500 mt-2">No recent services</div>
          ) : (
            <ul className="mt-2 text-sm divide-y divide-zinc-200 dark:divide-zinc-700">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="py-2 cursor-pointer hover:text-blue-600"
                  onClick={() => setModal({ type: "service", job: r })}
                >
                  {(r.serviceDate?.toDate
                    ? r.serviceDate.toDate().toLocaleDateString("en-US", {
                        timeZone: "America/New_York",
                      })
                    : "—") + (r.status ? ` — ${r.status}` : "")}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
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
                  <div className="font-medium">
                    {(a as any).locationName || (a as any).locationId || a.id}
                  </div>
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
        <ServiceModal job={modal.job} onClose={() => setModal(null)} />
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

function ServiceModal({
  job,
  onClose,
}: {
  job: RecentService;
  onClose: () => void;
}) {
  const [locationNameResolved, setLocationNameResolved] = useState<string>("");
  useEffect(() => {
    (async () => {
      const name = await getLocationName((job as any).locationId);
      setLocationNameResolved(name);
    })();
  }, [job]);
  const dt = job.serviceDate?.toDate
    ? job.serviceDate
        .toDate()
        .toLocaleString("en-US", { timeZone: "America/New_York" })
    : "—";
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-elev-2 max-w-xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Service Details</div>
          <button
            className="px-2 py-1 text-sm rounded-md border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="text-sm text-zinc-500 mt-2">{dt}</div>
        <div className="mt-3 text-sm">
          <div>
            Location: {locationNameResolved || (job as any).locationId || "—"}
          </div>
          <div>Status: {job.status || "—"}</div>
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
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-elev-2 max-w-2xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Service Agreement Details</div>
          <button
            className="px-2 py-1 text-sm rounded-md border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-3 text-sm space-y-2">
          <div>Service Frequency: {agreement.frequency || "—"}</div>
          <div>
            Payment:{" "}
            {agreement.paymentAmount
              ? `$${Number(agreement.paymentAmount).toLocaleString()}`
              : "—"}
            {agreement.paymentFrequency ? `/${agreement.paymentFrequency}` : ""}
          </div>
          <div>
            Included Services:{" "}
            {Array.isArray(agreement.includedServices) &&
            agreement.includedServices.length
              ? agreement.includedServices.join(", ")
              : "—"}
          </div>
          <div>Status: {agreement.isActive ? "Active" : "Inactive"}</div>
        </div>
      </div>
    </div>
  );
}
