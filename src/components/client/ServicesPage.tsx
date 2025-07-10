import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatDate } from '../../lib/utils';
import { MapPin, Clock, User, CheckCircle } from 'lucide-react';

export const ServicesPage: React.FC = () => {
  const { clients, jobs } = useApp();
  
  // Simulating current client as first client
  const currentClient = clients[0];
  const clientJobs = jobs.filter(job => job.clientId === currentClient.id);
  
  const upcomingJobs = clientJobs
    .filter(job => job.status === 'pending')
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  
  const inProgressJobs = clientJobs.filter(job => job.status === 'in-progress');
  const completedJobs = clientJobs.filter(job => job.status === 'completed');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Services</h1>
        <p className="text-muted-foreground">Your cleaning service details and schedule</p>
      </div>

      {/* Service Agreement */}
      <Card>
        <CardHeader>
          <CardTitle>Service Agreement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Contract Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Type:</span>
                  <span>{currentClient.contractType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location:</span>
                  <span>{currentClient.serviceAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next Service:</span>
                  <span>{currentClient.nextService ? formatDate(currentClient.nextService) : 'TBD'}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Service Includes</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Vacuum all carpeted areas
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Empty all trash receptacles
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Clean and disinfect restrooms
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Wipe down all surfaces
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Mop hard floor surfaces
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current/Upcoming Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {inProgressJobs.length > 0 ? (
                inProgressJobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="warning">In Progress</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(job.scheduledDate)}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {job.assignedEmployeeName}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {job.location}
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Progress: {job.tasks.filter(t => t.completed).length}/{job.tasks.length} tasks completed
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
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No services currently in progress</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingJobs.length > 0 ? (
                upcomingJobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="default">Scheduled</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(job.scheduledDate)}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {job.assignedEmployeeName || 'Assigning staff...'}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {job.location}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No upcoming services scheduled</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Services */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {completedJobs.length > 0 ? (
              completedJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between border-b pb-4 last:border-b-0">
                  <div>
                    <div className="font-medium">{formatDate(job.scheduledDate)}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {job.assignedEmployeeName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {job.tasks.length} tasks completed
                      </span>
                    </div>
                  </div>
                  <Badge variant="success">Completed</Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No completed services yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};