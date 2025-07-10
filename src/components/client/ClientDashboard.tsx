import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Calendar, DollarSign, Activity, CheckCircle } from 'lucide-react';

export const ClientDashboard: React.FC = () => {
  const { clients, jobs, getInvoicesByClientId } = useApp();
  
  // Simulating current client as first client (Downtown Office Complex)
  const currentClient = clients[0];
  const clientJobs = jobs.filter(job => job.clientId === currentClient.id);
  const clientInvoices = getInvoicesByClientId(currentClient.id);
  
  const nextJob = clientJobs
    .filter(job => job.status === 'pending')
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];
  
  const recentJobs = clientJobs
    .filter(job => job.status === 'completed')
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
    .slice(0, 3);

  const pendingInvoices = clientInvoices.filter(inv => inv.status !== 'paid');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {currentClient.name}
        </h1>
        <p className="text-muted-foreground">Your cleaning service dashboard</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Service</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {nextJob ? (
              <>
                <div className="text-2xl font-bold">{formatDate(nextJob.scheduledDate)}</div>
                <p className="text-xs text-muted-foreground">
                  {nextJob.assignedEmployeeName || 'Unassigned'}
                </p>
              </>
            ) : (
              <>
                <div className="text-lg font-medium text-muted-foreground">No scheduled service</div>
                <p className="text-xs text-muted-foreground">Contact us to schedule</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(currentClient.balance)}</div>
            <p className="text-xs text-muted-foreground">
              {pendingInvoices.length} pending invoice{pendingInvoices.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Service Type</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">{currentClient.contractType}</div>
            <p className="text-xs text-muted-foreground">Current contract</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentJobs.length}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Cleaning Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{formatDate(job.scheduledDate)}</div>
                      <div className="text-sm text-muted-foreground">
                        Completed by {job.assignedEmployeeName}
                      </div>
                    </div>
                    <Badge variant="success">Completed</Badge>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No recent services</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingInvoices.length > 0 ? (
                pendingInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Invoice #{invoice.id}</div>
                      <div className="text-sm text-muted-foreground">
                        Due {formatDate(invoice.dueDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(invoice.amount)}</div>
                      <Badge 
                        variant={invoice.status === 'overdue' ? 'destructive' : 'warning'}
                      >
                        {invoice.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-green-600">All invoices paid ✓</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};