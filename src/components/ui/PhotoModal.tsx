import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { ChevronLeft, ChevronRight, Flag, X } from "lucide-react";

type Photo = {
  id: string;
  photoUrl?: string;
  uploadedAt?: any;
  locationId?: string;
  caption?: string;
  notes?: string;
  flagged?: boolean;
};

interface PhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: Photo[];
  currentIndex: number;
  onIndexChange?: (index: number) => void;
}

export default function PhotoModal({
  isOpen,
  onClose,
  photos,
  currentIndex,
  onIndexChange,
}: PhotoModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [showFlagDialog, setShowFlagDialog] = useState(false);

  const currentPhoto = photos[currentIndex];
  const hasMultiplePhotos = photos.length > 1;

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          navigateToPhoto(currentIndex - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          navigateToPhoto(currentIndex + 1);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen, currentIndex, photos.length]);

  const navigateToPhoto = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < photos.length) {
      onIndexChange?.(newIndex);
    }
  };

  const handleFlagPhoto = async () => {
    if (!currentPhoto || !user || !user.email) {
      console.error("Missing required data:", {
        currentPhoto: !!currentPhoto,
        user: !!user,
        email: user?.email,
      });
      alert("Unable to flag photo: Missing user information");
      return;
    }

    try {
      setFlagging(true);
      const db = getFirestore();

      await updateDoc(doc(db, "servicePhotos", currentPhoto.id), {
        flagged: true,
        flagReason: flagReason.trim() || "Flagged by client",
        flaggedAt: serverTimestamp(),
        flaggedByEmail: user.email,
      });

      // Update the local photo state
      photos[currentIndex] = { ...currentPhoto, flagged: true };

      setShowFlagDialog(false);
      setFlagReason("");
      alert(
        "Photo has been flagged for review. An administrator will review it shortly."
      );
    } catch (error: any) {
      console.error("Error flagging photo:", error);
      const errorMessage = error?.message || "Unknown error";
      alert(`Failed to flag photo: ${errorMessage}`);
    } finally {
      setFlagging(false);
    }
  };

  const formatDateTime = (timestamp?: any): string => {
    if (!timestamp) return "";
    const date = timestamp?.toDate
      ? timestamp.toDate()
      : new Date(timestamp.seconds * 1000);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  };

  if (!isOpen || !currentPhoto) return null;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        aria-label="Close modal"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation buttons */}
      {hasMultiplePhotos && (
        <>
          <button
            onClick={() => navigateToPhoto(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={() => navigateToPhoto(currentIndex + 1)}
            disabled={currentIndex === photos.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Main content */}
      <div className="relative max-w-4xl max-h-[90vh] w-full mx-4">
        <img
          src={currentPhoto.photoUrl}
          alt={currentPhoto.caption || "Service photo"}
          className="w-full h-full object-contain rounded-lg"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            console.warn(`Failed to load image: ${currentPhoto.photoUrl}`, e);
            target.src =
              "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg2MFY2MEgyMFYyMFoiIGZpbGw9IiNEMUQ1REIiLz4KPHBhdGggZD0iTTI1IDI1SDU1VjU1SDI1VjI1WiIgZmlsbD0iI0MzRjRGNiIvPgo8Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSI1IiBmaWxsPSIjOUI5QkEwIi8+CjxwYXRoIGQ9Ik0yMCA1NUwzMCA0NUw0MCA1NUw1MCA0NUw2MCA1NVY2MEgyMFY1NVoiIGZpbGw9IiM5QjlCQTAiLz4KPC9zdmc+";
            target.classList.add("opacity-50");
          }}
        />

        {/* Photo info overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
          <div className="text-white">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="opacity-90">
                  {currentPhoto.caption || "Service Photo"}
                </div>
                <div className="text-xs opacity-75 mt-1">
                  {formatDateTime(currentPhoto.uploadedAt)}
                </div>
                {currentPhoto.notes && (
                  <div className="text-xs opacity-75 mt-1 italic">
                    {currentPhoto.notes}
                  </div>
                )}
              </div>

              {/* Flag button */}
              {!currentPhoto.flagged && (
                <button
                  onClick={() => setShowFlagDialog(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                  disabled={flagging}
                >
                  <Flag className="w-4 h-4" />
                  Flag Photo
                </button>
              )}

              {currentPhoto.flagged && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white text-sm rounded-lg">
                  <Flag className="w-4 h-4" />
                  Flagged
                </div>
              )}
            </div>

            {/* Photo counter */}
            {hasMultiplePhotos && (
              <div className="text-xs opacity-75 mt-2 text-center">
                {currentIndex + 1} of {photos.length}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flag reason dialog */}
      {showFlagDialog && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-60">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Flag this photo
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Please provide a reason for flagging this photo. An administrator
              will review it.
            </p>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Describe the issue with this photo..."
              className="w-full p-3 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-gray-900 dark:text-white resize-none"
              rows={3}
            />
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setShowFlagDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700"
                disabled={flagging}
              >
                Cancel
              </button>
              <button
                onClick={handleFlagPhoto}
                disabled={flagging || !flagReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg"
              >
                {flagging ? "Flagging..." : "Flag Photo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
