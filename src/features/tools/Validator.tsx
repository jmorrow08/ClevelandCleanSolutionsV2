import { useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "../../services/firebase";

type MissingField = { docId: string; missingField: string };
type ExampleValue = { docId: string; value: unknown };
type CollectionResult = {
  count: number;
  missingFields: MissingField[];
  exampleValues: Record<string, ExampleValue[]>;
  expectedFields: string[];
};
type ApiResponse = {
  success: boolean;
  results: Record<string, CollectionResult>;
  // timestamp may be present from server; we don't rely on it
  timestamp?: unknown;
};

function computeValidatorUrl(): string {
  const projectId = firebaseConfig.projectId;
  const useEmulator =
    (import.meta.env as any).VITE_USE_FIREBASE_EMULATOR === "true" &&
    import.meta.env.DEV;
  if (useEmulator) {
    // Firebase Functions emulator default: http://127.0.0.1:5001/{project}/us-central1/{name}
    return `http://127.0.0.1:5001/${projectId}/us-central1/validateCollectionFields`;
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/validateCollectionFields`;
}

function buildDeepLink(collection: string, docId: string): string | null {
  switch (collection) {
    case "clientMasterList":
      return `/crm/clients/${docId}`;
    case "employeeMasterList":
      return `/hr/${docId}`;
    case "serviceHistory":
      return `/service-history/${docId}`;
    case "locations":
      return `/crm/locations/${docId}`;
    // Unknown or no direct edit route (show none)
    case "employeeRates":
    case "employeePayroll":
    case "servicePhotos":
    default:
      return null;
  }
}

export default function Validator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  async function runValidation() {
    try {
      setLoading(true);
      setError(null);
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Missing auth token. Please sign in again.");
      }
      const url = computeValidatorUrl();
      const resp = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
      }
      const json = (await resp.json()) as ApiResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const items: Array<{
      collection: string;
      docId: string;
      missingField: string;
      link: string | null;
    }> = [];
    if (!data?.results) return items;
    for (const [collection, result] of Object.entries(data.results)) {
      for (const mf of result.missingFields || []) {
        items.push({
          collection,
          docId: mf.docId,
          missingField: mf.missingField,
          link: buildDeepLink(collection, mf.docId),
        });
      }
    }
    return items;
  }, [data]);

  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      // no-op
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tools / Validator</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md text-sm bg-[var(--brand)] text-white hover:brightness-95 disabled:opacity-50"
            onClick={runValidation}
            disabled={loading}
          >
            {loading ? "Running..." : "Run Validation"}
          </button>
          {data && (
            <button
              className="px-3 py-2 rounded-md text-sm bg-[var(--muted)] text-[var(--text)] border border-[var(--border)] hover:brightness-95"
              onClick={runValidation}
            >
              Re-check
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-md">
          {error}
        </div>
      )}

      {!data && !loading && (
        <p className="text-sm opacity-80">
          Click "Run Validation" to scan collections.
        </p>
      )}

      {data && (
        <div className="space-y-3">
          <div className="text-sm opacity-80">
            Showing missing required fields across collections. Examples per
            field are collected on the server.
          </div>

          <div className="overflow-auto border border-[var(--border)] rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)] text-[var(--text)]/80">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-[var(--border)]">
                    Collection
                  </th>
                  <th className="text-left px-3 py-2 border-b border-[var(--border)]">
                    Doc ID
                  </th>
                  <th className="text-left px-3 py-2 border-b border-[var(--border)]">
                    Missing Field
                  </th>
                  <th className="text-left px-3 py-2 border-b border-[var(--border)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3" colSpan={4}>
                      No issues found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr
                      key={`${r.collection}:${r.docId}:${r.missingField}:${idx}`}
                      className="odd:bg-[var(--card)]/40"
                    >
                      <td className="px-3 py-2 align-top">{r.collection}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-[var(--muted)] px-2 py-0.5 rounded">
                            {r.docId}
                          </code>
                          <button
                            className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--muted)]"
                            onClick={() => copy(r.docId)}
                            aria-label="Copy doc id"
                          >
                            Copy
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">{r.missingField}</td>
                      <td className="px-3 py-2 align-top">
                        {r.link ? (
                          <a
                            className="text-xs px-2 py-1 rounded bg-[var(--brand)] text-white hover:brightness-95"
                            href={r.link}
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-xs opacity-60">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
