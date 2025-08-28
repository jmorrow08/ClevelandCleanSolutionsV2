import { useToast } from "../context/ToastContext";

export function useFirestoreErrorHandler() {
  const { show } = useToast();

  function handleFirestoreError(err: unknown) {
    const code = (err as any)?.code;
    if (code === "permission-denied") {
      show({
        title: "Access restricted",
        message: "You are not authorized to access this area.",
        type: "error",
      });
      return;
    }
    const message = String((err as any)?.message ?? err ?? "Unexpected error");
    show({ title: "Error", message, type: "error" });
  }

  return { handleFirestoreError };
}


