// src/components/ProtectedRoute.tsx

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { User } from 'firebase/auth';

interface ProtectedRouteProps {
  user: User | null;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ user }) => {
  if (!user) {
    // If no user is authenticated, redirect them to the login page.
    return <Navigate to="/login" replace />;
  }

  // If the user is authenticated, allow access to the nested routes (the portals).
  return <Outlet />;
};

export default ProtectedRoute;
