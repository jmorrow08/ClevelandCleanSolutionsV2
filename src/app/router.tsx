import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./AppLayout";
import ProtectedRoute from "./ProtectedRoute";
import AdminDashboard from "../features/dashboard/AdminDashboard";
import EmployeeHome from "../features/employee/EmployeeHome";
import MyJobs from "../features/employee/MyJobs";
import UploadPhotos from "../features/employee/UploadPhotos";
import MyPhotos from "../features/employee/MyPhotos";
import JobNotes from "../features/employee/JobNotes";
import PayrollPage from "../features/employee/PayrollPage";
import EmployeeSettings from "../features/employee/EmployeeSettings";

import ClientHome from "../features/client/ClientHome";
import InvoicesPage from "../features/client/InvoicesPage";
import SupportPage from "../features/client/SupportPage";
import ProfilePage from "../features/client/ProfilePage";
import ServicesPage from "../features/client/ServicesPage";
import FinanceHub from "../features/finance/FinanceHub";
import SchedulingPage from "../features/scheduling/SchedulingPage";
import DispatchPage from "../features/scheduling/DispatchPage";
import ServiceHistoryPage from "../features/serviceHistory/ServiceHistoryPage";
import JobDetail from "../features/serviceHistory/JobDetail";
import AnalyticsDashboard from "../features/analytics/AnalyticsDashboard";
import Reports from "../features/analytics/Reports";
import SupportList from "../features/support/SupportList";
import SupportDetail from "../features/support/SupportDetail";
import SupportCenterLayout from "../features/support/SupportCenterLayout";
import SupportFlaggedPhotos from "../features/support/SupportFlaggedPhotos";
import SupportClientReviews from "../features/support/SupportClientReviews";
import Login from "../features/auth/Login";
import Logout from "../features/auth/Logout";
import LeadsPage from "../features/crm/LeadsPage";
import CampaignsPage from "../features/marketing/CampaignsPage";
import MediaLibraryPage from "../features/media/MediaLibraryPage";
import AssetDetail from "../features/media/AssetDetail";
import OrgSettings from "../features/settings/OrgSettings";
import AuditLog from "../features/audit/AuditLog";
import { RoleGuard } from "../context/RoleGuard";
import HRPage from "../features/hr/HRPage";
import EmployeeDetail from "../features/hr/EmployeeDetail";
import ClientDetail from "../features/crm/ClientDetail";
import LocationDetail from "../features/crm/LocationDetail";
import ClientsList from "../features/crm/ClientsList";
import PayrollRunDetail from "../features/finance/PayrollRunDetail";
import InventoryList from "../features/inventory/InventoryList";
import InventoryDetail from "../features/inventory/InventoryDetail";
import Social from "../features/marketing/Social";
import TrainingAdmin from "../features/training/TrainingAdmin";
import EmployeeKnowledge from "../features/training/EmployeeKnowledge";
import ClientResources from "../features/training/ClientResources";
import NotificationsCenter from "../features/notifications/NotificationsCenter";
import Validator from "../features/tools/Validator";
import RoleManager from "../features/tools/RoleManager";

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/login", element: <Login /> },
      // Admin app routes (admin | owner | super_admin)
      {
        element: <ProtectedRoute requireRole="admin-or-above" />,
        children: [
          { path: "/", element: <AdminDashboard /> },
          { path: "/finance", element: <FinanceHub /> },
          { path: "/finance/payroll/:id", element: <PayrollRunDetail /> },
          { path: "/finance/payroll-prep", element: <FinanceHub /> },
          { path: "/scheduling", element: <SchedulingPage /> },
          { path: "/scheduling/dispatch", element: <DispatchPage /> },
          { path: "/service-history", element: <ServiceHistoryPage /> },
          { path: "/service-history/:jobId", element: <JobDetail /> },
          { path: "/analytics", element: <AnalyticsDashboard /> },
          { path: "/analytics/reports", element: <Reports /> },
          {
            path: "/support",
            element: <SupportCenterLayout />,
            children: [
              { index: true, element: <SupportList /> },
              { path: "flagged", element: <SupportFlaggedPhotos /> },
              { path: "reviews", element: <SupportClientReviews /> },
              { path: ":id", element: <SupportDetail /> },
            ],
          },
          { path: "/crm", element: <LeadsPage /> },
          { path: "/crm/clients", element: <ClientsList /> },
          { path: "/crm/clients/:id", element: <ClientDetail /> },
          { path: "/crm/locations/:id", element: <LocationDetail /> },
          { path: "/marketing", element: <CampaignsPage /> },
          { path: "/marketing/social", element: <Social /> },
          { path: "/media", element: <MediaLibraryPage /> },
          { path: "/media/:assetId", element: <AssetDetail /> },
          { path: "/training/admin", element: <TrainingAdmin /> },
          {
            path: "/hr",
            element: (
              <RoleGuard allow={["owner", "admin", "super_admin"]}>
                <HRPage />
              </RoleGuard>
            ),
          },
          { path: "/hr/:id", element: <EmployeeDetail /> },
          { path: "/settings", element: <OrgSettings /> },
          {
            path: "/settings/audit",
            element: (
              <RoleGuard allow={["super_admin", "owner", "admin"]}>
                <AuditLog />
              </RoleGuard>
            ),
          },
          { path: "/inventory", element: <InventoryList /> },
          { path: "/inventory/:id", element: <InventoryDetail /> },
          { path: "/notifications", element: <NotificationsCenter /> },
          { path: "/tools/validator", element: <Validator /> },
          {
            path: "/tools/role-manager",
            element: (
              <RoleGuard allow={["super_admin"]}>
                <RoleManager />
              </RoleGuard>
            ),
          },
        ],
      },

      // Employee portal (employee | owner) — explicitly exclude admin/super_admin
      {
        element: <ProtectedRoute requireRole="owner-or-employee" />,
        children: [
          { path: "/employee", element: <EmployeeHome /> },
          { path: "/employee/jobs", element: <MyJobs /> },
          { path: "/employee/photos", element: <UploadPhotos /> },
          { path: "/employee/uploads", element: <MyPhotos /> },
          { path: "/employee/notes", element: <JobNotes /> },
          { path: "/employee/payroll", element: <PayrollPage /> },
          { path: "/employee/settings", element: <EmployeeSettings /> },
          { path: "/employee/knowledge", element: <EmployeeKnowledge /> },
        ],
      },

      // Client portal (client | admin-or-above)
      {
        element: <ProtectedRoute requireRole="client-or-above" />,
        children: [
          { path: "/client", element: <ClientHome /> },
          { path: "/client/services", element: <ServicesPage /> },
          { path: "/client/invoices", element: <InvoicesPage /> },
          { path: "/client/support", element: <SupportPage /> },
          { path: "/client/profile", element: <ProfilePage /> },
          { path: "/client/resources", element: <ClientResources /> },
        ],
      },

      // Generic protected routes (any signed-in user)
      {
        element: <ProtectedRoute />,
        children: [{ path: "/logout", element: <Logout /> }],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
