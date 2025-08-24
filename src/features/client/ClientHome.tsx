import NextService from "./NextService";
import Billing from "./Billing";
import AddNoteToCleaners from "./AddNoteToCleaners";

export default function ClientHome() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Client</h1>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <NextService />
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <AddNoteToCleaners />
      </div>
      <div className="rounded-lg p-4 bg-white dark:bg-zinc-800 shadow-elev-1">
        <Billing />
      </div>
    </div>
  );
}
