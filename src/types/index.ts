export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client' | 'employee';
  avatar?: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  serviceAddress: string;
  contractType: string;
  nextService?: string;
  balance: number;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'clocked-in' | 'clocked-out';
  currentJobId?: string;
}

export interface Job {
  id: string;
  clientId: string;
  clientName: string;
  location: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  status: 'pending' | 'in-progress' | 'completed';
  scheduledDate: string;
  tasks: Task[];
  photos: JobPhoto[];
  notes?: string;
}

export interface Task {
  id: string;
  description: string;
  completed: boolean;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  url: string;
  caption?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface TimeLog {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut?: string;
  jobId?: string;
  date: string;
}

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  issueDate: string;
  description: string;
}

export type UserRole = 'admin' | 'client' | 'employee';