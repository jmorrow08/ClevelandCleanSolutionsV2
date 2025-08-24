import { useEffect, useMemo, useState } from "react";

export type AudienceQuery = {
  clientStage?: string | null;
  lastServiceStart?: string | null; // ISO date yyyy-MM-dd
  lastServiceEnd?: string | null; // ISO date yyyy-MM-dd
  invoiceStatus?: string | null;
  reviewScoreLt?: number | null;
};

export default function AudienceBuilder({
  value,
  onChange,
  readOnly,
}: {
  value: AudienceQuery | null | undefined;
  onChange: (v: AudienceQuery) => void;
  readOnly?: boolean;
}) {
  const initial = useMemo<AudienceQuery>(
    () => ({
      clientStage: value?.clientStage ?? null,
      lastServiceStart: value?.lastServiceStart ?? null,
      lastServiceEnd: value?.lastServiceEnd ?? null,
      invoiceStatus: value?.invoiceStatus ?? null,
      reviewScoreLt: value?.reviewScoreLt ?? null,
    }),
    [value]
  );
  const [local, setLocal] = useState<AudienceQuery>(initial);
  useEffect(() => setLocal(initial), [initial]);

  useEffect(() => {
    onChange(local);
  }, [local, onChange]);

  const disabled = !!readOnly;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1">Client Stage</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={local.clientStage ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setLocal((s) => ({ ...s, clientStage: e.target.value || null }))
            }
          >
            <option value="">Any</option>
            {[
              "New",
              "Qualified",
              "Proposal",
              "Won",
              "Lost",
              "Active",
              "Paused",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Invoice Status</label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={local.invoiceStatus ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setLocal((s) => ({ ...s, invoiceStatus: e.target.value || null }))
            }
          >
            <option value="">Any</option>
            {["paid", "unpaid", "overdue", "partial"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Last Service: Start</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={local.lastServiceStart ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setLocal((s) => ({
                ...s,
                lastServiceStart: e.target.value || null,
              }))
            }
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Last Service: End</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={local.lastServiceEnd ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setLocal((s) => ({
                ...s,
                lastServiceEnd: e.target.value || null,
              }))
            }
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Review score less than</label>
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
            value={local.reviewScoreLt ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setLocal((s) => ({
                ...s,
                reviewScoreLt: e.target.value ? Number(e.target.value) : null,
              }))
            }
            placeholder="e.g. 4"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1">JSON (read-only)</label>
        <textarea
          className="w-full border rounded-md px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900"
          readOnly
          rows={4}
          value={JSON.stringify(local, null, 2)}
        />
      </div>
    </div>
  );
}
