import { useEffect } from "react";
import { useSettings } from "../context/SettingsContext";

export function useFavicon() {
  const { settings } = useSettings();

  useEffect(() => {
    const companyName = settings?.companyProfile?.name;
    const faviconDataUrl = settings?.companyProfile?.faviconDataUrl;

    // Update document title
    const baseTitle = "Cleveland Clean Solutions";
    const title = companyName ? `${companyName}` : baseTitle;
    document.title = title;

    // Update favicon
    updateFavicon(faviconDataUrl);

    // Cleanup function to restore defaults when component unmounts
    return () => {
      // Only restore if we're actually unmounting (not just settings changing)
      // We don't want to restore defaults when settings change
    };
  }, [
    settings?.companyProfile?.name,
    settings?.companyProfile?.faviconDataUrl,
  ]);
}

function updateFavicon(faviconDataUrl?: string) {
  // Remove existing favicon links
  const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
  existingFavicons.forEach((link) => link.remove());

  // Create new favicon link
  const link = document.createElement("link");
  link.rel = "icon";

  if (faviconDataUrl) {
    // Use custom favicon
    link.href = faviconDataUrl;

    // Try to determine the type from the data URL
    if (faviconDataUrl.includes("data:image/svg+xml")) {
      link.type = "image/svg+xml";
    } else if (faviconDataUrl.includes("data:image/png")) {
      link.type = "image/png";
    } else if (
      faviconDataUrl.includes("data:image/x-icon") ||
      faviconDataUrl.includes("data:image/ico")
    ) {
      link.type = "image/x-icon";
    }
  } else {
    // Use default favicon
    link.href = "/favicon.ico";
    link.type = "image/x-icon";
  }

  // Add the link to the document head
  document.head.appendChild(link);
}

// Utility function to get current favicon data URL
export function getCurrentFaviconDataUrl(): string | null {
  const favicon = document.querySelector(
    'link[rel*="icon"]'
  ) as HTMLLinkElement;
  return favicon?.href || null;
}

// Utility function to check if favicon is default
export function isDefaultFavicon(): boolean {
  const favicon = document.querySelector(
    'link[rel*="icon"]'
  ) as HTMLLinkElement;
  return favicon?.href?.includes("/favicon.ico") || !favicon?.href;
}
