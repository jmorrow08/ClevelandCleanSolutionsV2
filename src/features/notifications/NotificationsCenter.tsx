import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  subscribeToUserNotifications,
  subscribeToOrgAnnouncements,
  markAsRead,
  markAsReadForUser,
  createOrgAnnouncement,
} from "../../services/notifications";
import type {
  AppNotification,
  NotificationChannel,
} from "../../services/notifications";

type ChannelFilter = "all" | NotificationChannel;

export default function NotificationsCenter() {
  const { user, claims } = useAuth();
  const { show } = useToast();
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newChannel, setNewChannel] = useState<NotificationChannel>("in_app");
  const [creating, setCreating] = useState(false);

  const isAdmin = useMemo(
    () => !!(claims?.owner || claims?.super_admin),
    [claims]
  );

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const personal = subscribeToUserNotifications(user.uid, { channel });
    const org = subscribeToOrgAnnouncements({ channel });
    let personalList: AppNotification[] = [];
    let orgList: AppNotification[] = [];
    function sync() {
      const merged = [...personalList, ...orgList].sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      );
      setItems(merged);
      setLoading(false);
    }
    personal.on((list) => {
      personalList = list;
      sync();
    });
    org.on((list) => {
      orgList = list;
      sync();
    });
    return () => {
      personal.unsubscribe();
      org.unsubscribe();
    };
  }, [user?.uid, channel]);

  if (!user)
    return <div className="text-sm">Sign in to view notifications.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium">Notifications</div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelFilter)}
          >
            <option value="all">All channels</option>
            <option value="in_app">In-App</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          {isAdmin && (
            <button
              className="px-2 py-1 rounded-md text-sm bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowNew(true)}
            >
              New Announcement
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-zinc-500">No notifications.</div>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((n) => (
            <li
              key={n.id}
              className="p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {n.title || "Notification"}
                  {n.channel ? (
                    <span className="ml-2 text-xs text-zinc-500">
                      [{n.channel}]
                    </span>
                  ) : null}
                </div>
                {n.message ? (
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                    {n.message}
                  </div>
                ) : null}
                {n.createdAt ? (
                  <div className="text-xs text-zinc-500 mt-1">
                    {formatWhen(n.createdAt as any)}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isRead(n, user.uid) ? (
                  <button
                    className="px-2 py-1 rounded-md text-xs text-white bg-blue-600 hover:bg-blue-700"
                    onClick={async () => {
                      try {
                        if ((n as any).orgWide)
                          await markAsReadForUser(n.id, user.uid, true);
                        else await markAsRead(n.id);
                      } catch (e: any) {
                        show({
                          type: "error",
                          message: e?.message || "Failed",
                        });
                      }
                    }}
                  >
                    Mark as read
                  </button>
                ) : (
                  <span className="text-xs text-green-600">Read</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showNew && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !creating && setShowNew(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 shadow-elev-3 p-4">
            <div className="text-lg font-medium">New Announcement</div>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm mb-1">Title</label>
                <input
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Message</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  rows={4}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Channel</label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800"
                  value={newChannel}
                  onChange={(e) =>
                    setNewChannel(e.target.value as NotificationChannel)
                  }
                >
                  <option value="in_app">In-App</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md border bg-white dark:bg-zinc-900"
                onClick={() => setShowNew(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-white ${
                  creating ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={async () => {
                  if (!newTitle.trim()) {
                    show({ type: "error", message: "Title is required" });
                    return;
                  }
                  try {
                    setCreating(true);
                    await createOrgAnnouncement({
                      title: newTitle.trim(),
                      message: newMessage || "",
                      channel: newChannel,
                    });
                    show({
                      type: "success",
                      message: "Announcement published",
                    });
                    setShowNew(false);
                    setNewTitle("");
                    setNewMessage("");
                    setNewChannel("in_app");
                  } catch (e: any) {
                    show({
                      type: "error",
                      message: e?.message || "Failed to publish",
                    });
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={creating}
              >
                {creating ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatWhen(v: any): string {
  try {
    let d: Date | null = null;
    if (v?.toDate) d = v.toDate();
    else if (v?.seconds) d = new Date(v.seconds * 1000);
    else if (v instanceof Date) d = v;
    if (!d) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function toMillis(v: any): number {
  try {
    if (!v) return 0;
    if (v.toDate) return v.toDate().getTime();
    if (v.seconds) return v.seconds * 1000;
    if (v instanceof Date) return v.getTime();
    return 0;
  } catch {
    return 0;
  }
}

function isRead(n: AppNotification, userId: string): boolean {
  if ((n as any).orgWide) {
    const rb = (n as any).readBy || {};
    return !!rb[userId];
  }
  return !!n.read;
}
