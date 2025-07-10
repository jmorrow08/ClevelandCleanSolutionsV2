import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { EmployeeDashboard } from './EmployeeDashboard';
import { AssignedJobsPage } from './AssignedJobsPage';
import { JobDetailsPage } from './JobDetailsPage';
import { Button } from '../ui/Button';
import { 
  LayoutDashboard, 
  Briefcase, 
  LogOut 
} from 'lucide-react';

type EmployeePage = 'dashboard' | 'jobs' | 'job-details';

export const EmployeePortal: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<EmployeePage>('dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { setCurrentRole } = useApp();

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'jobs', label: 'My Jobs', icon: Briefcase },
  ] as const;

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    setCurrentPage('job-details');
  };

  const handleBackToJobs = () => {
    setSelectedJobId(null);
    setCurrentPage('jobs');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <EmployeeDashboard onViewJobs={() => setCurrentPage('jobs')} />;
      case 'jobs':
        return <AssignedJobsPage onJobSelect={handleJobSelect} />;
      case 'job-details':
        return selectedJobId ? (
          <JobDetailsPage jobId={selectedJobId} onBack={handleBackToJobs} />
        ) : (
          <AssignedJobsPage onJobSelect={handleJobSelect} />
        );
      default:
        return <EmployeeDashboard onViewJobs={() => setCurrentPage('jobs')} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg">
          <div className="p-6">
            <h1 className="text-xl font-bold text-foreground">Employee Portal</h1>
            <p className="text-sm text-muted-foreground">Maria Rodriguez</p>
          </div>
          <nav className="px-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id as EmployeePage)}
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