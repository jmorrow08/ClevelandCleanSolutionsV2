import React from 'react';
import { UserRole } from '../types';
import { useApp } from '../contexts/AppContext';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Building2, Users, UserCheck } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { setCurrentRole } = useApp();

  const handleRoleSelect = (role: UserRole) => {
    setCurrentRole(role);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-bold text-foreground">
            Cleveland Clean Solutions
          </h1>
          <p className="mt-2 text-muted-foreground">
            Select your role to access the portal
          </p>
        </div>

        <div className="space-y-4">
          <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => handleRoleSelect('admin')}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <Users className="h-6 w-6 text-primary" />
                Admin Portal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Manage clients, employees, jobs, and billing
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => handleRoleSelect('client')}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <Building2 className="h-6 w-6 text-primary" />
                Client Portal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                View services, invoices, and job progress
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => handleRoleSelect('employee')}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg">
                <UserCheck className="h-6 w-6 text-primary" />
                Employee Portal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Clock in/out, view assignments, and update job progress
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};