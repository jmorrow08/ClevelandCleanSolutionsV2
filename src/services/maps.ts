import { Loader } from "@googlemaps/js-api-loader";

// Google Maps configuration
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  "AIzaSyCm6ln4PSDxYKsrNEFpuYlnjA0B3dJxGLs"; // Fallback to V1 key for development

// Global loader instance
let loader: Loader | null = null;

/**
 * Get or create the Google Maps loader instance
 */
export function getMapsLoader(): Loader {
  if (!loader) {
    loader = new Loader({
      apiKey: GOOGLE_MAPS_API_KEY,
      version: "weekly",
      libraries: ["places", "geometry", "marker"],
    });
  }
  return loader;
}

/**
 * Initialize Google Maps API
 */
export async function initGoogleMaps(): Promise<void> {
  try {
    console.log("Maps service: Starting Google Maps API initialization");

    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is not configured");
    }

    console.log("Maps service: API Key present:", GOOGLE_MAPS_API_KEY);

    // Check if already loaded (either via script or loader)
    if (isGoogleMapsLoaded()) {
      console.log("Maps service: Google Maps API already loaded");
      return;
    }

    // Note: Using only loader-based loading for better performance

    const mapsLoader = getMapsLoader();
    console.log("Maps service: Loader instance created");

    // Add timeout to prevent hanging
    const loadPromise = mapsLoader.load();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Google Maps API loading timeout")),
        15000 // Increased timeout
      );
    });

    console.log("Maps service: Waiting for Google Maps to load...");
    await Promise.race([loadPromise, timeoutPromise]);

    console.log(
      "Maps service: Load promise resolved, checking if API is available..."
    );

    // Verify the API loaded correctly
    if (!isGoogleMapsLoaded()) {
      console.error("Maps service: Google Maps API failed to load properly");
      console.log("Maps service: window.google:", typeof window.google);
      console.log(
        "Maps service: window.google.maps:",
        typeof (window as any).google?.maps
      );
      throw new Error("Google Maps API loaded but objects not available");
    }

    console.log("Google Maps API loaded successfully");
    console.log(
      "Maps service: google.maps object available:",
      typeof google.maps
    );
    console.log(
      "Maps service: google.maps.Map available:",
      typeof google.maps.Map
    );
  } catch (error) {
    console.error("Failed to load Google Maps API:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Maps service: Error details:", errorMessage);

    // Provide more specific error messages
    if (errorMessage?.includes("RefererNotAllowed")) {
      throw new Error(
        "Google Maps API key not authorized for this domain. Please add 'http://localhost:5174' to your API key restrictions in Google Cloud Console."
      );
    } else if (errorMessage?.includes("timeout")) {
      throw new Error(
        "Google Maps API loading timed out. Please check your internet connection and try again."
      );
    } else if (errorMessage?.includes("API key")) {
      throw new Error(
        "Google Maps API key is not configured. Please check your environment variables."
      );
    } else if (errorMessage?.includes("not available")) {
      throw new Error(
        "Google Maps API loaded but required objects are missing. Please try refreshing the page."
      );
    } else {
      throw new Error(`Failed to load Google Maps API: ${errorMessage}`);
    }
  }
}

/**
 * Check if Google Maps API is loaded
 */
export function isGoogleMapsLoaded(): boolean {
  // Check if Google Maps API is loaded via loader
  const hasAdvancedMarkers =
    typeof google !== "undefined" &&
    typeof google.maps !== "undefined" &&
    typeof (google.maps as any).marker !== "undefined" &&
    typeof (google.maps as any).marker.AdvancedMarkerElement !== "undefined";

  const isLoaded =
    typeof google !== "undefined" &&
    typeof google.maps !== "undefined" &&
    typeof google.maps.Map !== "undefined" &&
    hasAdvancedMarkers;

  console.log("Maps service: isGoogleMapsLoaded check:", {
    isLoaded,
    googleAvailable: typeof google !== "undefined",
    mapsAvailable: typeof (window as any).google?.maps !== "undefined",
    advancedMarkerAvailable: hasAdvancedMarkers,
  });

  return isLoaded;
}

/**
 * Convert Firestore GeoPoint to Google Maps LatLng
 */
export function geoPointToLatLng(geoPoint: any): google.maps.LatLng | null {
  if (!geoPoint || !isGoogleMapsLoaded()) return null;

  // Handle different GeoPoint formats
  let lat: number | undefined;
  let lng: number | undefined;

  // Handle Firestore GeoPoint objects (which have latitude() and longitude() methods)
  if (
    typeof geoPoint.latitude === "function" &&
    typeof geoPoint.longitude === "function"
  ) {
    lat = geoPoint.latitude();
    lng = geoPoint.longitude();
  } else {
    // Handle plain objects with latitude/longitude properties
    lat = geoPoint.latitude || geoPoint.lat || geoPoint._lat;
    lng = geoPoint.longitude || geoPoint.lng || geoPoint._long;
  }

  if (typeof lat === "number" && typeof lng === "number") {
    return new google.maps.LatLng(lat, lng);
  }

  return null;
}

/**
 * Create a map marker with custom styling using AdvancedMarkerElement
 */
export function createMapMarker(
  position: google.maps.LatLng,
  map: google.maps.Map,
  options: {
    title?: string;
    icon?: string;
    label?: string;
  } = {}
): google.maps.marker.AdvancedMarkerElement {
  if (!(google.maps as any).marker?.AdvancedMarkerElement) {
    throw new Error("AdvancedMarkerElement is not available on google.maps");
  }

  const markerOptions: google.maps.marker.AdvancedMarkerElementOptions = {
    map,
    position,
    title: options.title,
  };

  let content: HTMLElement | null = null;

  const secureIcon =
    options.icon && options.icon.startsWith("http://")
      ? options.icon.replace("http://", "https://")
      : options.icon;

  if (secureIcon) {
    const iconElement = document.createElement("img");
    iconElement.src = secureIcon;
    iconElement.alt = options.title || options.label || "Map marker";
    iconElement.style.width = "32px";
    iconElement.style.height = "32px";
    iconElement.style.objectFit = "contain";
    content = iconElement;
  } else if (options.label) {
    const labelElement = document.createElement("div");
    labelElement.textContent = options.label;
    labelElement.style.cssText = `
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    content = labelElement;
  }

  if (content) {
    markerOptions.content = content;
  }

  const AdvancedMarker =
    (google.maps as any).marker.AdvancedMarkerElement as new (
      opts?: google.maps.marker.AdvancedMarkerElementOptions
    ) => google.maps.marker.AdvancedMarkerElement;

  const marker = new AdvancedMarker(markerOptions);
  return marker;
}

/**
 * Fit map bounds to contain all markers (AdvancedMarkerElement compatible)
 */
export function fitMapToMarkers(
  map: google.maps.Map,
  markers: google.maps.marker.AdvancedMarkerElement[]
): void {
  if (markers.length === 0) return;

  const bounds = new google.maps.LatLngBounds();
  markers.forEach((marker) => {
    const position = marker.position;
    if (!position) {
      return;
    }

    if (position instanceof google.maps.LatLng) {
      bounds.extend(position);
      return;
    }

    if (
      typeof (position as google.maps.LatLngLiteral)?.lat === "number" &&
      typeof (position as google.maps.LatLngLiteral)?.lng === "number"
    ) {
      bounds.extend(
        new google.maps.LatLng(
          (position as google.maps.LatLngLiteral).lat,
          (position as google.maps.LatLngLiteral).lng
        )
      );
    }
  });

  map.fitBounds(bounds);

  // Don't zoom in too much for single points
  if (markers.length === 1) {
    const currentZoom = (map as any).getZoom ? (map as any).getZoom() : 15;
    map.setZoom(Math.min(currentZoom || 15, 15));
  }
}

/**
 * Extract latitude and longitude from a GeoPoint object
 */
export function extractCoordinates(
  geoPoint: any
): { lat: number; lng: number } | null {
  if (!geoPoint) {
    return null;
  }

  let lat: number | undefined;
  let lng: number | undefined;

  // Handle Firestore GeoPoint objects (which have latitude() and longitude() methods)
  if (
    typeof geoPoint.latitude === "function" &&
    typeof geoPoint.longitude === "function"
  ) {
    lat = geoPoint.latitude();
    lng = geoPoint.longitude();
  } else {
    // Handle plain objects with latitude/longitude properties
    lat = geoPoint.latitude || geoPoint.lat || geoPoint._lat;
    lng = geoPoint.longitude || geoPoint.lng || geoPoint._long;
  }

  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }

  return null;
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Calculate distance between two points in kilometers
 */
export function calculateDistance(
  point1: google.maps.LatLng,
  point2: google.maps.LatLng
): number {
  return (
    (google.maps as any).geometry?.spherical?.computeDistanceBetween?.(
      point1,
      point2
    ) / 1000 || 0
  );
}

/**
 * Get address from coordinates using reverse geocoding
 */
export async function getAddressFromCoordinates(
  lat: number,
  lng: number
): Promise<string> {
  if (!isGoogleMapsLoaded()) return "Address unavailable";

  return new Promise((resolve) => {
    const geocoder = new (google.maps as any).Geocoder();
    const latlng = new google.maps.LatLng(lat, lng);

    geocoder.geocode({ location: latlng }, (results: any, status: any) => {
      if (
        status === (google.maps as any).GeocoderStatus?.OK &&
        results &&
        results[0]
      ) {
        resolve(results[0].formatted_address);
      } else {
        resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    });
  });
}
