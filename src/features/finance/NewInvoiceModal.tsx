import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
  doc,
  runTransaction,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseConfig } from "../../services/firebase";

type Client = {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  status?: boolean;
};

type Location = {
  id: string;
  name?: string;
  locationName?: string;
  address?:
    | string
    | {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
      };
  clientId?: string;
  clientProfileId?: string;
  status?: boolean;
};

type LineItem = {
  description: string;
  qty: number;
  rate: number;
  amount: number;
};

type InvoiceFormData = {
  clientId: string;
  clientName: string;
  payeeEmail: string;
  locations: string[];
  lineItems: LineItem[];
  dueDate: string;
  status: string;
  notes: string;
  recurring: boolean;
  totalAmount: number;
};

export default function NewInvoiceModal({
  open,
  onClose,
  onCreated,
  submitting,
  setSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: any) => void;
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<InvoiceFormData>({
    clientId: "",
    clientName: "",
    payeeEmail: "",
    locations: [],
    lineItems: [{ description: "", qty: 1, rate: 0, amount: 0 }],
    dueDate: "",
    status: "pending",
    notes: "",
    recurring: false,
    totalAmount: 0,
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    try {
      loadClients().finally(() => {
        setLoading(false);
      });
    } catch (error) {
      console.error("Error loading data:", error);
      setLoading(false);
    }
  }, [open]);

  async function loadClients() {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const qref = query(
        collection(db, "clientMasterList"),
        where("status", "==", true),
        orderBy("companyName")
      );
      const snap = await getDocs(qref);
      const list: Client[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        console.log("Client data:", { id: d.id, ...data });
        list.push({ id: d.id, ...data });
      });
      setClients(list);
    } catch (e) {
      console.warn("Failed loading clients", e);
    }
  }

  async function loadLocations() {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const snap = await getDocs(collection(db, "locations"));
      const list: Location[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        console.log("Location data:", { id: d.id, ...data });
        list.push({ id: d.id, ...data });
      });
      setLocations(list);
    } catch (e) {
      console.warn("Failed loading locations", e);
    }
  }

  async function loadLocationsForClient(clientId: string) {
    if (!clientId) {
      setLocations([]);
      return;
    }

    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const qref = query(
        collection(db, "locations"),
        where("clientProfileId", "==", clientId),
        where("status", "==", true)
      );
      const snap = await getDocs(qref);
      const list: Location[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        console.log("Client location data:", { id: d.id, ...data });
        list.push({ id: d.id, ...data });
      });
      setLocations(list);
    } catch (e) {
      console.warn("Failed loading locations for client", e);
      setLocations([]);
    }
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    const clientName = client
      ? client.companyName || client.contactName || client.email || clientId
      : "";
    const payeeEmail = client?.email || "";

    setForm((prev) => ({
      ...prev,
      clientId,
      clientName,
      payeeEmail,
      locations: [], // Clear selected locations when client changes
    }));

    // Load locations for the selected client
    loadLocationsForClient(clientId);
  }

  function addLineItem() {
    setForm((prev) => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        { description: "", qty: 1, rate: 0, amount: 0 },
      ],
    }));
  }

  function removeLineItem(index: number) {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
    recalcTotal();
  }

  function updateLineItem(
    index: number,
    field: keyof LineItem,
    value: string | number
  ) {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
              ...(field === "qty" || field === "rate"
                ? {
                    amount:
                      (field === "qty" ? Number(value) : item.qty) *
                      (field === "rate" ? Number(value) : item.rate),
                  }
                : {}),
            }
          : item
      ),
    }));
    setTimeout(recalcTotal, 0);
  }

  function recalcTotal() {
    const total = form.lineItems.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );
    setForm((prev) => ({ ...prev, totalAmount: total }));
  }

  async function getNextInvoiceNumber(baseDate: Date) {
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const functions = getFunctions();
      const callable: any = httpsCallable(functions, "getNextInvoiceNumber");
      const res = await callable({});
      const data = (res?.data as any) || {};
      if (data.invoiceNumber && data.bucket) return data;
    } catch (_) {
      // fall through to Firestore transaction
    }
    // Fallback: Firestore transaction counter per YYYYMM
    const yyyy = String(baseDate.getFullYear());
    const mm = String(baseDate.getMonth() + 1).padStart(2, "0");
    const bucket = `${yyyy}${mm}`;
    const db = getFirestore();
    const counterRef = doc(db, "counters", `invoice_${bucket}`);
    try {
      const seq = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists()
          ? Number((snap.data() as any).current || 0)
          : 0;
        const updated = current + 1;
        tx.set(
          counterRef,
          { current: updated, yearMonth: bucket, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return updated;
      });
      const padded = String(seq).padStart(4, "0");
      return { invoiceNumber: `INV-${bucket}-${padded}`, bucket };
    } catch (_) {
      // Last resort: timestamp-based fallback
      const padded = String(Date.now() % 10000).padStart(4, "0");
      return { invoiceNumber: `INV-${bucket}-${padded}`, bucket };
    }
  }

  async function handleSubmit() {
    if (
      !form.clientId ||
      !form.dueDate ||
      form.totalAmount <= 0 ||
      !form.lineItems.some((li) => li.description && li.amount > 0)
    ) {
      alert(
        "Please fill all required fields and ensure total amount is greater than 0."
      );
      return;
    }

    try {
      setSubmitting(true);
      const db = getFirestore();
      const dueDate = Timestamp.fromDate(new Date(`${form.dueDate}T00:00:00`));

      const { invoiceNumber, bucket } = await getNextInvoiceNumber(new Date());

      const filteredLineItems = form.lineItems.filter(
        (li) => li.description.trim() && li.amount > 0
      );

      const invoiceData = {
        clientId: form.clientId,
        clientName: form.clientName,
        payeeEmail: form.payeeEmail,
        locations: form.locations,
        lineItems: filteredLineItems,
        dueDate,
        totalAmount: form.totalAmount,
        status: form.status,
        notes: form.notes,
        recurring: form.recurring,
        createdAt: serverTimestamp(),
        invoiceNumber,
        invoiceYearMonth: bucket,
        invoiceNumberAssignedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "invoices"), invoiceData);

      const newInvoice = {
        id: ref.id,
        ...invoiceData,
        createdAt: new Date(),
        dueDate: dueDate.toDate(),
      };

      onCreated(newInvoice);
    } catch (e: any) {
      alert(`Failed to create invoice: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  // Add error boundary for debugging
  try {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => !submitting && onClose()}
        />
        <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg card-bg shadow-elev-3 p-6">
          <div className="text-xl font-medium mb-4">New Invoice</div>

          {loading && (
            <div className="absolute inset-0 bg-[var(--bg)]/80 flex items-center justify-center z-10">
              <div className="text-center">
                <div className="text-lg font-medium">Loading...</div>
                <div className="text-sm text-zinc-500">
                  Please wait while we load the form data
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Client and Locations Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client</label>
                <select
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                >
                  <option value="">Select client…</option>
                  {clients.map((client) => {
                    // Ensure we're rendering strings, not objects
                    let displayName =
                      (client.companyName &&
                      typeof client.companyName === "string"
                        ? client.companyName
                        : "") ||
                      (client.contactName &&
                      typeof client.contactName === "string"
                        ? client.contactName
                        : "") ||
                      (client.email && typeof client.email === "string"
                        ? client.email
                        : "") ||
                      client.id;

                    // Ensure we always have a valid string
                    if (!displayName || typeof displayName !== "string") {
                      displayName = client.id || "Unknown Client";
                    }

                    return (
                      <option key={client.id} value={client.id}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Locations{" "}
                  <span className="text-xs text-zinc-500">(optional)</span>
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  multiple
                  size={4}
                  value={form.locations}
                  onChange={(e) => {
                    const selected = Array.from(
                      e.target.selectedOptions,
                      (option) => option.value
                    );
                    setForm((prev) => ({ ...prev, locations: selected }));
                  }}
                >
                  {form.clientId && locations.length === 0 ? (
                    <option value="" disabled>
                      No locations found for this client
                    </option>
                  ) : !form.clientId ? (
                    <option value="" disabled>
                      Select a client first
                    </option>
                  ) : (
                    locations.map((location) => {
                      // Prioritize locationName over address
                      let displayName =
                        location.locationName || location.name || location.id;

                      // Only use address if no location name is available
                      if (!displayName || displayName === location.id) {
                        if (location.address) {
                          if (typeof location.address === "string") {
                            displayName = location.address;
                          } else if (
                            typeof location.address === "object" &&
                            location.address !== null
                          ) {
                            // If address is an object, try to construct a readable string
                            const addr = location.address as any;
                            const parts = [];
                            if (addr.street) parts.push(addr.street);
                            if (addr.city) parts.push(addr.city);
                            if (addr.state) parts.push(addr.state);
                            if (addr.zip) parts.push(addr.zip);
                            displayName =
                              parts.length > 0 ? parts.join(", ") : location.id;
                          }
                        }
                      }

                      // Ensure we always have a valid string
                      if (!displayName || typeof displayName !== "string") {
                        displayName = location.id || "Unknown Location";
                      }

                      return (
                        <option key={location.id} value={location.id}>
                          {displayName}
                        </option>
                      );
                    })
                  )}
                </select>
                <div className="text-xs text-zinc-500 mt-1">
                  Hold Cmd/Ctrl to select multiple.
                </div>
              </div>
            </div>

            {/* Email display */}
            {form.payeeEmail && (
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border rounded-md px-3 py-2 bg-zinc-50 dark:bg-zinc-800"
                  value={form.payeeEmail}
                  readOnly
                />
              </div>
            )}

            {/* Line Items Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Line Items</label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  + Add Item
                </button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-3 bg-zinc-50 dark:bg-zinc-800 font-medium text-sm">
                  <div className="col-span-4">Description</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Rate</div>
                  <div className="col-span-2">Amount</div>
                  <div className="col-span-2"></div>
                </div>
                {form.lineItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 p-3 border-t"
                  >
                    <input
                      type="text"
                      className="col-span-4 border rounded px-2 py-1"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        updateLineItem(index, "description", e.target.value)
                      }
                    />
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="col-span-2 border rounded px-2 py-1"
                      placeholder="Qty"
                      value={item.qty || ""}
                      onChange={(e) =>
                        updateLineItem(
                          index,
                          "qty",
                          Number(e.target.value) || 0
                        )
                      }
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="col-span-2 border rounded px-2 py-1"
                      placeholder="Rate"
                      value={item.rate || ""}
                      onChange={(e) =>
                        updateLineItem(
                          index,
                          "rate",
                          Number(e.target.value) || 0
                        )
                      }
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="col-span-2 border rounded px-2 py-1 bg-zinc-50"
                      value={item.amount.toFixed(2)}
                      readOnly
                    />
                    <div className="col-span-2 flex items-center">
                      {form.lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end p-3 bg-zinc-50 dark:bg-zinc-800 border-t">
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      Total: ${form.totalAmount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Due Date and Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dueDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  className="w-full border rounded-md px-3 py-2 card-bg"
                  value={form.status}
                  disabled
                >
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            {/* Recurring Checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="recurring"
                type="checkbox"
                className="h-4 w-4"
                checked={form.recurring}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, recurring: e.target.checked }))
                }
              />
              <label htmlFor="recurring" className="text-sm">
                Recurring Monthly (AutoPay)
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 card-bg h-24"
                placeholder="Optional notes about this invoice"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              className="px-4 py-2 rounded-md border card-bg hover:bg-zinc-50 dark:hover:bg-zinc-800"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className={`px-4 py-2 rounded-md text-white ${
                submitting ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error rendering NewInvoiceModal:", error);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-lg card-bg shadow-elev-3 p-4">
          <div className="text-lg font-medium text-red-600">
            Error Loading Invoice Form
          </div>
          <div className="mt-3 text-sm text-zinc-600">
            There was an error loading the invoice form. Please try again.
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
}
