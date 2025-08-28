import { ErrorBoundary } from "./app/ErrorBoundary";
import { AppRouter } from "./app/router";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ToastProvider } from "./context/ToastContext";
import { QuickActionsProvider } from "./context/QuickActionsContext";
import { NewClientProvider } from "./features/crm/NewClientModal";
import { NewLocationProvider } from "./features/crm/NewLocationModal";
import "./index.css";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <ToastProvider>
            <QuickActionsProvider>
              <NewClientProvider>
                <NewLocationProvider>
                  <AppRouter />
                </NewLocationProvider>
              </NewClientProvider>
            </QuickActionsProvider>
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
