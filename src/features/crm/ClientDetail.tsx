import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { Link, useNavigate, useParams } from "react-router-dom";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { RoleGuard } from "../../context/RoleGuard";
import { useNewLocationModal } from "./NewLocationModal";
import ClientEditModal from "./ClientEditModal";
import { ServiceAgreementModal } from "./ServiceAgreementModal";

// Utility function to determine invoice status and styling
function getInvoiceStatusInfo(invoice: any) {
  const status = (invoice.status || "").toLowerCase();

  // If explicitly paid, show as paid
  if (status === "paid") {
    return {
      label: "Paid",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
    };
  }

  // Check if past due
  const dueDate = invoice.dueDate?.toDate
    ? invoice.dueDate.toDate()
    : invoice.dueDate instanceof Date
    ? invoice.dueDate
    : null;

  if (dueDate && dueDate < new Date()) {
    return {
      label: "Past Due",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    };
  }

  // Default to pending
  return {
    label: "Pending",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  };
}

type Client = {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  clientIdString?: string;
  status?: boolean;
};

type Location = {
  id: string;
  locationName?: string;
  address?: any;
};

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const { open: openNewLocation } = useNewLocationModal();

  const [tab, setTab] = useState<
    "overview" | "locations" | "agreements" | "billing" | "activity"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agrModal, setAgrModal] = useState<{
    mode: "create" | "edit" | "view";
    id?: string | null;
  } | null>(null);

  const handleAgreementModeChange = (newMode: "create" | "edit" | "view") => {
    if (agrModal) {
      setAgrModal({ ...agrModal, mode: newMode });
    }
  };

  useEffect(() => {
    async function load() {
      try {
        if (!id) return;
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Client doc
        const snap = await getDoc(doc(db, "clientMasterList", id));
        if (!snap.exists()) {
          show({ type: "error", message: "Client not found" });
          navigate(-1);
          return;
        }
        const c = { id: snap.id, ...(snap.data() as any) } as Client;
        setClient(c);

        // Locations (basic info)
        const locSnap = await getDocs(
          query(
            collection(db, "locations"),
            where("clientProfileId", "==", id),
            orderBy("locationName")
          )
        );
        const locs: Location[] = [];
        locSnap.forEach((d) => locs.push({ id: d.id, ...(d.data() as any) }));
        setLocations(locs);

        // Agreements (read-only)
        try {
          const agSnap = await getDocs(
            query(
              collection(db, "serviceAgreements"),
              where("clientId", "==", id)
            )
          );
          const list: any[] = [];
          agSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setAgreements(list);
        } catch (_) {
          setAgreements([]);
        }

        // Invoices (read-only)
        try {
          const invSnap = await getDocs(
            query(
              collection(db, "invoices"),
              where("clientId", "==", id),
              orderBy("createdAt", "desc"),
              limit(50)
            )
          );
          const list: any[] = [];
          invSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setInvoices(list);
        } catch (_) {
          setInvoices([]);
        }

        // Activity (last 30d serviceHistory)
        try {
          const now = new Date();
          const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const histSnap = await getDocs(
            query(
              collection(db, "serviceHistory"),
              where("clientProfileId", "==", id),
              orderBy("serviceDate", "desc"),
              limit(100)
            )
          );
          const list: any[] = [];
          histSnap.forEach((d) =>
            list.push({ id: d.id, ...(d.data() as any) })
          );
          // Client-side filter for last 30d in case of missing index
          setActivity(
            list.filter((x) => {
              const ts = (x as any).serviceDate;
              const dt = ts?.toDate ? ts.toDate() : null;
              return dt ? dt >= since : false;
            })
          );
        } catch (_) {
          setActivity([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function reloadAgreements(clientId: string) {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const agSnap = await getDocs(
        query(
          collection(db, "serviceAgreements"),
          where("clientId", "==", clientId)
        )
      );
      const list: any[] = [];
      agSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setAgreements(list);
    } catch {}
  }

  const totalOutstanding = useMemo(() => {
    return invoices
      .filter((i: any) => (i.status || "").toLowerCase() !== "paid")
      .reduce((sum, i: any) => sum + (Number(i.amountDue) || 0), 0);
  }, [invoices]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (!client) return <div className="p-4">Client not found.</div>;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">
            {client.companyName ||
              client.contactName ||
              client.email ||
              client.id}
          </div>
          <div className="text-sm text-zinc-500">
            {client.email || ""} {client.phone ? `• ${client.phone}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleGuard allow={["owner", "super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md border card-bg"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </button>
          </RoleGuard>
          <RoleGuard allow={["super_admin"]}>
            <button
              className="px-3 py-1.5 rounded-md border bg-red-600 text-white disabled:opacity-60"
              disabled={deleting}
              onClick={async () => {
                if (!id) return;
                if (!confirm("Delete this client? This cannot be undone."))
                  return;
                try {
                  setDeleting(true);
                  const db = getFirestore();
                  await deleteDoc(doc(db, "clientMasterList", id));
                  show({ type: "success", message: "Client deleted" });
                  navigate("/crm");
                } catch (e: any) {
                  show({
                    type: "error",
                    message: e?.message || "Failed to delete",
                  });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Delete
            </button>
          </RoleGuard>
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        {(
          [
            ["overview", "Overview"],
            ["locations", "Locations"],
            ["agreements", "Agreements"],
            ["billing", "Billing"],
            ["activity", "Activity"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1.5 rounded-md border ${
              tab === key
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "card-bg"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="rounded-lg card-bg shadow-elev-1 p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Company Name" value={client.companyName || "—"} />
            <Field label="Contact Name" value={client.contactName || "—"} />
            <Field label="Email" value={client.email || "—"} />
            <Field label="Phone" value={client.phone || "—"} />
            <Field
              label="Client ID String"
              value={client.clientIdString || "—"}
            />
            <Field
              label="Status"
              value={
                client.status === true
                  ? "Active"
                  : client.status === false
                  ? "Inactive"
                  : "—"
              }
            />
          </div>
        </div>
      )}

      {tab === "locations" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-500">Locations</div>
            <RoleGuard allow={["owner", "super_admin"]}>
              <button
                className="px-3 py-1.5 rounded-md border card-bg"
                onClick={() => openNewLocation()}
              >
                Add Location
              </button>
            </RoleGuard>
          </div>
          <div className="hidden md:block overflow-x-auto rounded-lg card-bg shadow-elev-1">
            <table className="min-w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-zinc-500">
                      No locations.
                    </td>
                  </tr>
                ) : (
                  locations.map((l) => (
                    <tr
                      key={l.id}
                      className="border-t border-zinc-100 dark:border-zinc-700"
                    >
                      <td className="px-3 py-2">
                        <Link
                          to={`/crm/locations/${l.id}`}
                          className="text-blue-600 dark:text-blue-400 underline"
                        >
                          {l.locationName || l.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{formatAddress(l.address)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/crm/locations/${l.id}`}
                          className="text-blue-600 dark:text-blue-400 underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {locations.length === 0 ? (
              <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
                No locations.
              </div>
            ) : (
              locations.map((l) => (
                <div
                  key={l.id}
                  className="rounded-lg p-3 card-bg shadow-elev-1"
                >
                  <div className="font-medium">
                    <Link
                      to={`/crm/locations/${l.id}`}
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      {l.locationName || l.id}
                    </Link>
                  </div>
                  <div className="text-sm text-zinc-500 mt-1">
                    {formatAddress(l.address)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "agreements" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-500">Agreements</div>
            <RoleGuard allow={["owner", "super_admin", "admin"]}>
              <button
                className="px-3 py-1.5 rounded-md border card-bg"
                onClick={() => setAgrModal({ mode: "create" })}
              >
                New Agreement
              </button>
            </RoleGuard>
          </div>
          {agreements.length === 0 ? (
            <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
              No agreements.
            </div>
          ) : (
            agreements.map((a) => (
              <div key={a.id} className="rounded-lg p-3 card-bg shadow-elev-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {a.agreementName || a.frequency || "Agreement"}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">
                      {a.paymentAmount ? `$${a.paymentAmount}` : ""}{" "}
                      {a.paymentFrequency || ""}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">
                      {(() => {
                        // Show service days if they exist
                        const serviceDays =
                          a.serviceDays || a.scheduleDetails?.serviceDays;
                        if (
                          Array.isArray(serviceDays) &&
                          serviceDays.length > 0
                        ) {
                          const formattedDays = serviceDays
                            .map(
                              (day) =>
                                day.charAt(0).toUpperCase() + day.slice(1)
                            )
                            .join(", ");
                          return `Days: ${formattedDays}`;
                        }
                        // Show monthly day if it exists
                        if (
                          a.frequency === "monthly" &&
                          a.scheduleDetails?.monthlyDay
                        ) {
                          const day = a.scheduleDetails.monthlyDay;
                          return `Day: ${day}${
                            day === 1
                              ? "st"
                              : day === 2
                              ? "nd"
                              : day === 3
                              ? "rd"
                              : "th"
                          } of month`;
                        }
                        return "";
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      className="px-2 py-1 rounded-md border"
                      onClick={() => setAgrModal({ mode: "view", id: a.id })}
                    >
                      View
                    </button>
                    <RoleGuard allow={["owner", "super_admin", "admin"]}>
                      <button
                        className="px-2 py-1 rounded-md border"
                        onClick={() => setAgrModal({ mode: "edit", id: a.id })}
                      >
                        Edit
                      </button>
                    </RoleGuard>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "billing" && (
        <div className="space-y-2">
          <div className="rounded-lg p-3 card-bg shadow-elev-1">
            <div className="flex items-center justify-between text-sm">
              <div>Total outstanding</div>
              <div className="font-semibold">
                ${totalOutstanding.toFixed(2)}
              </div>
            </div>
          </div>
          {invoices.length === 0 ? (
            <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
              No invoices.
            </div>
          ) : (
            <div className="hidden md:block overflow-x-auto rounded-lg card-bg shadow-elev-1">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-t border-zinc-100 dark:border-zinc-700"
                    >
                      <td className="px-3 py-2">
                        {inv.invoiceNumber || inv.id}
                      </td>
                      <td className="px-3 py-2">
                        ${Number(inv.amountDue || inv.total || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const statusInfo = getInvoiceStatusInfo(inv);
                          return (
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="md:hidden space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="rounded-lg p-3 card-bg shadow-elev-1"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {inv.invoiceNumber || inv.id}
                  </div>
                  <div>
                    ${Number(inv.amountDue || inv.total || 0).toFixed(2)}
                  </div>
                </div>
                <div className="text-sm text-zinc-500">
                  {(() => {
                    const statusInfo = getInvoiceStatusInfo(inv);
                    return (
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
          <div>
            <Link
              to={`/finance?clientId=${encodeURIComponent(client.id)}`}
              className="text-blue-600 dark:text-blue-400 underline text-sm"
            >
              Go to Finance → Invoices
            </Link>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-2">
          {activity.length === 0 ? (
            <div className="rounded-lg p-3 card-bg shadow-elev-1 text-sm text-zinc-500">
              No activity in the past 30 days.
            </div>
          ) : (
            activity.map((a) => (
              <div key={a.id} className="rounded-lg p-3 card-bg shadow-elev-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {a.locationName || a.locationId || "Service"}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {a.serviceDate?.toDate
                      ? a.serviceDate.toDate().toLocaleString()
                      : ""}
                  </div>
                </div>
                {a.jobNotes && (
                  <div className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap">
                    {a.jobNotes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {editOpen && (
        <ClientEditModal
          client={client}
          onClose={() => setEditOpen(false)}
          onUpdated={(partial) =>
            setClient((prev) => (prev ? { ...prev, ...partial } : prev))
          }
        />
      )}
      {agrModal && id && (
        <ServiceAgreementModal
          clientId={id}
          agreementId={agrModal.id || null}
          mode={agrModal.mode}
          onClose={() => setAgrModal(null)}
          onSaved={() => reloadAgreements(id)}
          onDeleted={() => reloadAgreements(id)}
          onModeChange={handleAgreementModeChange}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  const parts: string[] = [];
  const a = addr || {};
  const line1 = a.line1 || a.street || "";
  const line2 = a.line2 || "";
  const city = a.city || "";
  const state = a.state || "";
  const zip = a.zip || "";
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);
  const cs = [city, state].filter(Boolean).join(", ");
  const tail = [cs, zip].filter(Boolean).join(" ");
  if (tail) parts.push(tail);
  return parts.join(", ");
}
