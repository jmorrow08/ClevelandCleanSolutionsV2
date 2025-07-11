// src/App.tsx

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

// Import all your existing components from their correct locations
import Login from './pages/Login';
import { LoginScreen as RoleSelector } from './components/LoginScreen';
import ProtectedRoute from './components/ProtectedRoute';
import { AppProvider, useApp } from './contexts/AppContext';
// --- CORRECTED IMPORT PATH ---
import { AdminDashboard } from './components/admin/AdminDashboard';

// This wrapper component handles the logic after a role is selected
const AppRoutes: React.FC = () => {
  const { currentRole } = useApp();

  // If no role has been selected yet, show the role selector screen
  if (!currentRole) {
    return <RoleSelector />;
  }

  // When a role IS selected, show the corresponding component
  switch (currentRole) {
    case 'admin':
      // --- USE THE CORRECT, EXISTING DASHBOARD ---
      return <AdminDashboard />;
    case 'employee':
      // You will create this component later
      return <div>Employee Portal</div>;
    case 'client':
      // You will create this component later
      return <div>Client Portal</div>;
    default:
      // If the role is somehow unknown, go back to the role selector
      return <Navigate to="/" />;
  }
};

// This is the main App component that manages Authentication state
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // This listener checks if a user is logged in or not
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Show a loading message while Firebase checks auth status
  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* The login page is public */}
          <Route path="/login" element={<Login />} />

          {/* All other pages are protected by the ProtectedRoute component */}
          <Route
            path="/*"
            element={
              <ProtectedRoute user={user}>
                <AppRoutes />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;
