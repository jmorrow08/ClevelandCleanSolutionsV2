import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "../services/firebase";

export type OrgSettings = {
  arTermsDays?: number;
  billingTermsDays?: number;
  arPolicy?: string;
  emailBranding?: {
    fromName?: string;
    fromEmail?: string;
    replyToEmail?: string;
    defaultSubject?: string;
    footerHtml?: string;
  };
  companyProfile?: {
    name?: string;
    email?: string;
    phone?: string;
    logoDataUrl?: string;
  };
  payrollCycle?: {
    frequency?: "weekly" | "biweekly" | "monthly";
    // Historic compatibility field; prefer the explicit anchors below
    anchor?: any;
    // Weekly: 0=Sun .. 6=Sat
    anchorDayOfWeek?: number;
    // Monthly: 1..28 (kept <= 28 to be safe across months)
    anchorDayOfMonth?: number;
    // Biweekly: a known period start date to align 14-day windows
    anchorDate?: any;
  };
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    tiktok?: string;
    youtube?: string;
  };
  featureFlags?: Record<string, boolean>;
};

type SettingsContextValue = {
  settings: OrgSettings | null;
  refresh: () => Promise<void>;
  save: (partial: Partial<OrgSettings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  refresh: async () => {},
  save: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);

  useEffect(() => {
    if (!getApps().length) {
      initializeApp(firebaseConfig);
    }
    refresh();
  }, []);

  async function refresh() {
    const db = getFirestore();
    // Prefer appSettings (public read). Fall back to settings/org if present.
    let snap = await getDoc(doc(db, "appSettings", "org"));
    if (!snap.exists()) {
      try {
        snap = await getDoc(doc(db, "settings", "org"));
      } catch (_) {
        // ignore; keep empty settings
      }
    }
    // Optional: separate company profile doc for invoice header/branding
    let companySnap: any = null;
    try {
      companySnap = await getDoc(doc(db, "appSettings", "company"));
    } catch (_) {
      companySnap = null;
    }
    const raw = (snap.data() as any) ?? {};
    const company =
      (companySnap && companySnap.exists()
        ? (companySnap.data() as any)
        : {}) || {};
    const ar =
      (typeof raw.arTermsDays === "number" ? raw.arTermsDays : undefined) ??
      (typeof raw.billingTermsDays === "number"
        ? raw.billingTermsDays
        : undefined);
    const normalized: OrgSettings = {
      ...raw,
      arTermsDays: ar,
      billingTermsDays: ar,
      emailBranding: raw.emailBranding ?? {},
      companyProfile: {
        name: company.name || raw.companyName || undefined,
        email: company.email || undefined,
        phone: company.phone || undefined,
        logoDataUrl: company.logoDataUrl || undefined,
      },
      payrollCycle:
        typeof raw.payrollCycle === "string"
          ? { frequency: raw.payrollCycle }
          : raw.payrollCycle ?? {},
      socialLinks: raw.socialLinks ?? {},
    };
    setSettings(normalized);
  }

  async function save(partial: Partial<OrgSettings>) {
    // Ensure Firebase app is initialized once
    if (!getApps().length) {
      initializeApp(firebaseConfig);
    }
    const db = getFirestore();
    // Persist to appSettings for compatibility with existing rules
    const ref = doc(db, "appSettings", "org");

    setSettings((prev) => {
      const prevSafe: OrgSettings = prev ?? {};
      const next: OrgSettings = {
        ...prevSafe,
        ...partial,
      };
      // Keep alias fields in sync in state for consumers (e.g., ARAgingTab)
      const ar =
        typeof partial.arTermsDays === "number"
          ? partial.arTermsDays
          : typeof partial.billingTermsDays === "number"
          ? partial.billingTermsDays
          : next.arTermsDays ?? next.billingTermsDays;
      if (typeof ar === "number") {
        next.arTermsDays = ar;
        next.billingTermsDays = ar;
      }
      // Normalize payrollCycle: allow string or object
      if (partial.payrollCycle) {
        const pc = partial.payrollCycle as any;
        next.payrollCycle =
          typeof pc === "string" ? { frequency: pc } : { ...pc };
      }
      return next;
    });

    // Prepare payload to persist; keep both aliases for back-compat
    const payload: any = { ...partial };
    const arPersist =
      typeof partial.arTermsDays === "number"
        ? partial.arTermsDays
        : typeof partial.billingTermsDays === "number"
        ? partial.billingTermsDays
        : undefined;
    if (typeof arPersist === "number") {
      payload.arTermsDays = arPersist;
      payload.billingTermsDays = arPersist;
    }
    if (partial.payrollCycle) {
      const pc = partial.payrollCycle as any;
      payload.payrollCycle =
        typeof pc === "string" ? { frequency: pc } : { ...pc };
    }
    await setDoc(ref, payload, { merge: true });
  }

  const value = useMemo(() => ({ settings, refresh, save }), [settings]);
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
