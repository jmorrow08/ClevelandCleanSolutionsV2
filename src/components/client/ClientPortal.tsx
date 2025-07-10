import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { ClientDashboard } from './ClientDashboard';
import { ServicesPage } from './ServicesPage';
import { ClientInvoicesPage } from './ClientInvoicesPage';
import { JobPhotosPage } from './JobPhotosPage';
import { Button } from '../ui/Button';
import { 
  LayoutDashboard, 
  Settings, 
  Receipt, 
  Camera, 
  LogOut 
} from 'lucide-react';

type ClientPage = 'dashboard' | 'services' | 'invoices' | 'photos';

export const ClientPortal: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<ClientPage>('dashboard');
  const { setCurrentRole } = useApp();

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'services', label: 'Services', icon: Settings },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'photos', label: 'Job Photos', icon: Camera },
  ] as const;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <ClientDashboard />;
      case 'services':
        return <ServicesPage />;
      case 'invoices':
        return <ClientInvoicesPage />;
      case 'photos':
        return <JobPhotosPage />;
      default:
        return <ClientDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg">
          <div className="p-6">
            <h1 className="text-xl font-bold text-foreground">Client Portal</h1>
          </div>
          <nav className="px-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id as ClientPage)}
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