import { Client, Employee, Job, Invoice, TimeLog, JobPhoto } from '../types';

export const mockClients: Client[] = [
  {
    id: '1',
    name: 'Downtown Office Complex',
    email: 'manager@downtowncomplex.com',
    phone: '(216) 555-0101',
    serviceAddress: '1234 Euclid Ave, Cleveland, OH 44115',
    contractType: 'Weekly Office Cleaning',
    nextService: '2025-01-25',
    balance: 850.00
  },
  {
    id: '2',
    name: 'Cleveland Medical Center',
    email: 'facilities@clevelandmedical.com',
    phone: '(216) 555-0202',
    serviceAddress: '5678 Carnegie Ave, Cleveland, OH 44103',
    contractType: 'Daily Medical Facility Cleaning',
    nextService: '2025-01-24',
    balance: 0
  },
  {
    id: '3',
    name: 'Westside Retail Plaza',
    email: 'property@westsideplaza.com',
    phone: '(216) 555-0303',
    serviceAddress: '9012 Lorain Ave, Cleveland, OH 44102',
    contractType: 'Bi-weekly Retail Cleaning',
    nextService: '2025-01-28',
    balance: 1200.00
  }
];

export const mockEmployees: Employee[] = [
  {
    id: '1',
    name: 'Maria Rodriguez',
    email: 'maria@clevelandclean.com',
    phone: '(216) 555-1001',
    status: 'clocked-in',
    currentJobId: '1'
  },
  {
    id: '2',
    name: 'James Thompson',
    email: 'james@clevelandclean.com',
    phone: '(216) 555-1002',
    status: 'clocked-out'
  },
  {
    id: '3',
    name: 'Sarah Chen',
    email: 'sarah@clevelandclean.com',
    phone: '(216) 555-1003',
    status: 'clocked-in',
    currentJobId: '2'
  }
];

export const mockJobs: Job[] = [
  {
    id: '1',
    clientId: '1',
    clientName: 'Downtown Office Complex',
    location: '1234 Euclid Ave, Cleveland, OH 44115',
    assignedEmployeeId: '1',
    assignedEmployeeName: 'Maria Rodriguez',
    status: 'in-progress',
    scheduledDate: '2025-01-23',
    tasks: [
      { id: '1', description: 'Vacuum all carpeted areas', completed: true },
      { id: '2', description: 'Empty all trash receptacles', completed: true },
      { id: '3', description: 'Clean and disinfect restrooms', completed: false },
      { id: '4', description: 'Wipe down all surfaces', completed: false },
      { id: '5', description: 'Mop hard floor surfaces', completed: false }
    ],
    photos: [],
    notes: 'Extra attention needed in conference rooms'
  },
  {
    id: '2',
    clientId: '2',
    clientName: 'Cleveland Medical Center',
    location: '5678 Carnegie Ave, Cleveland, OH 44103',
    assignedEmployeeId: '3',
    assignedEmployeeName: 'Sarah Chen',
    status: 'in-progress',
    scheduledDate: '2025-01-23',
    tasks: [
      { id: '6', description: 'Sanitize all surfaces with medical-grade disinfectant', completed: true },
      { id: '7', description: 'Clean patient rooms', completed: true },
      { id: '8', description: 'Disinfect common areas', completed: true },
      { id: '9', description: 'Empty biohazard containers', completed: false },
      { id: '10', description: 'Final inspection and documentation', completed: false }
    ],
    photos: [
      {
        id: '1',
        jobId: '2',
        url: 'https://images.pexels.com/photos/4386467/pexels-photo-4386467.jpeg?auto=compress&cs=tinysrgb&w=800',
        caption: 'Patient room after cleaning',
        uploadedAt: '2025-01-23T10:30:00Z',
        uploadedBy: 'Sarah Chen'
      }
    ]
  },
  {
    id: '3',
    clientId: '3',
    clientName: 'Westside Retail Plaza',
    location: '9012 Lorain Ave, Cleveland, OH 44102',
    status: 'pending',
    scheduledDate: '2025-01-24',
    tasks: [
      { id: '11', description: 'Clean storefront windows', completed: false },
      { id: '12', description: 'Vacuum customer areas', completed: false },
      { id: '13', description: 'Clean and stock restrooms', completed: false },
      { id: '14', description: 'Empty trash and replace liners', completed: false }
    ],
    photos: []
  }
];

export const mockInvoices: Invoice[] = [
  {
    id: '1',
    clientId: '1',
    clientName: 'Downtown Office Complex',
    amount: 850.00,
    status: 'pending',
    dueDate: '2025-02-01',
    issueDate: '2025-01-15',
    description: 'Weekly office cleaning services - January 2025'
  },
  {
    id: '2',
    clientId: '2',
    clientName: 'Cleveland Medical Center',
    amount: 2400.00,
    status: 'paid',
    dueDate: '2025-01-31',
    issueDate: '2025-01-01',
    description: 'Daily medical facility cleaning - January 2025'
  },
  {
    id: '3',
    clientId: '3',
    clientName: 'Westside Retail Plaza',
    amount: 1200.00,
    status: 'overdue',
    dueDate: '2025-01-15',
    issueDate: '2024-12-20',
    description: 'Bi-weekly retail cleaning - December 2024'
  }
];

export const mockTimeLogs: TimeLog[] = [
  {
    id: '1',
    employeeId: '1',
    employeeName: 'Maria Rodriguez',
    clockIn: '2025-01-23T08:00:00Z',
    jobId: '1',
    date: '2025-01-23'
  },
  {
    id: '2',
    employeeId: '3',
    employeeName: 'Sarah Chen',
    clockIn: '2025-01-23T07:30:00Z',
    jobId: '2',
    date: '2025-01-23'
  },
  {
    id: '3',
    employeeId: '2',
    employeeName: 'James Thompson',
    clockIn: '2025-01-22T09:00:00Z',
    clockOut: '2025-01-22T17:00:00Z',
    date: '2025-01-22'
  }
];