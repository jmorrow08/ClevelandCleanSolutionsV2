import React from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { LoginScreen } from './components/LoginScreen';
import { AdminPortal } from './components/admin/AdminPortal';
import { ClientPortal } from './components/client/ClientPortal';
import { EmployeePortal } from './components/employee/EmployeePortal';

const AppContent: React.FC = () => {
  const { currentRole } = useApp();

  if (!currentRole) {
    return <LoginScreen />;
  }

  switch (currentRole) {
    case 'admin':
      return <AdminPortal />;
    case 'client':
      return <ClientPortal />;
    case 'employee':
      return <EmployeePortal />;
    default:
      return <LoginScreen />;
  }
};

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-background font-sans">
        <AppContent />
      </div>
    </AppProvider>
  );
}

export default App;