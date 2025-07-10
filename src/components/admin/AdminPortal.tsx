import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { AdminDashboard } from './AdminDashboard';
import { ClientsPage } from './ClientsPage';
import { EmployeesPage } from './EmployeesPage';
import { JobsPage } from './JobsPage';
import { InvoicingPage } from './InvoicingPage';
import { Button } from '../ui/Button';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Briefcase, 
  Receipt, 
  LogOut 
} from 'lucide-react';

type AdminPage = 'dashboard' | 'clients' | 'employees' | 'jobs' | 'invoicing';

export const AdminPortal: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AdminPage>('dashboard');
  const { setCurrentRole } = useApp();

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Building2 },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'invoicing', label: 'Invoicing', icon: Receipt },
  ] as const;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'clients':
        return <ClientsPage />;
      case 'employees':
        return <EmployeesPage />;
      case 'jobs':
        return <JobsPage />;
      case 'invoicing':
        return <InvoicingPage />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg">
          <div className="p-6">
            <h1 className="text-xl font-bold text-foreground">Admin Portal</h1>
          </div>
          <nav className="px-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id as AdminPage)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    currentPage === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="absolute bottom-4 left-4 right-4">
            <Button
              variant="outline"
              onClick={() => setCurrentRole(null)}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          {renderPage()}
        </div>
      </div>
    </div>
  );
};