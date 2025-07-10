import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatDate } from '../../lib/utils';
import { Plus, Eye, Edit } from 'lucide-react';

export const JobsPage: React.FC = () => {
  const { jobs, clients, employees, addJob } = useApp();
  const [showCreateForm, setShowCreateForm] = useState(false);

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

  const handleCreateJob = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const clientId = formData.get('clientId') as string;
    const employeeId = formData.get('employeeId') as string;
    const scheduledDate = formData.get('scheduledDate') as string;
    const notes = formData.get('notes') as string;

    const client = clients.find(c => c.id === clientId);
    const employee = employees.find(e => e.id === employeeId);

    if (client && employee) {
      addJob({
        clientId,
        clientName: client.name,
        location: client.serviceAddress,
        assignedEmployeeId: employeeId,
        assignedEmployeeName: employee.name,
        status: 'pending',
        scheduledDate,
        tasks: [
          { id: Date.now().toString(), description: 'Vacuum all carpeted areas', completed: false },
          { id: (Date.now() + 1).toString(), description: 'Empty all trash receptacles', completed: false },
          { id: (Date.now() + 2).toString(), description: 'Clean and disinfect restrooms', completed: false },
          { id: (Date.now() + 3).toString(), description: 'Wipe down all surfaces', completed: false },
        ],
        photos: [],
        notes
      });
      setShowCreateForm(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground">Manage cleaning assignments</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create New Job
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Job</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Client</label>
                  <select 
                    name="clientId" 
                    required
                    className="w-full p-2 border border-border rounded-md"
                  >
                    <option value="">Select a client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Assign to Employee</label>
                  <select 
                    name="employeeId" 
                    required
                    className="w-full p-2 border border-border rounded-md"
                  >
                    <option value="">Select an employee</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>{employee.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Scheduled Date</label>
                <input 
                  type="date" 
                  name="scheduledDate"
                  required
                  className="w-full p-2 border border-border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea 
                  name="notes"
                  rows={3}
                  className="w-full p-2 border border-border rounded-md"
                  placeholder="Special instructions or notes..."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Create Job</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="font-medium">{job.clientName}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">{job.location}</div>
                  </TableCell>
                  <TableCell>
                    {job.assignedEmployeeName || (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(job.scheduledDate)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(job.status)}>
                      {job.status.replace('-', ' ').toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};