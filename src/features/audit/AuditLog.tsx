import { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  endBefore,
  limitToLast,
  Timestamp,
} from "firebase/firestore";
import type { Query, DocumentData } from "firebase/firestore";
import { firebaseConfig } from "../../services/firebase";
import { format } from "date-fns";
import { useAuth } from "../../context/AuthContext";
import { getEmployeeNames } from "../../services/queries/resolvers";

type AuditLogDoc = {
  actorUid?: string;
  action?: string;
  targetRef?: { collection?: string; id?: string } | null;
  before?: unknown;
  after?: unknown;
  at?: any;
};

function formatTs(ts?: any) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : undefined;
  return d ? format(d, "yyyy-MM-dd HH:mm") : "—";
}

function jsonPreview(value: unknown, maxLen = 120) {
  try {
    const s = JSON.stringify(value, null, 2) ?? "";
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + "…";
  } catch {
    return String(value ?? "");
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value ?? "");
  }
}

function diffKeys(a: any, b: any): string[] {
  const keys = new Set<string>([
    ...Object.keys(a || {}),
    ...Object.keys(b || {}),
  ]);
  const changed: string[] = [];
  keys.forEach((k) => {
    const av = a?.[k];
    const bv = b?.[k];
    const equal = JSON.stringify(av) === JSON.stringify(bv);
    if (!equal) changed.push(k);
  });
  return changed;
}

export default function AuditLog() {
  const { claims } = useAuth();
  const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ id: string } & AuditLogDoc>>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});

  const [actorUid, setActorUid] = useState<string>("");
  const [collectionFilter, setCollectionFilter] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const pageSize = 50;
  const firstDoc = useRef<any>(null);
  const lastDoc = useRef<any>(null);
  const pageStack = useRef<any[]>([]);

  useEffect(() => {
    if (!canRead) {
      setRows([]);
      setError("no-access");
    }
  }, [canRead]);

  async function load(direction: "next" | "prev" | "reset" = "reset") {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();
      let q: Query<DocumentData> = query(
        collection(db, "auditLogs"),
        orderBy("at", "desc"),
        limit(pageSize)
      );

      const wheres: any[] = [];
      if (actorUid) wheres.push(where("actorUid", "==", actorUid));
      if (collectionFilter)
        wheres.push(where("targetRef.collection", "==", collectionFilter));
      if (targetId) wheres.push(where("targetRef.id", "==", targetId.trim()));
      if (startDate) {
        const d = new Date(startDate + "T00:00:00");
        wheres.push(where("at", ">=", Timestamp.fromDate(d)));
      }
      if (endDate) {
        const d = new Date(endDate + "T23:59:59");
        wheres.push(where("at", "<=", Timestamp.fromDate(d)));
      }
      if (wheres.length) {
        q = query(
          collection(db, "auditLogs"),
          ...wheres,
          orderBy("at", "desc"),
          limit(pageSize)
        );
      }
      if (direction === "next" && lastDoc.current) {
        q = query(
          collection(db, "auditLogs"),
          ...wheres,
          orderBy("at", "desc"),
          startAfter(lastDoc.current),
          limit(pageSize)
        );
      }
      if (direction === "prev" && firstDoc.current) {
        q = query(
          collection(db, "auditLogs"),
          ...wheres,
          orderBy("at", "desc"),
          endBefore(firstDoc.current),
          limitToLast(pageSize)
        );
      }

      const snap = await getDocs(q);
      if (snap.empty) {
        if (direction === "next") {
          // no further pages
          setLoading(false);
          return;
        }
        setRows([]);
        firstDoc.current = null;
        lastDoc.current = null;
        pageStack.current = [];
        setLoading(false);
        return;
      }
      const list: Array<{ id: string } & AuditLogDoc> = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setRows(list);
      firstDoc.current = snap.docs[0];
      lastDoc.current = snap.docs[snap.docs.length - 1];
      if (direction === "next") pageStack.current.push(firstDoc.current);
      if (direction === "reset") pageStack.current = [firstDoc.current];
      if (direction === "prev") pageStack.current.pop();
    } catch (e: any) {
      setError(e?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorUid, collectionFilter, targetId, startDate, endDate, actionFilter]);

  useEffect(() => {
    const uids = Array.from(
      new Set(rows.map((r) => r.actorUid).filter((v): v is string => !!v))
    );
    if (uids.length === 0) return;
    (async () => {
      try {
        const names = await getEmployeeNames(uids);
        const map: Record<string, string> = {};
        uids.forEach((uid, i) => (map[uid] = names[i] || uid));
        setActorNames((prev) => ({ ...prev, ...map }));
      } catch {
        // ignore
      }
    })();
  }, [rows]);

  const applied = useMemo(() => rows, [rows]);

  return (
    <div className="p-4 space-y-3">
      <div className="text-lg font-medium">Audit Log</div>

      <div className="grid md:grid-cols-6 gap-2">
        <input
          className="border rounded-md px-2 py-1 card-bg"
          placeholder="Actor UID"
          value={actorUid}
          onChange={(e) => setActorUid(e.target.value)}
        />
        <input
          className="border rounded-md px-2 py-1 card-bg"
          placeholder="Target collection"
          value={collectionFilter}
          onChange={(e) => setCollectionFilter(e.target.value)}
        />
        <input
          className="border rounded-md px-2 py-1 card-bg"
          placeholder="Target ID"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        />
        <input
          className="border rounded-md px-2 py-1 card-bg"
          placeholder="Action contains…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <input
          type="date"
          className="border rounded-md px-2 py-1 card-bg"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          type="date"
          className="border rounded-md px-2 py-1 card-bg"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded-md text-white ${
            loading ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
          onClick={() => load("reset")}
          disabled={loading}
        >
          Apply
        </button>
        <button
          className="px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700"
          onClick={() => {
            setActorUid("");
            setCollectionFilter("");
            setTargetId("");
            setActionFilter("");
            setStartDate("");
            setEndDate("");
          }}
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
          {error}
        </div>
      )}

      {!canRead ? (
        <div className="text-sm text-zinc-600">You do not have access.</div>
      ) : (
        <div className="overflow-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="text-left p-2">At</th>
                <th className="text-left p-2">Actor</th>
                <th className="text-left p-2">Action</th>
                <th className="text-left p-2">Target</th>
                <th className="text-left p-2">Diff</th>
              </tr>
            </thead>
            <tbody>
              {applied.map((r) => (
                <AuditRow
                  key={r.id}
                  row={r}
                  actionFilter={actionFilter}
                  actorName={
                    r.actorUid ? actorNames[r.actorUid] || r.actorUid : "—"
                  }
                />
              ))}
              {applied.length === 0 && !loading && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={5}>
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700"
          onClick={() => load("prev")}
          disabled={loading || pageStack.current.length <= 1}
        >
          Prev
        </button>
        <button
          className="px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700"
          onClick={() => load("next")}
          disabled={loading || !lastDoc.current}
        >
          Next
        </button>
        {loading && <span className="text-sm text-zinc-500">Loading…</span>}
      </div>
      <div className="text-xs text-zinc-500">
        Retention: entries may be pruned after 365 days.
      </div>
    </div>
  );
}

function AuditRow({
  row,
  actionFilter,
  actorName,
}: {
  row: { id: string } & AuditLogDoc;
  actionFilter: string;
  actorName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const changed = useMemo(
    () => diffKeys(row.before as any, row.after as any),
    [row.before, row.after]
  );
  const actionMatches = !actionFilter
    ? true
    : String(row.action || "")
        .toLowerCase()
        .includes(actionFilter.toLowerCase());

  if (!actionMatches) return null;

  return (
    <tr className="border-t align-top">
      <td className="p-2 whitespace-nowrap">{formatTs(row.at)}</td>
      <td className="p-2 whitespace-nowrap text-zinc-700">{actorName}</td>
      <td className="p-2 whitespace-pre text-zinc-800">{row.action || "—"}</td>
      <td className="p-2 whitespace-pre text-zinc-700">
        {(row.targetRef?.collection || "").toString()}/
        {(row.targetRef?.id || "").toString()}
      </td>
      <td className="p-2">
        <div className="text-xs text-zinc-600 mb-1">
          {changed.length
            ? `${changed.length} field(s) changed`
            : "No field changes"}
        </div>
        <button
          className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide diff" : "Show diff"}
        </button>
        {expanded && (
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            <div className="border rounded p-2 card-bg">
              <div className="text-xs font-medium mb-1">Before</div>
              <pre className="text-xs overflow-auto max-h-64">
                {safeJson(row.before)}
              </pre>
            </div>
            <div className="border rounded p-2 card-bg">
              <div className="text-xs font-medium mb-1">After</div>
              <pre className="text-xs overflow-auto max-h-64">
                {safeJson(row.after)}
              </pre>
            </div>
          </div>
        )}
        {!expanded && (
          <div className="text-xs text-zinc-600 mt-1">
            <span className="mr-2">Before:</span>
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
              {jsonPreview(row.before)}
            </code>
            <span className="mx-2">→</span>
            <span className="mr-2">After:</span>
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
              {jsonPreview(row.after)}
            </code>
          </div>
        )}
      </td>
    </tr>
  );
}
