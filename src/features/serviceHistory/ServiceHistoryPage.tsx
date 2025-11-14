import { useState } from 'react';
import JobsList from './JobsList';
import { useToast } from '../../context/ToastContext';

export default function ServiceHistoryPage() {
  const [showAll, setShowAll] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const { show } = useToast();
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service History</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <span>All</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span>Include Archived</span>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="clientProfileId"
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">Location ID</label>
          <input
            type="text"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="locationId"
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">Job ID</label>
          <input
            type="text"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="serviceHistory doc id"
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent"
          />
        </div>
        <button
          onClick={() => {
            // Trigger a toast to indicate filters applied
            show({ message: 'Filters applied', type: 'success' });
          }}
          className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm"
        >
          Apply
        </button>
        <button
          onClick={() => {
            setStartDate('');
            setEndDate('');
            setClientId('');
            setLocationId('');
            setJobId('');
            show({ message: 'Filters cleared', type: 'info' });
          }}
          className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm"
        >
          Reset
        </button>
      </div>
      <div className="rounded-lg card-bg shadow-elev-1 p-4 min-h-[200px]">
        <JobsList
          showAll={showAll}
          includeArchived={includeArchived}
          filters={{ startDate, endDate, clientId, locationId, jobId }}
        />
      </div>
    </div>
  );
}
