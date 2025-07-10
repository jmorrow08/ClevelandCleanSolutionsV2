import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatDate, formatDateTime } from '../../lib/utils';
import { MapPin, Clock, ArrowRight } from 'lucide-react';

interface AssignedJobsPageProps {
  onJobSelect: (jobId: string) => void;
}

export const AssignedJobsPage: React.FC<AssignedJobsPageProps> = ({ onJobSelect }) => {
  const { employees, getJobsByEmployeeId } = useApp();
  
  // Simulating current employee as Maria Rodriguez (id: '1')
  const currentEmployee = employees.find(emp => emp.id === '1')!;
  const employeeJobs = getJobsByEmployeeId(currentEmployee.id);
  
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in-progress':
        return 'warning';
      case 'pending':
        return 'default';
      default:
        return 'default';
    }
  };

  const sortedJobs = employeeJobs.sort((a, b) => {
    // Sort by status priority first (in-progress, pending, completed)
    const statusOrder = { 'in-progress': 0, 'pending': 1, 'completed': 2 };
    const statusDiff = statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder];
    if (statusDiff !== 0) return statusDiff;
    
    // Then by date
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Assigned Jobs</h1>
        <p className="text-muted-foreground">Your cleaning assignments and progress</p>
      </div>

      <div className="grid gap-6">
        {sortedJobs.map((job) => (
          <Card key={job.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{job.clientName}</CardTitle>
                <Badge variant={getStatusVariant(job.status)}>
                  {job.status.replace('-', ' ').toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{job.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(job.scheduledDate)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Task Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {job.tasks.filter(t => t.completed).length}/{job.tasks.length} completed
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ 
                        width: `${(job.tasks.filter(t => t.completed).length / job.tasks.length) * 100}%` 
                      }}
                    />
                  </div>
                </div>

                {job.notes && (
                  <div className="text-sm">
                    <span className="font-medium">Notes: </span>
                    <span className="text-muted-foreground">{job.notes}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <div className="text-xs text-muted-foreground">
                    {job.photos.length} photo{job.photos.length !== 1 ? 's' : ''} uploaded
                  </div>
                  <Button onClick={() => onJobSelect(job.id)}>
                    View Details
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sortedJobs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No jobs assigned</h3>
            <p className="text-muted-foreground text-center">
              You don't have any assigned jobs at the moment. 
              Check back later or contact your supervisor.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};