import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '../../services/firebase';
import { useToast } from '../../context/ToastContext';

type Ctx = { open: () => void };

const C = createContext<Ctx>({ open: () => {} });

export function useNewEmployeeModal() {
  return useContext(C);
}

export function NewEmployeeProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState(false);
  const open = useCallback(() => setOpenState(true), []);
  const close = useCallback(() => setOpenState(false), []);
  return (
    <C.Provider value={{ open }}>
      {children}
      {openState && <NewEmployeeModal onClose={close} />}
    </C.Provider>
  );
}

function NewEmployeeModal({ onClose }: { onClose: () => void }) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeIdString, setEmployeeIdString] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const role = 'employee';

  async function handleCreate() {
    const name = fullName.trim();
    const emailStr = email.trim();
    const phoneStr = phone.trim();
    if (!name) {
      show({ type: 'error', message: 'Full name is required' });
      return;
    }
    try {
      setSubmitting(true);
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      await addDoc(collection(db, 'employeeMasterList'), {
        fullName: name,
        email: emailStr || null,
        phone: phoneStr || null,
        employeeIdString: employeeIdString.trim() || null,
        jobTitle: jobTitle.trim() || null,
        role,
        status: true,
        createdAt: serverTimestamp(),
      });
      show({ type: 'success', message: 'Employee added' });
      onClose();
    } catch (e: any) {
      show({ type: 'error', message: e?.message || 'Failed to add employee' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-lg rounded-lg card-bg shadow-elev-3 p-4 max-h-[90vh] overflow-y-auto">
        <div className="text-lg font-medium">New Employee</div>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm mb-1">Full name</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Phone</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Employee ID</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              placeholder="e.g. EMP-1001"
              value={employeeIdString}
              onChange={(e) => setEmployeeIdString(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Job Title</label>
            <input
              className="w-full border rounded-md px-3 py-2 card-bg"
              placeholder="e.g. Cleaner, Supervisor, Manager"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div className="text-xs text-zinc-500">
            If an account auto-provision function becomes available later, it will create the Auth
            user and apply claims. For now this writes to
            <code className="px-1">employeeMasterList</code> only.
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border card-bg"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-white ${
              submitting ? 'bg-zinc-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewEmployeeModal;
