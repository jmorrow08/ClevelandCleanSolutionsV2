import { useState } from "react";
import {
  getAuth,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Eye, EyeOff, Lock } from "lucide-react";

export default function PasswordChange() {
  const { user } = useAuth();
  const { show } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.email) {
      show({ type: "error", message: "User email not available" });
      return;
    }

    if (newPassword.length < 6) {
      show({
        type: "error",
        message: "New password must be at least 6 characters",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      show({ type: "error", message: "New passwords do not match" });
      return;
    }

    setLoading(true);
    try {
      const auth = getAuth();

      // Re-authenticate user before changing password
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      show({ type: "success", message: "Password updated successfully" });

      // Clear form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error updating password:", error);
      if (error.code === "auth/wrong-password") {
        show({ type: "error", message: "Current password is incorrect" });
      } else if (error.code === "auth/weak-password") {
        show({ type: "error", message: "New password is too weak" });
      } else {
        show({
          type: "error",
          message: "Failed to update password. Please try again.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5" />
        <h3 className="font-medium">Change Password</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Current Password
          </label>
          <div className="flex items-center gap-2">
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="border rounded-md px-3 py-2 card-bg flex-1"
              placeholder="Enter current password"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="px-3 py-2 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700"
            >
              {showCurrent ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            New Password (min. 6 characters)
          </label>
          <div className="flex items-center gap-2">
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border rounded-md px-3 py-2 card-bg flex-1"
              placeholder="Enter new password"
              minLength={6}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="px-3 py-2 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700"
            >
              {showNew ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Confirm New Password
          </label>
          <div className="flex items-center gap-2">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="border rounded-md px-3 py-2 card-bg flex-1"
              placeholder="Confirm new password"
              minLength={6}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="px-3 py-2 rounded-md text-sm bg-zinc-200 dark:bg-zinc-700"
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
