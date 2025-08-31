import { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  getDoc,
  doc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  validateImageFile,
  generateUniqueFilename,
} from "../../utils/imageUtils";

type LocationItem = { id: string; locationName?: string | null };
type TimeEntry = {
  id: string;
  locationId: string;
  locationName?: string | null;
};

// Upload configuration
const UPLOAD_CONFIG = {
  MAX_FILES_PER_BATCH: 5, // Limit concurrent uploads
  MAX_FILE_SIZE_MB: 10, // Maximum file size before compression
  COMPRESSION_QUALITY: 0.8, // JPEG compression quality
  MAX_WIDTH: 1920, // Maximum image width
  MAX_HEIGHT: 1080, // Maximum image height
  RETRY_ATTEMPTS: 3, // Number of retry attempts for failed uploads
  RETRY_DELAY_MS: 1000, // Delay between retries
};

// Image compression utility
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    // Skip compression for non-image files or small files
    if (
      !file.type.startsWith("image/") ||
      file.size < UPLOAD_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024
    ) {
      resolve(file);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      if (
        width > UPLOAD_CONFIG.MAX_WIDTH ||
        height > UPLOAD_CONFIG.MAX_HEIGHT
      ) {
        const ratio = Math.min(
          UPLOAD_CONFIG.MAX_WIDTH / width,
          UPLOAD_CONFIG.MAX_HEIGHT / height
        );
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error("Failed to compress image"));
            }
          },
          file.type,
          UPLOAD_CONFIG.COMPRESSION_QUALITY
        );
      } else {
        reject(new Error("Failed to get canvas context"));
      }
    };

    img.onerror = () =>
      reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}

// Upload with retry logic
async function uploadWithRetry(
  storageRef: any,
  file: File,
  retryCount = 0
): Promise<string> {
  try {
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (error) {
    if (retryCount < UPLOAD_CONFIG.RETRY_ATTEMPTS) {
      console.warn(
        `Upload failed, retrying (${retryCount + 1}/${
          UPLOAD_CONFIG.RETRY_ATTEMPTS
        }):`,
        error
      );
      await new Promise((resolve) =>
        setTimeout(resolve, UPLOAD_CONFIG.RETRY_DELAY_MS)
      );
      return uploadWithRetry(storageRef, file, retryCount + 1);
    }
    throw error;
  }
}

export default function UploadPhotos() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [activeTimeEntryId, setActiveTimeEntryId] = useState<string | null>(
    null
  );
  const [isClockedIn, setIsClockedIn] = useState<boolean>(false);
  const [activeLocationName, setActiveLocationName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  }>({ current: 0, total: 0, currentFile: "" });
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      // First, load locations
      const locationsList: LocationItem[] = [];
      try {
        const qLoc = query(
          collection(db, "locations"),
          where("status", "==", true),
          orderBy("locationName", "asc")
        );
        const snap = await getDocs(qLoc);
        snap.forEach((d) =>
          locationsList.push({ id: d.id, ...(d.data() as any) })
        );
        setLocations(locationsList);
      } catch (error) {
        console.error("Failed to load locations:", error);
      }

      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        // Resolve profile & display name
        const us = await getDoc(doc(db, "users", user.uid));
        if (us.exists()) {
          const u = us.data() as any;
          const profileIdValue =
            typeof u.profileId === "string" ? u.profileId : null;
          setProfileId(profileIdValue);
          const name =
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
            user.displayName ||
            user.email ||
            "Employee";
          setEmployeeName(name);

          // Check if employee is currently clocked in
          if (profileIdValue) {
            const timeEntryQuery = query(
              collection(db, "employeeTimeTracking"),
              where("employeeProfileId", "==", profileIdValue),
              where("clockOutTime", "==", null),
              orderBy("clockInTime", "desc"),
              limit(1)
            );
            const timeEntrySnap = await getDocs(timeEntryQuery);

            if (!timeEntrySnap.empty) {
              const timeEntry = timeEntrySnap.docs[0];
              const timeEntryData = timeEntry.data() as TimeEntry;
              setActiveTimeEntryId(timeEntry.id);
              setIsClockedIn(true);
              setSelectedLocationId(timeEntryData.locationId);

              // Get location name for display - now using the loaded locationsList
              const locationName =
                locationsList.find((l) => l.id === timeEntryData.locationId)
                  ?.locationName ||
                timeEntryData.locationName ||
                "Unknown Location";
              setActiveLocationName(locationName);
            } else {
              setIsClockedIn(false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
      }
      setLoading(false);
    })();
  }, [user?.uid]);

  const locationName = useMemo(
    () =>
      locations.find((l) => l.id === selectedLocationId)?.locationName || null,
    [locations, selectedLocationId]
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length) {
      // Validate files using utility function
      const validFiles = selected.filter((file) => {
        const validation = validateImageFile(file);
        if (!validation.valid) {
          setMessage(validation.error || `File ${file.name} is invalid.`);
          return false;
        }
        return true;
      });

      if (validFiles.length !== selected.length) {
        // Clear the invalid files from the input
        if (e.target === cameraInputRef.current && cameraInputRef.current) {
          cameraInputRef.current.value = "";
        } else if (
          e.target === galleryInputRef.current &&
          galleryInputRef.current
        ) {
          galleryInputRef.current.value = "";
        }
        return;
      }

      setFiles((prev) => prev.concat(validFiles));
    }

    // Clear the input value to allow selecting the same file again
    if (e.target === cameraInputRef.current) {
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } else if (e.target === galleryInputRef.current) {
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!user?.uid || !profileId) {
      setMessage("Auth error. Please log in again.");
      return;
    }
    if (!selectedLocationId) {
      setMessage("Please select a location.");
      return;
    }
    if (files.length === 0) {
      setMessage("No photos selected.");
      return;
    }

    setIsUploading(true);
    setMessage("Preparing uploads...");
    setProgress("");
    setUploadProgress({ current: 0, total: files.length, currentFile: "" });

    const storage = getStorage();
    const db = getFirestore();

    try {
      const results: Array<{ url: string; original: string }> = [];
      const totalFiles = files.length;

      // Process files in batches
      for (
        let batchStart = 0;
        batchStart < totalFiles;
        batchStart += UPLOAD_CONFIG.MAX_FILES_PER_BATCH
      ) {
        const batch = files.slice(
          batchStart,
          batchStart + UPLOAD_CONFIG.MAX_FILES_PER_BATCH
        );

        setMessage(
          `Processing batch ${
            Math.floor(batchStart / UPLOAD_CONFIG.MAX_FILES_PER_BATCH) + 1
          }...`
        );

        // Compress images in parallel
        const compressedFiles = await Promise.all(
          batch.map(async (file) => {
            try {
              return await compressImage(file);
            } catch (error) {
              console.warn(
                `Failed to compress ${file.name}, using original:`,
                error
              );
              return file;
            }
          })
        );

        // Upload batch in parallel
        const batchPromises = compressedFiles.map(async (file, index) => {
          const fileIndex = batchStart + index;
          const uniqueFilename = generateUniqueFilename(file.name, user.uid);
          const path = `employeeUploads/${user.uid}/${uniqueFilename}`;
          const storageRef = ref(storage, path);

          setUploadProgress({
            current: fileIndex + 1,
            total: totalFiles,
            currentFile: file.name,
          });

          try {
            const url = await uploadWithRetry(storageRef, file);
            setProgress(
              `Uploaded ${fileIndex + 1}/${totalFiles}: ${file.name}`
            );
            return { url, original: file.name };
          } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
            throw error;
          }
        });

        // Wait for current batch to complete
        const batchResults = await Promise.allSettled(batchPromises);

        // Process results
        batchResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            console.error(
              `Failed to upload ${batch[index].name}:`,
              result.reason
            );
          }
        });
      }

      if (results.length === 0) {
        throw new Error("No files were successfully uploaded.");
      }

      setMessage(`Saving metadata for ${results.length} photos...`);

      // Save metadata in batches
      const location = isClockedIn ? activeLocationName : locationName;
      const metadataWrites = results.map((res) =>
        addDoc(collection(db, "servicePhotos"), {
          photoUrl: res.url,
          originalFileName: res.original,
          locationId: selectedLocationId,
          locationName: location,
          employeeProfileId: profileId,
          employeeName,
          uploadedAt: serverTimestamp(),
          timeEntryId: activeTimeEntryId || null,
          notes: notes ? notes : null,
        })
      );

      await Promise.all(metadataWrites);

      setMessage(
        `Upload complete! ${results.length}/${totalFiles} photos uploaded successfully.`
      );
      setFiles([]);
      setNotes("");
      setProgress("");
      setUploadProgress({ current: 0, total: 0, currentFile: "" });
    } catch (e: any) {
      console.error("Upload error:", e);
      setMessage(e?.message || "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Upload Photos</h1>
        <div className="rounded-lg p-4 card-bg shadow-elev-1">
          <div className="text-sm text-zinc-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Upload Photos</h1>
      <div className="rounded-lg p-4 card-bg shadow-elev-1 space-y-3">
        {isClockedIn ? (
          <div className="text-sm">
            <div className="text-xs text-zinc-500 mb-1">Current Location</div>
            <div className="px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">{activeLocationName}</span>
                <span className="text-xs">(Clocked In)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <div className="text-xs text-zinc-500 mb-1">Select location</div>
            <select
              className="w-full px-3 py-2 rounded-md border card-bg"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              disabled={isUploading}
            >
              <option value="">
                {locations.length
                  ? "-- Select a Location --"
                  : "-- Loading Locations --"}
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.locationName || l.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label
            className={`px-3 py-2 rounded-md text-center cursor-pointer text-sm ${
              isUploading
                ? "bg-zinc-400 text-zinc-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            <i className="fas fa-camera mr-2"></i>
            Take Photo
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPick}
              disabled={isUploading}
            />
          </label>
          <label
            className={`px-3 py-2 rounded-md text-center cursor-pointer text-sm ${
              isUploading
                ? "bg-zinc-400 text-zinc-600 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            <i className="fas fa-images mr-2"></i>
            Choose Photos
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPick}
              disabled={isUploading}
            />
          </label>
        </div>
        <div className="px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900 text-sm">
          {files.length ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Selected ({files.length})</span>
                <button
                  onClick={() => setFiles([])}
                  disabled={isUploading}
                  className="text-xs text-red-600 hover:text-red-700 disabled:text-zinc-400"
                >
                  Clear All
                </button>
              </div>
              <div className="text-xs text-zinc-500">
                Max {UPLOAD_CONFIG.MAX_FILES_PER_BATCH} files per batch • Max
                50MB per file
              </div>
              <div className="max-h-20 overflow-y-auto space-y-1">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between"
                  >
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-zinc-500 ml-2">
                      ({(file.size / (1024 * 1024)).toFixed(1)}MB)
                    </span>
                    <button
                      onClick={() =>
                        setFiles(files.filter((_, i) => i !== index))
                      }
                      disabled={isUploading}
                      className="text-red-500 hover:text-red-600 disabled:text-zinc-400 ml-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            "No files selected"
          )}
        </div>

        {/* Upload Progress */}
        {isUploading && uploadProgress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>
                Uploading {uploadProgress.current}/{uploadProgress.total}
              </span>
              <span>
                {Math.round(
                  (uploadProgress.current / uploadProgress.total) * 100
                )}
                %
              </span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    (uploadProgress.current / uploadProgress.total) * 100
                  }%`,
                }}
              ></div>
            </div>
            {uploadProgress.currentFile && (
              <div className="text-xs text-zinc-500 truncate">
                Current: {uploadProgress.currentFile}
              </div>
            )}
          </div>
        )}

        <div className="text-sm">
          <div className="text-xs text-zinc-500 mb-1">
            Photo Notes (optional)
          </div>
          <textarea
            rows={3}
            className="w-full px-3 py-2 rounded-md border card-bg"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:bg-zinc-400 disabled:cursor-not-allowed"
            disabled={!selectedLocationId || files.length === 0 || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Uploading...
              </>
            ) : (
              `Submit Selected Photos (${files.length})`
            )}
          </button>
          {progress && !isUploading ? (
            <div className="text-xs text-zinc-500">{progress}</div>
          ) : null}
        </div>

        {message ? (
          <div
            className={`text-sm p-2 rounded-md ${
              message.includes("complete") || message.includes("success")
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
                : message.includes("error") || message.includes("failed")
                ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
                : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800"
            }`}
          >
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
