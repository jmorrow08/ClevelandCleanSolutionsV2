import { ErrorBoundary } from "./app/ErrorBoundary";
import { AppRouter } from "./app/router";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ToastProvider } from "./context/ToastContext";
import { QuickActionsProvider } from "./context/QuickActionsContext";
import { ScheduleJobProvider } from "./features/scheduling/ScheduleJobModal";
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
              <ScheduleJobProvider>
                <NewClientProvider>
                  <NewLocationProvider>
                    <AppRouter />
                  </NewLocationProvider>
                </NewClientProvider>
              </ScheduleJobProvider>
            </QuickActionsProvider>
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
