import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Client, Employee, Job, Invoice, TimeLog, JobPhoto, UserRole } from '../types';
import { mockClients, mockEmployees, mockJobs, mockInvoices, mockTimeLogs } from '../data/mockData';

interface AppContextType {
  // Current user
  currentUser: User | null;
  currentRole: UserRole | null;
  setCurrentRole: (role: UserRole | null) => void;
  
  // Data
  clients: Client[];
  employees: Employee[];
  jobs: Job[];
  invoices: Invoice[];
  timeLogs: TimeLog[];
  
  // Actions
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  addTimeLog: (timeLog: Omit<TimeLog, 'id'>) => void;
  updateTimeLog: (id: string, updates: Partial<TimeLog>) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  addJob: (job: Omit<Job, 'id'>) => void;
  addJobPhoto: (jobId: string, photo: Omit<JobPhoto, 'id' | 'jobId'>) => void;
  toggleTask: (jobId: string, taskId: string) => void;
  
  // Getters
  getEmployeeById: (id: string) => Employee | undefined;
  getJobsByEmployeeId: (employeeId: string) => Job[];
  getClientById: (id: string) => Client | undefined;
  getJobById: (id: string) => Job | undefined;
  getInvoicesByClientId: (clientId: string) => Invoice[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
  const [jobs, setJobs] = useState<Job[]>(mockJobs);
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>(mockTimeLogs);

  const currentUser: User | null = currentRole ? {
    id: currentRole === 'admin' ? 'admin-1' : currentRole === 'client' ? 'client-1' : 'employee-1',
    name: currentRole === 'admin' ? 'Admin User' : currentRole === 'client' ? 'Downtown Office Complex' : 'Maria Rodriguez',
    email: currentRole === 'admin' ? 'admin@clevelandclean.com' : currentRole === 'client' ? 'manager@downtowncomplex.com' : 'maria@clevelandclean.com',
    role: currentRole
  } : null;

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, ...updates } : emp));
  };

  const addTimeLog = (timeLog: Omit<TimeLog, 'id'>) => {
    const newTimeLog: TimeLog = {
      ...timeLog,
      id: Date.now().toString()
    };
    setTimeLogs(prev => [...prev, newTimeLog]);
  };

  const updateTimeLog = (id: string, updates: Partial<TimeLog>) => {
    setTimeLogs(prev => prev.map(log => log.id === id ? { ...log, ...updates } : log));
  };

  const updateJob = (id: string, updates: Partial<Job>) => {
    setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));
  };

  const addJob = (job: Omit<Job, 'id'>) => {
    const newJob: Job = {
      ...job,
      id: Date.now().toString()
    };
    setJobs(prev => [...prev, newJob]);
  };

  const addJobPhoto = (jobId: string, photo: Omit<JobPhoto, 'id' | 'jobId'>) => {
    const newPhoto: JobPhoto = {
      ...photo,
      id: Date.now().toString(),
      jobId
    };
    
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, photos: [...job.photos, newPhoto] }
        : job
    ));
  };

  const toggleTask = (jobId: string, taskId: string) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? {
            ...job,
            tasks: job.tasks.map(task =>
              task.id === taskId ? { ...task, completed: !task.completed } : task
            )
          }
        : job
    ));
  };

  const getEmployeeById = (id: string) => employees.find(emp => emp.id === id);
  const getJobsByEmployeeId = (employeeId: string) => jobs.filter(job => job.assignedEmployeeId === employeeId);
  const getClientById = (id: string) => clients.find(client => client.id === id);
  const getJobById = (id: string) => jobs.find(job => job.id === id);
  const getInvoicesByClientId = (clientId: string) => invoices.filter(invoice => invoice.clientId === clientId);

  const value: AppContextType = {
    currentUser,
    currentRole,
    setCurrentRole,
    clients,
    employees,
    jobs,
    invoices,
    timeLogs,
    updateEmployee,
    addTimeLog,
    updateTimeLog,
    updateJob,
    addJob,
    addJobPhoto,
    toggleTask,
    getEmployeeById,
    getJobsByEmployeeId,
    getClientById,
    getJobById,
    getInvoicesByClientId
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};