import { ErrorBoundary } from "./app/ErrorBoundary";
import { AppRouter } from "./app/router";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ToastProvider } from "./context/ToastContext";
import { QuickActionsProvider } from "./context/QuickActionsContext";
import { NewClientProvider } from "./features/crm/NewClientModal";
import { NewLocationProvider } from "./features/crm/NewLocationModal";
import { useFavicon } from "./hooks/useFavicon";
import { getFirebaseApp } from "./services/firebase";
import "./index.css";
import { AppConfigProvider } from "./config/appConfig";

// Component to handle favicon updates
function FaviconManager() {
  useFavicon();
  return null;
}

export default function App() {
  // Initialize Firebase immediately when the app starts
  getFirebaseApp();

  return (
    <ErrorBoundary>
      <AppConfigProvider>
        <AuthProvider>
          <SettingsProvider>
            <FaviconManager />
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
      </AppConfigProvider>
    </ErrorBoundary>
  );
}
