import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type QuickActionsContextValue = {
  requestNewInvoice: () => void;
  consumeNewInvoiceRequest: () => void;
  pendingNewInvoice: boolean;
  newInvoiceRequestedVersion: number;
};

const QuickActionsContext = createContext<QuickActionsContextValue>({
  requestNewInvoice: () => {},
  consumeNewInvoiceRequest: () => {},
  pendingNewInvoice: false,
  newInvoiceRequestedVersion: 0,
});

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [newInvoiceRequestedVersion, setNewInvoiceRequestedVersion] =
    useState(0);
  const [pendingNewInvoice, setPendingNewInvoice] = useState(false);

  const requestNewInvoice = useCallback(() => {
    setPendingNewInvoice(true);
    setNewInvoiceRequestedVersion((v) => v + 1);
  }, []);

  const consumeNewInvoiceRequest = useCallback(() => {
    setPendingNewInvoice(false);
  }, []);

  const value = useMemo(
    () => ({
      requestNewInvoice,
      consumeNewInvoiceRequest,
      pendingNewInvoice,
      newInvoiceRequestedVersion,
    }),
    [
      requestNewInvoice,
      consumeNewInvoiceRequest,
      pendingNewInvoice,
      newInvoiceRequestedVersion,
    ]
  );

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
    </QuickActionsContext.Provider>
  );
}

export function useQuickActions() {
  return useContext(QuickActionsContext);
}
