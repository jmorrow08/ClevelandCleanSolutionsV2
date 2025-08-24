import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./AppLayout";
import ProtectedRoute from "./ProtectedRoute";
import AdminDashboard from "../features/dashboard/AdminDashboard";
import EmployeeHome from "../features/employee/EmployeeHome";
import ClientHome from "../features/client/ClientHome";
import FinanceHub from "../features/finance/FinanceHub";
import SchedulingPage from "../features/scheduling/SchedulingPage";
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
import EmployeesList from "../features/hr/EmployeesList";
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

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/login", element: <Login /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/", element: <AdminDashboard /> },
          { path: "/logout", element: <Logout /> },
          { path: "/finance", element: <FinanceHub /> },
          { path: "/finance/payroll/:id", element: <PayrollRunDetail /> },
          { path: "/scheduling", element: <SchedulingPage /> },
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
          { path: "/employee", element: <EmployeeHome /> },
          { path: "/client", element: <ClientHome /> },
          { path: "/crm", element: <LeadsPage /> },
          { path: "/crm/clients", element: <ClientsList /> },
          { path: "/crm/clients/:id", element: <ClientDetail /> },
          { path: "/crm/locations/:id", element: <LocationDetail /> },
          { path: "/marketing", element: <CampaignsPage /> },
          { path: "/marketing/social", element: <Social /> },
          { path: "/media", element: <MediaLibraryPage /> },
          { path: "/media/:assetId", element: <AssetDetail /> },
          { path: "/training/admin", element: <TrainingAdmin /> },
          { path: "/employee/knowledge", element: <EmployeeKnowledge /> },
          { path: "/client/resources", element: <ClientResources /> },
          {
            path: "/hr",
            element: <EmployeesList />,
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
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
