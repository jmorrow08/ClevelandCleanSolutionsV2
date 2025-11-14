import { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";

import { firebaseConfig } from "../../../services/firebase";
import { getEmployeeNames } from "../../../services/queries/resolvers";

type PresenceDoc = {
  uid?: string;
  displayName?: string;
  name?: string;
  online?: boolean;
  lastActive?: any;
  role?: string;
};

function ensureApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}

function formatRelative(date?: Date | null): string {
  if (!date) return "—";
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function toDate(value: any): Date | null {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const n = Number(value);
  if (!Number.isNaN(n)) return new Date(n);
  return null;
}

function Sparkline({
  values,
  width = 180,
  height = 40,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const min = 0;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * stepX;
    // Invert Y for SVG (0 at top)
    const y = height - ((v - min) / (max - min)) * height;
    return `${x},${y}`;
  });
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`logins per day: ${values.join(", ")}`}
      role="img"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

export default function PresencePulse() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<
    Array<{ uid: string; name: string; lastActive?: Date | null }>
  >([]);
  const [recent, setRecent] = useState<
    Array<{ uid: string; name: string; lastActive?: Date | null }>
  >([]);
  const [loginSeries, setLoginSeries] = useState<number[]>([]);

  useEffect(() => {
    ensureApp();
    const db = getFirestore();
    let unsubOnline: (() => void) | null = null;
    let unsubRecent: (() => void) | null = null;

    let currentOnline: PresenceDoc[] = [];
    let currentRecent: PresenceDoc[] = [];

    async function computeAndSet() {
      try {
        // Resolve names via employee lookup if needed
        const needNames = Array.from(
          new Set(
            [...currentOnline, ...currentRecent]
              .filter((p) => !p.displayName && !p.name)
              .map((p) => p.uid)
              .filter((v): v is string => typeof v === "string" && !!v)
          )
        );
        const names = needNames.length ? await getEmployeeNames(needNames) : [];
        const nameMap: Record<string, string> = {};
        needNames.forEach((uid, i) => (nameMap[uid] = names[i] || uid));

        const onlineList = currentOnline
          .map((p) => ({
            uid: p.uid || "",
            name:
              p.displayName ||
              p.name ||
              (p.uid ? nameMap[p.uid] || p.uid : "User"),
            lastActive: toDate(p.lastActive),
          }))
          .filter((p) => !!p.uid)
          .sort((a, b) => a.name.localeCompare(b.name));

        const onlineIds = new Set(onlineList.map((p) => p.uid));
        const recentList = currentRecent
          .filter((p) => !onlineIds.has(p.uid || ""))
          .map((p) => ({
            uid: p.uid || "",
            name:
              p.displayName ||
              p.name ||
              (p.uid ? nameMap[p.uid] || p.uid : "User"),
            lastActive: toDate(p.lastActive),
          }))
          .filter((p) => !!p.uid)
          .sort(
            (a, b) =>
              (b.lastActive?.getTime() || 0) - (a.lastActive?.getTime() || 0)
          )
          .slice(0, 20);

        setOnline(onlineList);
        setRecent(recentList);
      } catch (e: any) {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    }

    async function subscribe() {
      try {
        const presenceCol = collection(db, "presence");
        const usersCol = collection(db, "users");
        const [probePresence] = await Promise.all([
          getDocs(query(presenceCol, limit(1))).catch(() => null),
          getDocs(
            query(usersCol, where("presence.online", "==", true), limit(1))
          ).catch(() => null),
        ]);
        const usePresence = !!(probePresence && !probePresence.empty);

        if (usePresence) {
          unsubOnline = onSnapshot(
            query(presenceCol, where("online", "==", true), limit(100)),
            (snap) => {
              const list: PresenceDoc[] = [];
              snap.forEach((d) => {
                const v = d.data() as any;
                list.push({
                  uid: v?.uid || d.id,
                  displayName: v?.displayName || v?.name,
                  name: v?.name || v?.displayName,
                  online: v?.online,
                  lastActive: v?.lastActive,
                });
              });
              currentOnline = list;
              computeAndSet();
            },
            (err) => {
              console.warn("Presence collection online listener failed:", err);
              setError(err?.message || "Presence listener failed");
            }
          );
          unsubRecent = onSnapshot(
            query(presenceCol, orderBy("lastActive", "desc"), limit(200)),
            (snap) => {
              const list: PresenceDoc[] = [];
              snap.forEach((d) => {
                const v = d.data() as any;
                list.push({
                  uid: v?.uid || d.id,
                  displayName: v?.displayName || v?.name,
                  name: v?.name || v?.displayName,
                  online: v?.online,
                  lastActive: v?.lastActive,
                });
              });
              currentRecent = list;
              computeAndSet();
            },
            () => {}
          );
        } else {
          unsubOnline = onSnapshot(
            query(usersCol, where("presence.online", "==", true), limit(100)),
            (snap) => {
              const list: PresenceDoc[] = [];
              snap.forEach((d) => {
                const v = d.data() as any;
                const nested = v?.presence || {};
                list.push({
                  uid: v?.uid || d.id,
                  displayName: v?.displayName || v?.name,
                  name: v?.name || v?.displayName,
                  online: nested?.online,
                  lastActive: nested?.lastActive,
                });
              });
              currentOnline = list;
              computeAndSet();
            },
            (err) => {
              console.warn("Users collection presence listener failed:", err);
              setError(err?.message || "Presence listener failed");
            }
          );
          unsubRecent = onSnapshot(
            query(usersCol, orderBy("presence.lastActive", "desc"), limit(200)),
            (snap) => {
              const list: PresenceDoc[] = [];
              snap.forEach((d) => {
                const v = d.data() as any;
                const nested = v?.presence || {};
                list.push({
                  uid: v?.uid || d.id,
                  displayName: v?.displayName || v?.name,
                  name: v?.name || v?.displayName,
                  online: nested?.online,
                  lastActive: nested?.lastActive,
                });
              });
              currentRecent = list;
              computeAndSet();
            },
            () => {}
          );
        }
      } catch (e: any) {
        console.error("Failed to subscribe to presence:", e);
        setError(e?.message || "Failed to subscribe to presence");
        setLoading(false);
      }
    }

    subscribe();
    return () => {
      if (unsubOnline) unsubOnline();
      if (unsubRecent) unsubRecent();
    };
  }, []);

  useEffect(() => {
    ensureApp();
    const db = getFirestore();
    const DAYS = 14;
    const end = new Date();
    const start = new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000);
    const qy = query(
      collection(db, "auditLogs"),
      where("at", ">=", Timestamp.fromDate(start)),
      orderBy("at", "asc")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const counts = new Map<string, number>();
        const cursor = new Date(start);
        while (cursor <= end) {
          const key = cursor.toISOString().slice(0, 10);
          counts.set(key, 0);
          cursor.setDate(cursor.getDate() + 1);
        }
        snap.forEach((d) => {
          const data = d.data() as any;
          if (String(data?.action || "") !== "login") return;
          const ts: Date | null = toDate(data?.at);
          if (!ts) return;
          const key = ts.toISOString().slice(0, 10);
          if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
        });
        const keys = Array.from(counts.keys()).sort();
        setLoginSeries(keys.map((k) => counts.get(k) || 0));
      },
      () => {}
    );
    return () => unsub();
  }, []);

  const status = useMemo(() => {
    const o = online.length;
    const r = recent.length;
    return `${o} online • ${r} active (15m)`;
  }, [online, recent]);

  return (
    <div className="rounded-lg p-4 card-bg shadow-elev-1">
      <div className="flex items-center justify-between">
        <div className="font-medium">Presence & Logins</div>
        <div className="text-xs text-zinc-500">
          {loading ? "Loading…" : status}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
          {error}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase text-zinc-500">Online now</div>
          {online.length === 0 ? (
            <div className="text-sm text-zinc-500 mt-1">No one online.</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {online.slice(0, 20).map((u) => (
                <li
                  key={u.uid}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate" title={u.name}>
                    {u.name}
                  </span>
                  <span className="text-xs text-green-600">• online</span>
                </li>
              ))}
            </ul>
          )}
          {online.length > 20 && (
            <div className="text-xs text-zinc-500 mt-1">
              +{online.length - 20} more…
            </div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase text-zinc-500">Active (15m)</div>
          {recent.length === 0 ? (
            <div className="text-sm text-zinc-500 mt-1">
              No recent activity.
            </div>
          ) : (
            <ul className="mt-1 space-y-1">
              {recent.map((u) => (
                <li
                  key={u.uid}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate" title={u.name}>
                    {u.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatRelative(u.lastActive)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase text-zinc-500 mb-1">
          Logins (last 14d)
        </div>
        {loginSeries.length ? (
          <div className="text-blue-600 dark:text-blue-400">
            <Sparkline values={loginSeries} />
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No login data.</div>
        )}
      </div>
    </div>
  );
}
