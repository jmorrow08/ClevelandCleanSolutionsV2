import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
import { RoleGuard } from "../../context/RoleGuard";

export type AgreementDoc = {
  id?: string;
  clientId: string;
  agreementName?: string;
  frequency?: string;
  includedServices?: string[];
  specialInstructions?: string;
  paymentAmount?: number;
  paymentFrequency?: string;
  contractStartDate?: any;
  contractEndDate?: any;
  renewalTerms?: string;
  serviceAgreementUrl?: string;
  isActive?: boolean;
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
  serviceType?: string;
};

export function ServiceAgreementModal({
  clientId,
  agreementId,
  mode,
  onClose,
  onSaved,
  onDeleted,
  onModeChange,
}: {
  clientId: string;
  agreementId?: string | null;
  mode: "create" | "edit" | "view";
  onClose: () => void;
  onSaved?: (doc: AgreementDoc) => void;
  onDeleted?: (id: string) => void;
  onModeChange?: (mode: "create" | "edit" | "view") => void;
}) {
  const [loading, setLoading] = useState(mode !== "create");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AgreementDoc>({
    clientId,
    agreementName: "",
    frequency: "monthly",
    includedServices: [],
    specialInstructions: "",
    paymentAmount: undefined,
    paymentFrequency: "monthly",
    contractStartDate: undefined,
    contractEndDate: undefined,
    renewalTerms: "auto-renew",
    serviceAgreementUrl: "",
    isActive: true,
    serviceDays: [],
    scheduleDetails: {
      serviceDays: [], // Initialize to empty array
    },
    paymentScheduleDetails: {},
    serviceType: "",
  });

  const readOnly = mode === "view";

  useEffect(() => {
    (async () => {
      if (mode === "create" || !agreementId) return;
      try {
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();
        const snap = await getDoc(doc(db, "serviceAgreements", agreementId));
        if (snap.exists()) {
          const d = snap.data() as any;

          // Handle service days from different possible sources for backward compatibility
          let serviceDays = d.serviceDays || [];

          // Handle legacy data migration from v1 format
          if (!serviceDays.length) {
            // Check if serviceDays is stored in scheduleDetails (v2 format)
            if (d.scheduleDetails?.serviceDays) {
              serviceDays = d.scheduleDetails.serviceDays;
            }
            // Check if serviceDays is stored in serviceScheduleDetails (v1 format)
            else if (d.serviceScheduleDetails?.serviceDays) {
              serviceDays = d.serviceScheduleDetails.serviceDays;
            }
            // Handle v1 format where serviceDays might be stored as numbers (0-6) instead of strings
            else if (Array.isArray(d.serviceDays) && d.serviceDays.length > 0) {
              // Convert numeric days to string days (legacy migration)
              const dayMap: { [key: number]: string } = {
                0: "sunday",
                1: "monday",
                2: "tuesday",
                3: "wednesday",
                4: "thursday",
                5: "friday",
                6: "saturday",
              };
              serviceDays = d.serviceDays
                .map((day: number) => dayMap[day] || day.toString())
                .filter(Boolean);
            }
          }

          // Ensure we have a proper AgreementDoc structure
          const loadedData: AgreementDoc = {
            id: snap.id,
            clientId: d.clientId,
            agreementName: d.agreementName || "",
            frequency: d.frequency || "monthly",
            includedServices: d.includedServices || [],
            specialInstructions: d.specialInstructions || "",
            paymentAmount: d.paymentAmount,
            paymentFrequency: d.paymentFrequency || "monthly",
            contractStartDate: d.contractStartDate,
            contractEndDate: d.contractEndDate,
            renewalTerms: d.renewalTerms || "auto-renew",
            serviceAgreementUrl: d.serviceAgreementUrl || "",
            isActive: d.isActive !== false,
            serviceDays: serviceDays,
            scheduleDetails: {
              serviceDays: serviceDays, // Sync both locations for consistency
              ...(d.scheduleDetails?.monthlyDay && {
                monthlyDay: d.scheduleDetails.monthlyDay,
              }),
              ...(d.scheduleDetails?.oneTimeDate && {
                oneTimeDate: d.scheduleDetails.oneTimeDate,
              }),
            },
            paymentScheduleDetails: {
              ...(d.paymentScheduleDetails?.monthlyPaymentDay && {
                monthlyPaymentDay: d.paymentScheduleDetails.monthlyPaymentDay,
              }),
              ...(d.paymentScheduleDetails?.quarterlyMonth && {
                quarterlyMonth: d.paymentScheduleDetails.quarterlyMonth,
              }),
              ...(d.paymentScheduleDetails?.quarterlyDay && {
                quarterlyDay: d.paymentScheduleDetails.quarterlyDay,
              }),
            },
            serviceType: d.serviceType || "",
          };

          setForm(loadedData);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [agreementId, mode]);

  async function save() {
    try {
      setSaving(true);
      setError(null);

      // Validation
      if (!form.agreementName?.trim()) {
        setError("Service Agreement Name is required");
        return;
      }

      if (!form.frequency) {
        setError("Service Frequency is required");
        return;
      }

      // Validate service days for weekly/bi-weekly
      if (
        (form.frequency === "weekly" || form.frequency === "bi-weekly") &&
        (!form.serviceDays || form.serviceDays.length === 0)
      ) {
        setError(
          "Please select at least one service day for weekly/bi-weekly frequency"
        );
        return;
      }

      // Validate monthly day
      if (form.frequency === "monthly" && !form.scheduleDetails?.monthlyDay) {
        setError("Please select a service day for monthly frequency");
        return;
      }

      if (!form.paymentAmount || form.paymentAmount <= 0) {
        setError("Payment Amount is required and must be greater than 0");
        return;
      }

      if (!form.paymentFrequency) {
        setError("Payment Frequency is required");
        return;
      }

      // Validate payment schedule details
      if (
        form.paymentFrequency === "monthly" &&
        !form.paymentScheduleDetails?.monthlyPaymentDay
      ) {
        setError("Please select a payment day for monthly payments");
        return;
      }

      if (
        form.paymentFrequency === "quarterly" &&
        (!form.paymentScheduleDetails?.quarterlyMonth ||
          !form.paymentScheduleDetails?.quarterlyDay)
      ) {
        setError("Please select both month and day for quarterly payments");
        return;
      }

      if (!form.contractStartDate) {
        setError("Contract Start Date is required");
        return;
      }

      if (!form.includedServices || form.includedServices.length === 0) {
        setError("Please select at least one included service");
        return;
      }

      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      // Clean up undefined values from scheduleDetails and paymentScheduleDetails
      const cleanScheduleDetails = { ...form.scheduleDetails };
      const cleanPaymentScheduleDetails = { ...form.paymentScheduleDetails };

      // Remove undefined values from scheduleDetails
      Object.keys(cleanScheduleDetails).forEach((key) => {
        if (
          cleanScheduleDetails[key as keyof typeof cleanScheduleDetails] ===
          undefined
        ) {
          delete cleanScheduleDetails[key as keyof typeof cleanScheduleDetails];
        }
      });

      // Remove undefined values from paymentScheduleDetails
      Object.keys(cleanPaymentScheduleDetails).forEach((key) => {
        if (
          cleanPaymentScheduleDetails[
            key as keyof typeof cleanPaymentScheduleDetails
          ] === undefined
        ) {
          delete cleanPaymentScheduleDetails[
            key as keyof typeof cleanPaymentScheduleDetails
          ];
        }
      });

      const payload: any = {
        ...form,
        scheduleDetails: cleanScheduleDetails,
        paymentScheduleDetails: cleanPaymentScheduleDetails,
        // Add serviceScheduleDetails for V1 compatibility
        serviceScheduleDetails: cleanScheduleDetails,
        clientId,
        updatedAt: serverTimestamp(),
      };
      if (mode === "create") {
        payload.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, "serviceAgreements"), payload);
        const saved = { ...form, id: ref.id } as AgreementDoc;
        onSaved && onSaved(saved);
      } else if (form.id) {
        await setDoc(doc(db, "serviceAgreements", form.id), payload, {
          merge: true,
        });
        onSaved && onSaved(form);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await deleteDoc(doc(db, "serviceAgreements", form.id));
      onDeleted && onDeleted(form.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    }
  }

  function update<K extends keyof AgreementDoc>(
    key: K,
    value: AgreementDoc[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="card-bg rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 max-w-5xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div className="text-xl font-semibold text-gray-900 dark:text-white">
            {mode === "create" ? "New" : readOnly ? "View" : "Edit"} Service
            Agreement
          </div>
          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
            {mode === "view" && (
              <RoleGuard allow={["owner", "super_admin", "admin"]}>
                <button
                  className="px-4 py-2 text-sm rounded-lg border bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  onClick={() => onModeChange?.("edit")}
                >
                  Edit
                </button>
              </RoleGuard>
            )}
            {mode !== "view" && (
              <button
                className="px-4 py-2 text-sm rounded-lg border bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {form.id && (
              <RoleGuard allow={["super_admin"]}>
                <button
                  className="px-4 py-2 text-sm rounded-lg border bg-red-600 text-white hover:bg-red-700 transition-colors"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </RoleGuard>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-sm text-zinc-500">
              Loading agreement details…
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Basic Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2">
                Basic Information
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LabeledInput
                  label="Agreement Name"
                  value={form.agreementName || ""}
                  readOnly={readOnly}
                  onChange={(v) => update("agreementName", v)}
                />
                <LabeledInput
                  label="Frequency"
                  value={form.frequency || ""}
                  readOnly={readOnly}
                  onChange={(v) => update("frequency", v)}
                />
              </div>

              {/* Service Days Selection */}
              {(form.frequency === "weekly" ||
                form.frequency === "bi-weekly") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Service Days <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      "monday",
                      "tuesday",
                      "wednesday",
                      "thursday",
                      "friday",
                      "saturday",
                      "sunday",
                    ].map((day) => (
                      <label
                        key={day}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={(form.serviceDays || []).includes(day)}
                          disabled={readOnly}
                          onChange={(e) => {
                            const currentDays = form.serviceDays || [];
                            if (e.target.checked) {
                              update("serviceDays", [...currentDays, day]);
                            } else {
                              update(
                                "serviceDays",
                                currentDays.filter((d) => d !== day)
                              );
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm capitalize text-gray-900 dark:text-gray-100">
                          {day}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule Details Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2">
                Schedule Details
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Monthly Day Selection */}
                {form.frequency === "monthly" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Service Day of Month{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.scheduleDetails?.monthlyDay || ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        update("scheduleDetails", {
                          ...form.scheduleDetails,
                          monthlyDay: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select day...</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(
                        (day) => (
                          <option key={day} value={day}>
                            {day}
                            {day === 1
                              ? "st"
                              : day === 2
                              ? "nd"
                              : day === 3
                              ? "rd"
                              : "th"}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                <LabeledInput
                  label="Contract Start Date (YYYY-MM-DD)"
                  value={toDateInput(form.contractStartDate)}
                  readOnly={readOnly}
                  onChange={(v) =>
                    update("contractStartDate", fromDateInput(v))
                  }
                />
                <LabeledInput
                  label="Contract End Date (YYYY-MM-DD)"
                  value={toDateInput(form.contractEndDate)}
                  readOnly={readOnly}
                  onChange={(v) => update("contractEndDate", fromDateInput(v))}
                />
                <LabeledInput
                  label="Renewal Terms"
                  value={form.renewalTerms || ""}
                  readOnly={readOnly}
                  onChange={(v) => update("renewalTerms", v)}
                />
              </div>
            </div>

            {/* Payment Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2">
                Payment Information
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LabeledInput
                  label="Payment Amount ($)"
                  type="number"
                  value={String(form.paymentAmount ?? "")}
                  readOnly={readOnly}
                  onChange={(v) => update("paymentAmount", Number(v))}
                />
                <LabeledInput
                  label="Payment Frequency"
                  value={form.paymentFrequency || ""}
                  readOnly={readOnly}
                  onChange={(v) => update("paymentFrequency", v)}
                />
              </div>

              {/* Payment Schedule Details */}
              {form.paymentFrequency === "monthly" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Payment Day of Month <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.paymentScheduleDetails?.monthlyPaymentDay || ""}
                    disabled={readOnly}
                    onChange={(e) =>
                      update("paymentScheduleDetails", {
                        ...form.paymentScheduleDetails,
                        monthlyPaymentDay: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select day...</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                        {day === 1
                          ? "st"
                          : day === 2
                          ? "nd"
                          : day === 3
                          ? "rd"
                          : "th"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.paymentFrequency === "quarterly" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Quarterly Payment Schedule{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Month
                      </label>
                      <select
                        value={
                          form.paymentScheduleDetails?.quarterlyMonth || ""
                        }
                        disabled={readOnly}
                        onChange={(e) =>
                          update("paymentScheduleDetails", {
                            ...form.paymentScheduleDetails,
                            quarterlyMonth: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select month...</option>
                        <option value="1">January</option>
                        <option value="4">April</option>
                        <option value="7">July</option>
                        <option value="10">October</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Day
                      </label>
                      <select
                        value={form.paymentScheduleDetails?.quarterlyDay || ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          update("paymentScheduleDetails", {
                            ...form.paymentScheduleDetails,
                            quarterlyDay: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select day...</option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(
                          (day) => (
                            <option key={day} value={day}>
                              {day}
                              {day === 1
                                ? "st"
                                : day === 2
                                ? "nd"
                                : day === 3
                                ? "rd"
                                : "th"}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Services Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2">
                Services & Documentation
              </h3>
              <div className="space-y-4">
                {/* Included Services Checkboxes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Included Services <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      "general-cleaning",
                      "deep-cleaning",
                      "floor-buffing",
                      "window-cleaning",
                      "carpet-cleaning",
                      "sanitization",
                      "restroom-cleaning",
                      "kitchen-cleaning",
                      "office-cleaning",
                      "trash-removal",
                      "dusting",
                      "vacuuming",
                    ].map((service) => (
                      <label
                        key={service}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={(form.includedServices || []).includes(
                            service
                          )}
                          disabled={readOnly}
                          onChange={(e) => {
                            const currentServices = form.includedServices || [];
                            if (e.target.checked) {
                              update("includedServices", [
                                ...currentServices,
                                service,
                              ]);
                            } else {
                              update(
                                "includedServices",
                                currentServices.filter((s) => s !== service)
                              );
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm capitalize text-gray-900 dark:text-gray-100">
                          {service.replace("-", " ")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* PDF Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Service Agreement PDF (Optional)
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    disabled={readOnly || saving}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setSaving(true);
                          if (!getApps().length) initializeApp(firebaseConfig);
                          const storage = getStorage();

                          // Create a unique filename
                          const timestamp = Date.now();
                          const fileName = `service-agreements/${clientId}/${timestamp}_${file.name}`;
                          const storageRef = ref(storage, fileName);

                          // Upload the file
                          await uploadBytes(storageRef, file);

                          // Get the download URL
                          const downloadURL = await getDownloadURL(storageRef);

                          // Update the form with the URL
                          update("serviceAgreementUrl", downloadURL);
                        } catch (error) {
                          console.error("Error uploading PDF:", error);
                          setError("Failed to upload PDF file");
                        } finally {
                          setSaving(false);
                        }
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Upload a signed service agreement PDF document
                  </p>
                  {form.serviceAgreementUrl && (
                    <p className="text-sm text-green-600 mt-1">
                      ✓ PDF uploaded successfully
                    </p>
                  )}
                </div>

                <LabeledInput
                  label="Contract URL"
                  value={form.serviceAgreementUrl || ""}
                  readOnly={readOnly}
                  onChange={(v) => update("serviceAgreementUrl", v)}
                />
              </div>
            </div>
            {/* Additional Details Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2">
                Additional Details
              </h3>
              <div className="space-y-4">
                <LabeledTextarea
                  label="Special Instructions"
                  value={form.specialInstructions || ""}
                  readOnly={readOnly}
                  onChange={(v) => update("specialInstructions", v)}
                />

                <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <input
                    id="isActive"
                    type="checkbox"
                    checked={!!form.isActive}
                    disabled={readOnly}
                    onChange={(e) => update("isActive", e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="isActive"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    Active Agreement
                  </label>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  readOnly,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <input
        type={type}
        className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
      />
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <textarea
        className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 card-bg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
      />
    </div>
  );
}

function toDateInput(ts: any): string {
  try {
    const d: Date | null = ts?.toDate
      ? ts.toDate()
      : ts instanceof Date
      ? ts
      : null;
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function fromDateInput(s: string): any {
  if (!s) return undefined;
  const dt = new Date(s + "T00:00:00");
  // Let Firestore convert via serverTimestamp on write if needed; here we return a JS Date
  return dt;
}
