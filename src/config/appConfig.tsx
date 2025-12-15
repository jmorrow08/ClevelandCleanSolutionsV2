import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AppFeatures = {
  auth: boolean;
  invoicing: boolean;
  scheduling: boolean;
  crm: boolean;
  hr: boolean;
  marketing: boolean;
  analytics: boolean;
  tools: boolean;
};

export type AppConfig = {
  companyName: string;
  companyAddress: string;
  supportEmail: string;
  defaultMapCenter: {
    lat: number;
    lng: number;
  };
  features: AppFeatures;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  companyName: "Cleveland Clean Solutions",
  companyAddress: "123 Superior Ave, Cleveland, OH 44114",
  supportEmail: "support@clevelandcleansolutions.com",
  defaultMapCenter: {
    lat: 41.4993,
    lng: -81.6944,
  },
  features: {
    auth: true,
    invoicing: true,
    scheduling: true,
    crm: true,
    hr: true,
    marketing: false,
    analytics: true,
    tools: true,
  },
};

const AppConfigContext = createContext<AppConfig>(DEFAULT_APP_CONFIG);

type ProviderProps = {
  children: ReactNode;
  value?: Partial<AppConfig>;
};

export function AppConfigProvider({ children, value }: ProviderProps) {
  const merged = useMemo<AppConfig>(() => {
    const mergedMapCenter = {
      ...DEFAULT_APP_CONFIG.defaultMapCenter,
      ...(value?.defaultMapCenter ?? {}),
    };
    const mergedFeatures: AppFeatures = {
      ...DEFAULT_APP_CONFIG.features,
      ...(value?.features ?? {}),
    };
    return {
      ...DEFAULT_APP_CONFIG,
      ...value,
      defaultMapCenter: mergedMapCenter,
      features: mergedFeatures,
    };
  }, [value]);

  return (
    <AppConfigContext.Provider value={merged}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext);
}
