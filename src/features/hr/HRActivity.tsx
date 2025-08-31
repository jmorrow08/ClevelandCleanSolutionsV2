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
import { Link } from "react-router-dom";
import { firebaseConfig } from "../../services/firebase";
import { format } from "date-fns";
import { useAuth } from "../../context/AuthContext";
import { getEmployeeNames } from "../../services/queries/resolvers";
import EmployeeActivityTab from "./EmployeeActivityTab";

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

export default function HRActivity() {
  const { claims } = useAuth();
  const canRead = !!(claims?.admin || claims?.owner || claims?.super_admin);
  const [activeTab, setActiveTab] = useState<"audit" | "employee">("employee");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ id: string } & AuditLogDoc>>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});

  // quick filters
  const [actorUid, setActorUid] = useState<string>("");
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
  }, [actorUid, startDate, endDate]);

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

  const applied = useMemo(() => {
    if (!actionFilter) return rows;
    const f = actionFilter.toLowerCase();
    return rows.filter((r) =>
      String(r.action || "")
        .toLowerCase()
        .includes(f)
    );
  }, [rows, actionFilter]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab("employee")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "employee"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Employee Activity
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "audit"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            System Audit Logs
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "employee" ? (
        <EmployeeActivityTab />
      ) : (
        <div className="space-y-3">
          <div className="grid md:grid-cols-5 gap-2">
            <input
              className="border rounded-md px-2 py-1 card-bg"
              placeholder="Actor UID"
              value={actorUid}
              onChange={(e) => setActorUid(e.target.value)}
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
                  setActionFilter("");
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Reset
              </button>
            </div>
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
                  </tr>
                </thead>
                <tbody>
                  {applied.map((r) => {
                    const actorName = r.actorUid
                      ? actorNames[r.actorUid] || r.actorUid
                      : "—";
                    const targetPath = `${(
                      r.targetRef?.collection || ""
                    ).toString()}/${(r.targetRef?.id || "").toString()}`;
                    const link = resolveTargetLink(r.targetRef);
                    return (
                      <tr className="border-t align-top" key={r.id}>
                        <td className="p-2 whitespace-nowrap">
                          {formatTs(r.at)}
                        </td>
                        <td className="p-2 whitespace-nowrap text-zinc-700">
                          {actorName}
                        </td>
                        <td className="p-2 whitespace-pre text-zinc-800">
                          {r.action || "—"}
                        </td>
                        <td className="p-2 whitespace-pre text-blue-700">
                          {link ? (
                            <Link to={link} className="underline">
                              {targetPath}
                            </Link>
                          ) : (
                            <span>{targetPath || "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {applied.length === 0 && !loading && (
                    <tr>
                      <td className="p-3 text-zinc-500" colSpan={4}>
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
        </div>
      )}
    </div>
  );
}

function resolveTargetLink(
  target?: { collection?: string; id?: string } | null
): string | null {
  if (!target || !target.collection || !target.id) return null;
  const c = String(target.collection);
  const id = String(target.id);
  // Link to known admin routes when applicable
  if (c === "employeeMasterList") return `/hr/${id}`;
  if (c === "clientMasterList") return `/crm/clients/${id}`;
  if (c === "locations") return `/crm/locations/${id}`;
  if (c === "serviceHistory") return `/service-history/${id}`;
  return null;
}
