import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Settings, Phone, Mail } from 'lucide-react';

export const EmployeesPage: React.FC = () => {
  const { employees, jobs } = useApp();

  const getCurrentJob = (employeeId: string) => {
    return jobs.find(job => job.assignedEmployeeId === employeeId && job.status === 'in-progress');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Employees</h1>
          <p className="text-muted-foreground">Manage your cleaning staff</p>
        </div>
        <Button>Add New Employee</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Current Status</TableHead>
                <TableHead>Current Assignment</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => {
                const currentJob = getCurrentJob(employee.id);
                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="font-medium">{employee.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {employee.email}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {employee.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={employee.status === 'clocked-in' ? 'success' : 'default'}
                      >
                        {employee.status === 'clocked-in' ? 'Clocked In' : 'Clocked Out'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {currentJob ? (
                        <div>
                          <div className="font-medium text-sm">{currentJob.clientName}</div>
                          <div className="text-xs text-muted-foreground">
                            {currentJob.location}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No active assignment</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};