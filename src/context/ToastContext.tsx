import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Toast = {
  id: string;
  title?: string;
  message: string;
  type?: "info" | "success" | "error";
};

type ToastContextValue = {
  toasts: Toast[];
  show: (t: Omit<Toast, "id">, id?: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  show: () => {},
  dismiss: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // track recent keys to avoid duplicates in a short timeframe
  const recentKeys = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (t: Omit<Toast, "id">, forcedId?: string) => {
      const type = t.type ?? "error";
      const key = `${type}::${t.title ?? ""}::${t.message}`;
      const now = Date.now();

      // de-duplicate identical messages for 4s
      const last = recentKeys.current.get(key);
      if (last && now - last < 4000) return;
      recentKeys.current.set(key, now);

      const id = forcedId ?? Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, ...t, type }]);

      // auto-dismiss after 4s
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-3 shadow-elev-2 text-sm bg-white dark:bg-zinc-800 border ${
              t.type === "error"
                ? "border-red-300 text-red-700 dark:border-red-500 dark:text-red-300"
                : t.type === "success"
                ? "border-green-300 text-green-700 dark:border-green-500 dark:text-green-300"
                : "border-zinc-200 text-zinc-800 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {t.title && <div className="font-medium">{t.title}</div>}
            <div>{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
