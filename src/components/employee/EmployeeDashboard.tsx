import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatDateTime } from '../../lib/utils';
import { Clock, Briefcase, PlayCircle, StopCircle, Eye } from 'lucide-react';

interface EmployeeDashboardProps {
  onViewJobs: () => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ onViewJobs }) => {
  const { 
    employees, 
    getJobsByEmployeeId, 
    timeLogs, 
    updateEmployee, 
    addTimeLog, 
    updateTimeLog 
  } = useApp();

  // Simulating current employee as Maria Rodriguez (id: '1')
  const currentEmployee = employees.find(emp => emp.id === '1')!;
  const employeeJobs = getJobsByEmployeeId(currentEmployee.id);
  const todayJobs = employeeJobs.filter(job => {
    const today = new Date().toISOString().split('T')[0];
    return job.scheduledDate.startsWith(today) && job.status !== 'completed';
  });

  const currentTimeLog = timeLogs.find(log => 
    log.employeeId === currentEmployee.id && !log.clockOut
  );

  const handleClockToggle = () => {
    if (currentEmployee.status === 'clocked-out') {
      // Clock in
      updateEmployee(currentEmployee.id, { status: 'clocked-in' });
      addTimeLog({
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        clockIn: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0]
      });
    } else {
      // Clock out
      updateEmployee(currentEmployee.id, { status: 'clocked-out' });
      if (currentTimeLog) {
        updateTimeLog(currentTimeLog.id, { clockOut: new Date().toISOString() });
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {currentEmployee.name}
        </h1>
        <p className="text-muted-foreground">Manage your work schedule and assignments</p>
      </div>

      {/* Clock In/Out Section */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Time Clock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">
                {currentEmployee.status === 'clocked-in' ? 'Currently Working' : 'Not Clocked In'}
              </div>
              {currentTimeLog && (
                <p className="text-muted-foreground">
                  Clocked in at {formatDateTime(currentTimeLog.clockIn)}
                </p>
              )}
            </div>
            <Button
              size="lg"
              onClick={handleClockToggle}
              variant={currentEmployee.status === 'clocked-in' ? 'destructive' : 'default'}
            >
              {currentEmployee.status === 'clocked-in' ? (
                <>
                  <StopCircle className="h-5 w-5 mr-2" />
                  Clock Out
                </>
              ) : (
                <>
                  <PlayCircle className="h-5 w-5 mr-2" />
                  Clock In
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's Jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Today's Assignments
          </CardTitle>
          <Button variant="outline" onClick={onViewJobs}>
            <Eye className="h-4 w-4 mr-2" />
            View All Jobs
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {todayJobs.length > 0 ? (
              todayJobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{job.clientName}</div>
                    <Badge variant={job.status === 'in-progress' ? 'warning' : 'default'}>
                      {job.status.replace('-', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    {job.location}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.tasks.filter(t => t.completed).length}/{job.tasks.length} tasks completed
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ 
                        width: `${(job.tasks.filter(t => t.completed).length / job.tasks.length) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No jobs assigned for today</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs This Week</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employeeJobs.length}</div>
            <p className="text-xs text-muted-foreground">Total assignments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employeeJobs.filter(job => job.status === 'completed').length}
            </div>
            <p className="text-xs text-muted-foreground">Jobs finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hours This Week</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">32</div>
            <p className="text-xs text-muted-foreground">Time logged</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};