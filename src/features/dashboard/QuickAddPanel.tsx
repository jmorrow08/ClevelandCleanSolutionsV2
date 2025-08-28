import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";
import { primeLocationName } from "../../services/queries/resolvers";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

type Mode = "new-service" | "new-client" | "new-location" | "new-employee";

type Option = { id: string; label: string };

const CREATE_USER_URL =
  "https://us-central1-cleveland-clean-portal.cloudfunctions.net/createNewUser_v1";

export default function QuickAddPanel() {
  const { show } = useToast();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>("new-service");

  // Shared lookups
  const [clients, setClients] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);

  // === New Service form state ===
  const [serviceType, setServiceType] = useState<"regular" | "custom">(
    "regular"
  );
  const [serviceClientId, setServiceClientId] = useState("");
  const [serviceLocationId, setServiceLocationId] = useState("");
  const [serviceDateTime, setServiceDateTime] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceAssigned, setServiceAssigned] = useState<string[]>([]);
  // custom fields
  const [customClientName, setCustomClientName] = useState("");
  const [customLocationName, setCustomLocationName] = useState("");
  const [customContact, setCustomContact] = useState("");
  const [customPrice, setCustomPrice] = useState<string>("");

  // === New Client form state ===
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientContactName, setClientContactName] = useState("");
  const [clientIdString, setClientIdString] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientPassword, setClientPassword] = useState("");

  // === New Location form state ===
  const [locClientId, setLocClientId] = useState("");
  const [locName, setLocName] = useState("");
  const [locIdString, setLocIdString] = useState("");
  const [locLine1, setLocLine1] = useState("");
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [locZip, setLocZip] = useState("");
  const [locContactName, setLocContactName] = useState("");
  const [locContactPhone, setLocContactPhone] = useState("");

  // === New Employee form state ===
  const [empFirst, setEmpFirst] = useState("");
  const [empLast, setEmpLast] = useState("");
  const [empIdString, setEmpIdString] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empJobTitle, setEmpJobTitle] = useState("");
  const [empPassword, setEmpPassword] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadLookups() {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      // Clients
      try {
        const snap = await getDocs(
          query(
            collection(db, "clientMasterList"),
            where("status", "==", true),
            orderBy("companyName")
          )
        );
        const list: Option[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const label =
            data.companyName ||
            data.name ||
            data.contactName ||
            data.email ||
            d.id;
          list.push({ id: d.id, label });
        });
        setClients(list);
      } catch (_) {
        // fallback without order
        try {
          const snap = await getDocs(
            query(
              collection(getFirestore(), "clientMasterList"),
              where("status", "==", true)
            )
          );
          const list: Option[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            const label =
              data.companyName ||
              data.name ||
              data.contactName ||
              data.email ||
              d.id;
            list.push({ id: d.id, label });
          });
          setClients(list);
        } catch {}
      }

      // Employees
      try {
        const snap = await getDocs(
          query(
            collection(getFirestore(), "employeeMasterList"),
            where("status", "==", true)
          )
        );
        const list: Option[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const label =
            data.fullName ||
            [data.firstName, data.lastName].filter(Boolean).join(" ") ||
            data.name ||
            data.email ||
            d.id;
          list.push({ id: d.id, label });
        });
        setEmployees(list);
      } catch {}
    }
    loadLookups();
  }, []);

  // Load locations when client changes (for service form)
  useEffect(() => {
    async function loadLocations() {
      if (!serviceClientId) {
        setLocations([]);
        setServiceLocationId("");
        return;
      }
      const db = getFirestore();
      try {
        const snap = await getDocs(
          query(
            collection(db, "locations"),
            where("clientProfileId", "==", serviceClientId),
            where("status", "==", true)
          )
        );
        const list: Option[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const label = data.locationName || data.address || data.name || d.id;
          list.push({ id: d.id, label });
        });
        setLocations(list);
        if (!list.find((x) => x.id === serviceLocationId))
          setServiceLocationId("");
      } catch {}
    }
    if (serviceType === "regular") loadLocations();
  }, [serviceClientId, serviceType]);

  const employeeLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((e) => (map[e.id] = e.label));
    return map;
  }, [employees]);

  function resetAll() {
    setServiceType("regular");
    setServiceClientId("");
    setServiceLocationId("");
    setServiceDateTime("");
    setServiceNotes("");
    setServiceAssigned([]);
    setCustomClientName("");
    setCustomLocationName("");
    setCustomContact("");
    setCustomPrice("");

    setClientCompanyName("");
    setClientContactName("");
    setClientIdString("");
    setClientEmail("");
    setClientPhone("");
    setClientPassword("");

    setLocClientId("");
    setLocName("");
    setLocIdString("");
    setLocLine1("");
    setLocCity("");
    setLocState("");
    setLocZip("");
    setLocContactName("");
    setLocContactPhone("");

    setEmpFirst("");
    setEmpLast("");
    setEmpIdString("");
    setEmpEmail("");
    setEmpPhone("");
    setEmpJobTitle("");
    setEmpPassword("");
  }

  async function createService() {
    if (saving) return;
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();

    try {
      setSaving(true);
      let payload: any = {};
      let clientId: string | null = null;
      let locationId: string | null = null;
      let clientName: string | null = null;
      let locationName: string | null = null;
      let isCustomJob = false;
      let price: number | null = null;

      if (serviceType === "regular") {
        clientId = serviceClientId || null;
        locationId = serviceLocationId || null;
        if (!clientId || !locationId || !serviceDateTime) {
          show({
            type: "error",
            message: "Client, location, and date/time are required",
          });
          return;
        }
      } else {
        isCustomJob = true;
        clientName = customClientName.trim();
        locationName = customLocationName.trim();
        if (!clientName || !locationName || !serviceDateTime) {
          show({
            type: "error",
            message: "Client, location, and date/time required",
          });
          return;
        }
        clientId = `CUSTOM-${Date.now()}`;
        locationId = `CUSTOM-LOC-${Date.now()}`;
        const cp = parseFloat(customPrice);
        if (!Number.isNaN(cp)) price = cp;
      }

      const when = Timestamp.fromDate(new Date(serviceDateTime));
      const employeeAssignments = (serviceAssigned || []).map((uid) => ({
        uid,
        displayName: employeeLabelById[uid] || uid,
      }));

      payload = {
        clientProfileId: clientId,
        clientName: clientName || null,
        locationId: locationId,
        locationName: locationName || null,
        serviceDate: when,
        serviceType:
          serviceNotes ||
          (isCustomJob ? "Custom Service" : "Scheduled Service"),
        serviceNotes: null,
        adminNotes: null,
        assignedEmployees: serviceAssigned,
        employeeAssignments,
        employeeDisplayNames: employeeAssignments.map((a) => a.displayName),
        status: "Scheduled",
        statusV2: "scheduled",
        payrollProcessed: false,
        isCustomJob,
        customPrice: price,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || null,
      };

      if (serviceType === "custom" && customContact.trim()) {
        payload.serviceType = payload.serviceType
          ? `${payload.serviceType} | Contact: ${customContact.trim()}`
          : `Contact: ${customContact.trim()}`;
      }

      await addDoc(collection(db, "serviceHistory"), payload);
      show({ type: "success", message: "Service scheduled" });
      resetAll();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to schedule" });
    } finally {
      setSaving(false);
    }
  }

  async function createClient() {
    if (saving) return;
    const company = clientCompanyName.trim();
    const contact = clientContactName.trim();
    const email = clientEmail.trim();
    const phone = clientPhone.trim();
    const idStr = clientIdString.trim();
    const password = clientPassword;
    if (!company || !contact || !email || !idStr || !password) {
      show({
        type: "error",
        message: "All fields incl. password are required",
      });
      return;
    }
    try {
      setSaving(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not authenticated");
      const res = await fetch(CREATE_USER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email,
          password,
          role: "client",
          clientIdString: idStr,
          companyName: company,
          contactName: contact,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error?.message || data?.message || `HTTP ${res.status}`
        );
      }
      show({ type: "success", message: "Client created" });
      resetAll();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to create client" });
    } finally {
      setSaving(false);
    }
  }

  async function createLocation() {
    if (saving) return;
    const clientId = locClientId.trim();
    const name = locName.trim();
    const idStr = locIdString.trim();
    const line1 = locLine1.trim();
    const city = locCity.trim();
    const state = locState.trim();
    const zip = locZip.trim();
    if (!clientId || !name || !idStr || !line1 || !city || !state || !zip) {
      show({
        type: "error",
        message: "Client, name, id, and address required",
      });
      return;
    }
    try {
      setSaving(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      const ref = await addDoc(collection(db, "locations"), {
        clientProfileId: clientId,
        locationName: name,
        locationId: idStr,
        address: { line1, city, state, zip },
        contactName: locContactName.trim() || null,
        contactPhone: locContactPhone.trim() || null,
        status: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        primeLocationName(ref.id, name);
      } catch {}
      show({ type: "success", message: "Location created" });
      resetAll();
    } catch (e: any) {
      show({
        type: "error",
        message: e?.message || "Failed to create location",
      });
    } finally {
      setSaving(false);
    }
  }

  async function createEmployee() {
    if (saving) return;
    const first = empFirst.trim();
    const last = empLast.trim();
    const idStr = empIdString.trim();
    const email = empEmail.trim();
    const phone = empPhone.trim();
    const title = empJobTitle.trim();
    const password = empPassword;
    if (!first || !last || !idStr || !email || !password) {
      show({ type: "error", message: "ID, name, email, password required" });
      return;
    }
    try {
      setSaving(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not authenticated");
      const res = await fetch(CREATE_USER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          firstName: first,
          lastName: last,
          employeeIdString: idStr,
          email,
          phone,
          jobTitle: title || null,
          role: "employee",
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error?.message || data?.message || `HTTP ${res.status}`
        );
      }
      show({ type: "success", message: "Employee created" });
      resetAll();
    } catch (e: any) {
      show({
        type: "error",
        message: e?.message || "Failed to create employee",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card border border-zinc-200 dark:border-zinc-800 rounded-md">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="text-lg font-medium">Quick Add Panel</div>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm mb-1">Select Mode</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="new-service">Add New Job</option>
            <option value="new-client">Add New Client</option>
            <option value="new-location">Add New Location</option>
            <option value="new-employee">Add New Employee</option>
          </select>
        </div>

        {mode === "new-service" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Service Type</label>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="qas-service-mode"
                    checked={serviceType === "regular"}
                    onChange={() => setServiceType("regular")}
                  />
                  Regular Service
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="qas-service-mode"
                    checked={serviceType === "custom"}
                    onChange={() => setServiceType("custom")}
                  />
                  Custom Job
                </label>
              </div>
            </div>

            {serviceType === "regular" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Client</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={serviceClientId}
                    onChange={(e) => setServiceClientId(e.target.value)}
                  >
                    <option value="">Select client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Location</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={serviceLocationId}
                    onChange={(e) => setServiceLocationId(e.target.value)}
                    disabled={!serviceClientId}
                  >
                    <option value="">
                      {serviceClientId
                        ? "Select location"
                        : "Select client first"}
                    </option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">
                    Service Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={serviceDateTime}
                    onChange={(e) => setServiceDateTime(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">
                    Service Type / Notes
                  </label>
                  <input
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={serviceNotes}
                    onChange={(e) => setServiceNotes(e.target.value)}
                    placeholder="e.g., Standard cleaning"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Client Name</label>
                  <input
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={customClientName}
                    onChange={(e) => setCustomClientName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Location Name</label>
                  <input
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={customLocationName}
                    onChange={(e) => setCustomLocationName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">
                    Contact (optional)
                  </label>
                  <input
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={customContact}
                    onChange={(e) => setCustomContact(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">
                    Custom Price (optional)
                  </label>
                  <input
                    type="number"
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">
                    Service Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={serviceDateTime}
                    onChange={(e) => setServiceDateTime(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">
                    Service Type / Notes
                  </label>
                  <input
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    value={serviceNotes}
                    onChange={(e) => setServiceNotes(e.target.value)}
                    placeholder="e.g., Deep clean"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                className="px-3 py-2 text-sm rounded-md bg-brand-600 text-white disabled:opacity-50"
                onClick={createService}
                disabled={saving}
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {mode === "new-client" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Company Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={clientCompanyName}
                onChange={(e) => setClientCompanyName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Contact Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={clientContactName}
                onChange={(e) => setClientContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Client ID String</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={clientIdString}
                onChange={(e) => setClientIdString(e.target.value)}
                placeholder="e.g., CCS-1001"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Initial Password</label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                className="px-3 py-2 text-sm rounded-md bg-brand-600 text-white disabled:opacity-50"
                onClick={createClient}
                disabled={saving}
              >
                {saving ? "Creating…" : "Create Client"}
              </button>
            </div>
          </div>
        )}

        {mode === "new-location" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Client</label>
              <select
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locClientId}
                onChange={(e) => setLocClientId(e.target.value)}
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Location Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Location ID String</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locIdString}
                onChange={(e) => setLocIdString(e.target.value)}
                placeholder="e.g., CCS-LOC-2001"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Address Line 1</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locLine1}
                onChange={(e) => setLocLine1(e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">City</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locCity}
                onChange={(e) => setLocCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">State</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locState}
                onChange={(e) => setLocState(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">ZIP</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locZip}
                onChange={(e) => setLocZip(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">
                Contact Name (optional)
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locContactName}
                onChange={(e) => setLocContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">
                Contact Phone (optional)
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={locContactPhone}
                onChange={(e) => setLocContactPhone(e.target.value)}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                className="px-3 py-2 text-sm rounded-md bg-brand-600 text-white disabled:opacity-50"
                onClick={createLocation}
                disabled={saving}
              >
                {saving ? "Saving…" : "Create Location"}
              </button>
            </div>
          </div>
        )}

        {mode === "new-employee" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">First Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empFirst}
                onChange={(e) => setEmpFirst(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Last Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empLast}
                onChange={(e) => setEmpLast(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Employee ID String</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empIdString}
                onChange={(e) => setEmpIdString(e.target.value)}
                placeholder="e.g., EMP-1201"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empPhone}
                onChange={(e) => setEmpPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Job Title</label>
              <input
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empJobTitle}
                onChange={(e) => setEmpJobTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Initial Password</label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                value={empPassword}
                onChange={(e) => setEmpPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                className="px-3 py-2 text-sm rounded-md bg-brand-600 text-white disabled:opacity-50"
                onClick={createEmployee}
                disabled={saving}
              >
                {saving ? "Creating…" : "Create Employee"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
