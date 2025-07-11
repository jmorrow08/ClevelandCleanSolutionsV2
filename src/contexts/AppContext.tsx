// src/contexts/AppContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// --- MODIFIED: Added imports needed for our new logic ---
import { db } from '../firebase-config';
import { collection, getDocs } from 'firebase/firestore';

// Interface defining all data our app manages
interface AppContextType {
  currentRole: 'admin' | 'client' | 'employee' | null;
  setCurrentRole: (role: 'admin' | 'client' | 'employee' | null) => void;
  // Placeholder types for existing data
  jobs: any[];
  employees: any[];
  invoices: any[];
  timeLogs: any[];
  // --- NEW: Added clientCount to our application's data type ---
  clientCount: number | string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<'admin' | 'client' | 'employee' | null>('admin');

  // Existing state for your dashboard data
  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);

  // --- NEW: State for our new client count metric ---
  const [clientCount, setClientCount] = useState<number | string>('...');

  // This useEffect hook fetches data when the app loads
  useEffect(() => {
    // --- NEW: Logic to fetch the client count from Firestore ---
    const fetchClientCount = async () => {
      try {
        const locationsRef = collection(db, 'locations');
        const snapshot = await getDocs(locationsRef);
        const uniqueClientIds = new Set();
        if (!snapshot.empty) {
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.clientProfileId) {
              uniqueClientIds.add(data.clientProfileId);
            }
          });
        }
        setClientCount(uniqueClientIds.size);
      } catch (error) {
        console.error('Error fetching client count:', error);
        setClientCount('Error');
      }
    };

    // We will add the logic to fetch jobs, employees, etc. here in the future
    fetchClientCount();
  }, []);

  // The value object provided to the app
  const value = {
    currentRole,
    setCurrentRole,
    jobs,
    employees,
    invoices,
    timeLogs,
    clientCount, // <-- NEW: Making clientCount available to the whole app
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
