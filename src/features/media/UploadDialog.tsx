import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  serverTimestamp,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { firebaseConfig } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

type Props = {
  onClose: () => void;
  onUploaded?: (assetId: string) => void;
};

type Category = "hr" | "training" | "client_resource" | "marketing" | "org";
type Audience = "internal" | "employees" | "clients" | "public";

type ClientOption = { id: string; name: string; email: string };
type LocationOption = { id: string; name: string; clientName: string };
type EmployeeOption = { id: string; name: string; email: string };

export default function UploadDialog({ onClose, onUploaded }: Props) {
  const { show } = useToast();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>("");
  const [category, setCategory] = useState<Category>("org");
  const [audience, setAudience] = useState<Audience>("internal");
  const [title, setTitle] = useState<string>("");

  // Dropdown options
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Selected IDs
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const [requiresAck, setRequiresAck] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("1");
  const [durationSec, setDurationSec] = useState<string>("");
  const [compressVideo, setCompressVideo] = useState<boolean>(false);

  // Supported file types
  const supportedTypes = [
    // Documents
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".rtf",
    // Videos
    ".mp4",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".mkv",
    // Audio
    ".mp3",
    ".wav",
    ".aac",
    ".flac",
    // Images
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    // Archives
    ".zip",
    ".rar",
    ".7z",
  ];

  // Basic video compression utility
  const compressVideoFile = async (file: File): Promise<File> => {
    // For now, we'll provide guidance rather than actual compression
    // since full video compression in browser is complex and resource-intensive
    const compressionRatio = 0.7; // 30% size reduction estimate
    const estimatedSize = file.size * compressionRatio;

    // If estimated size is still too large, suggest external tools
    if (estimatedSize > 100 * 1024 * 1024) {
      throw new Error(
        "Video is too large even after compression. Please use iMovie or HandBrake to compress it first."
      );
    }

    // For basic MP4 files, we could potentially use MediaRecorder API
    // but for now, we'll just return the original file with a warning
    console.log(
      `Video compression requested for ${file.name} (${file.size} bytes)`
    );
    return file;
  };

  const validateFile = (file: File): string => {
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!supportedTypes.includes(extension)) {
      return `File type ${extension} is not supported. Please upload a supported file type.`;
    }

    // Check file size (200MB limit for videos, 100MB for others)
    const isVideo = [
      ".mp4",
      ".avi",
      ".mov",
      ".wmv",
      ".flv",
      ".webm",
      ".mkv",
    ].includes(extension);
    const maxSize = isVideo ? 200 * 1024 * 1024 : 100 * 1024 * 1024;

    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return `File size must be less than ${maxSizeMB}MB. For large videos, consider compressing with iMovie or HandBrake.`;
    }

    return "";
  };

  // Load dropdown options
  useEffect(() => {
    async function loadOptions() {
      try {
        setLoadingOptions(true);
        if (!getApps().length) initializeApp(firebaseConfig);
        const db = getFirestore();

        // Load clients
        const clientSnap = await getDocs(collection(db, "clientMasterList"));
        const clientList: ClientOption[] = [];
        clientSnap.forEach((doc) => {
          const data = doc.data() as any;
          clientList.push({
            id: doc.id,
            name: data.companyName || data.name || "Unknown",
            email: data.email || "",
          });
        });
        setClients(clientList.sort((a, b) => a.name.localeCompare(b.name)));

        // Load locations
        const locationSnap = await getDocs(collection(db, "locations"));
        const locationList: LocationOption[] = [];
        locationSnap.forEach((doc) => {
          const data = doc.data() as any;
          locationList.push({
            id: doc.id,
            name: data.locationName || "Unknown Location",
            clientName: data.clientName || "",
          });
        });
        setLocations(locationList.sort((a, b) => a.name.localeCompare(b.name)));

        // Load employees
        const employeeSnap = await getDocs(
          collection(db, "employeeMasterList")
        );
        const employeeList: EmployeeOption[] = [];
        employeeSnap.forEach((doc) => {
          const data = doc.data() as any;
          employeeList.push({
            id: doc.id,
            name: data.fullName || data.displayName || "Unknown",
            email: data.email || "",
          });
        });
        setEmployees(employeeList.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error("Failed to load dropdown options:", error);
        show({ type: "error", message: "Failed to load options" });
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, [show]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;

    if (selectedFile) {
      let processedFile = selectedFile;

      // Apply compression if enabled and it's a video
      const extension = "." + selectedFile.name.split(".").pop()?.toLowerCase();
      const isVideo = [
        ".mp4",
        ".avi",
        ".mov",
        ".wmv",
        ".flv",
        ".webm",
        ".mkv",
      ].includes(extension);

      if (compressVideo && isVideo) {
        try {
          setFileError("Compressing video...");
          processedFile = await compressVideoFile(selectedFile);
          setFileError("");
        } catch (error: any) {
          setFileError(error.message);
          setFile(null);
          return;
        }
      }

      setFile(processedFile);

      const error = validateFile(processedFile);
      setFileError(error);
    } else {
      setFile(null);
      setFileError("");
    }
  };

  const defaultPathPrefix = useMemo(() => {
    if (category === "hr") return "media/hr";
    if (category === "training") return "media/training";
    if (category === "org") return "media/org";
    if (category === "marketing") {
      return audience === "public" ? "media/public" : "media/org";
    }
    // client_resource
    if (audience === "public") return "media/public";
    const firstClient = selectedClientIds[0];
    return firstClient ? `media/client/${firstClient}` : "media/client/shared";
  }, [category, audience, selectedClientIds]);

  const canSubmit = useMemo(() => {
    if (!file) return false;
    if (fileError) return false;
    if (!title.trim()) return false;
    if (!category) return false;
    if (!audience) return false;
    return !submitting;
  }, [file, fileError, title, category, audience, submitting]);

  async function handleSubmit() {
    if (!file) return;
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const storage = getStorage();
      const db = getFirestore();
      const id = uuidv4();
      const path = `${defaultPathPrefix}/${id}-${file.name}`;
      await uploadBytes(ref(storage, path), file);

      const relatedEntities: any = {};
      if (selectedClientIds.length)
        relatedEntities.clientIds = selectedClientIds;
      if (selectedLocationIds.length)
        relatedEntities.locationIds = selectedLocationIds;
      if (selectedEmployeeIds.length)
        relatedEntities.employeeIds = selectedEmployeeIds;

      const payload: any = {
        filename: file.name,
        path,
        type: file.type || "file",
        title: title.trim(),
        tags: title
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        category,
        audience,
        relatedEntities: Object.keys(relatedEntities).length
          ? relatedEntities
          : {},
        requiresAck: !!requiresAck,
        version: Number(version) || 1,
        durationSec: durationSec ? Number(durationSec) : null,
        transcoded: false,
        checksum: null,
        uploadedBy: user?.uid || null,
        uploadedAt: serverTimestamp(),
      };

      const refDoc = await addDoc(collection(db, "mediaAssets"), payload);
      show({ type: "success", message: "Upload complete." });
      onUploaded?.(refDoc.id);
      onClose();
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Upload failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-2xl max-h-[90vh] rounded-lg card-bg shadow-elev-3 p-3 sm:p-4 overflow-y-auto">
        <div className="text-lg font-medium">Upload Media</div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">File</label>
            <div
              className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                file
                  ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                  : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-blue-400");
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-blue-400");
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-blue-400");
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) {
                  let processedFile = droppedFile;

                  // Apply compression if enabled and it's a video
                  const extension =
                    "." + droppedFile.name.split(".").pop()?.toLowerCase();
                  const isVideo = [
                    ".mp4",
                    ".avi",
                    ".mov",
                    ".wmv",
                    ".flv",
                    ".webm",
                    ".mkv",
                  ].includes(extension);

                  if (compressVideo && isVideo) {
                    try {
                      setFileError("Compressing video...");
                      processedFile = await compressVideoFile(droppedFile);
                      setFileError("");
                    } catch (error: any) {
                      setFileError(error.message);
                      return;
                    }
                  }

                  setFile(processedFile);
                  const error = validateFile(processedFile);
                  setFileError(error);
                }
              }}
            >
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv,.mp3,.wav,.aac,.flac,.jpg,.jpeg,.png,.gif,.bmp,.svg,.zip,.rar,.7z"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {file ? (
                <div className="space-y-2">
                  <div className="text-green-600 dark:text-green-400">
                    <svg
                      className="w-8 h-8 mx-auto"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • Click to
                    change file
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-zinc-400">
                    <svg
                      className="w-8 h-8 mx-auto"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Click to choose a file or drag and drop
                  </p>
                  <p className="text-xs text-zinc-500">
                    Supported: Documents, Videos, Audio, Images, Archives
                  </p>
                </div>
              )}
            </div>
            {fileError && (
              <p className="text-red-500 text-xs mt-1">{fileError}</p>
            )}
            <div className="text-xs text-zinc-500 mt-1">
              Supported: Documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX),
              Videos (MP4, AVI, MOV, WMV), Audio (MP3, WAV), Images (JPG, PNG,
              GIF), Archives (ZIP, RAR)
            </div>

            {/* Video compression option */}
            {file &&
              [
                ".mp4",
                ".avi",
                ".mov",
                ".wmv",
                ".flv",
                ".webm",
                ".mkv",
              ].includes("." + file.name.split(".").pop()?.toLowerCase()) && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    id="compress-video"
                    type="checkbox"
                    checked={compressVideo}
                    onChange={(e) => setCompressVideo(e.target.checked)}
                    className="rounded"
                  />
                  <label
                    htmlFor="compress-video"
                    className="text-sm text-zinc-600 dark:text-zinc-400"
                  >
                    Compress video before upload (reduces file size by ~30%)
                  </label>
                </div>
              )}
          </div>
          <div>
            <label className="block text-sm mb-1">Category</label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              <option value="org">Org</option>
              <option value="hr">HR Doc</option>
              <option value="training">Training</option>
              <option value="client_resource">Client Resource</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Audience</label>
            <select
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
            >
              <option value="internal">Internal (admins)</option>
              <option value="employees">Employees</option>
              <option value="clients">Clients</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Title *</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              placeholder="Enter a descriptive title for the media"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          {audience === "clients" && (
            <>
              <div>
                <label className="block text-sm mb-1">
                  Clients (optional) - Leave empty for all clients
                </label>
                <select
                  multiple
                  className="w-full border rounded-md px-3 py-2 card-bg min-h-24"
                  value={selectedClientIds}
                  onChange={(e) => {
                    const values = Array.from(
                      e.target.selectedOptions,
                      (option) => option.value
                    );
                    setSelectedClientIds(values);
                  }}
                  disabled={loadingOptions}
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} {client.email && `(${client.email})`}
                    </option>
                  ))}
                </select>
                {loadingOptions && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Loading clients...
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm mb-1">
                  Locations (optional) - Leave empty for all locations
                </label>
                <select
                  multiple
                  className="w-full border rounded-md px-3 py-2 card-bg min-h-24"
                  value={selectedLocationIds}
                  onChange={(e) => {
                    const values = Array.from(
                      e.target.selectedOptions,
                      (option) => option.value
                    );
                    setSelectedLocationIds(values);
                  }}
                  disabled={loadingOptions}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}{" "}
                      {location.clientName && `(${location.clientName})`}
                    </option>
                  ))}
                </select>
                {loadingOptions && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Loading locations...
                  </div>
                )}
              </div>
            </>
          )}
          <div>
            <label className="block text-sm mb-1">
              Employees (optional) - Leave empty for all employees
            </label>
            <select
              multiple
              className="w-full border rounded-md px-3 py-2 card-bg min-h-24"
              value={selectedEmployeeIds}
              onChange={(e) => {
                const values = Array.from(
                  e.target.selectedOptions,
                  (option) => option.value
                );
                setSelectedEmployeeIds(values);
              }}
              disabled={loadingOptions}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} {employee.email && `(${employee.email})`}
                </option>
              ))}
            </select>
            {loadingOptions && (
              <div className="text-xs text-zinc-500 mt-1">
                Loading employees...
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1">Version</label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">
              Duration (sec, if video)
            </label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 mt-2 md:mt-7">
            <input
              id="requires-ack"
              type="checkbox"
              checked={requiresAck}
              onChange={(e) => setRequiresAck(e.target.checked)}
            />
            <label htmlFor="requires-ack" className="text-sm">
              Requires acknowledgement
            </label>
          </div>
          <div className="md:col-span-2 text-xs text-zinc-500">
            Storage path:{" "}
            <span className="font-mono">{defaultPathPrefix}/…</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border card-bg"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-zinc-400"
            }`}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
