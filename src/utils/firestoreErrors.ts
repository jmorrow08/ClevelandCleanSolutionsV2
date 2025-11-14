import { useToast } from "../context/ToastContext";

export function useFirestoreErrorHandler() {
  const { show } = useToast();

  function handleFirestoreError(err: unknown, context?: string) {
    const code = (err as any)?.code;
    if (code === "permission-denied") {
      // Only show authorization message if we have context suggesting this is a route-level access issue
      // For general data access issues, show a more generic message
      if (context === "route-access" || context === "admin-access") {
        show({
          title: "Access restricted",
          message: "You are not authorized to access this area.",
          type: "error",
        });
      } else {
        show({
          title: "Access restricted",
          message: "You don't have permission to access this data.",
          type: "error",
        });
      }
      return;
    }
    const message = String((err as any)?.message ?? err ?? "Unexpected error");
    show({ title: "Error", message, type: "error" });
  }

  return { handleFirestoreError };
}
