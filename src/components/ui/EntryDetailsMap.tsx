import { useEffect, useRef, useState, useMemo } from "react";
import {
  initGoogleMaps,
  isGoogleMapsLoaded,
  createMapMarker,
  fitMapToMarkers,
  extractCoordinates,
} from "../../services/maps";

// Google Maps type declarations
declare global {
  namespace google {
    namespace maps {
      class Map {
        constructor(mapDiv: HTMLElement, opts?: MapOptions);
        fitBounds(bounds: LatLngBounds): void;
        setCenter(center: LatLng): void;
        setZoom(zoom: number): void;
      }

      class LatLng {
        constructor(lat: number, lng: number);
        lat(): number;
        lng(): number;
      }

      class LatLngLiteral {
        lat: number;
        lng: number;
      }

      class LatLngBounds {
        extend(point: LatLng): void;
      }

      interface MapOptions {
        center?: LatLng | LatLngLiteral;
        zoom?: number;
        mapTypeControl?: boolean;
        streetViewControl?: boolean;
        fullscreenControl?: boolean;
        zoomControl?: boolean;
      }

      namespace marker {
        interface AdvancedMarkerElementOptions {
          map?: Map | null;
          position?: LatLng | LatLngLiteral;
          title?: string;
          content?: Node | null;
        }

        class AdvancedMarkerElement {
          constructor(opts?: AdvancedMarkerElementOptions);
          map: Map | null;
          position?: LatLng | LatLngLiteral;
          title?: string;
          content?: Node | null;
          addListener(eventName: string, handler: () => void): void;
        }
      }
    }
  }
}

interface Coordinate {
  lat: number;
  lng: number;
  label: string;
  title: string;
  icon?: string;
}

interface EntryDetailsMapProps {
  clockInCoordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  clockOutCoordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  clockInTime?: any;
  clockOutTime?: any;
  height?: string;
  className?: string;
}

function fmt(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export default function EntryDetailsMap({
  clockInCoordinates,
  clockOutCoordinates,
  clockInTime,
  clockOutTime,
  height = "300px",
  className = "",
}: EntryDetailsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapContainerReady, setMapContainerReady] = useState(false);

  // Memoize coordinates to prevent excessive extractCoordinates calls
  const coordinates: Coordinate[] = useMemo(() => {
    const coords: Coordinate[] = [];

    const clockInCoords = extractCoordinates(clockInCoordinates);
    if (clockInCoords) {
      coords.push({
        lat: clockInCoords.lat,
        lng: clockInCoords.lng,
        label: "Clock In",
        title: `Clock In: ${fmt(clockInTime)}`,
        icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
      });
    }

    const clockOutCoords = extractCoordinates(clockOutCoordinates);
    if (clockOutCoords) {
      coords.push({
        lat: clockOutCoords.lat,
        lng: clockOutCoords.lng,
        label: "Clock Out",
        title: `Clock Out: ${fmt(clockOutTime)}`,
        icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
      });
    }
    return coords;
  }, [clockInCoordinates, clockOutCoordinates, clockInTime, clockOutTime]);

  // Callback ref to detect when map container is ready
  const setMapContainerRef = (element: HTMLDivElement | null) => {
    mapRef.current = element;
    setMapContainerReady(!!element);
  };

  // Initialize map
  useEffect(() => {
    // Only proceed if we have coordinates and the container is ready
    if (coordinates.length === 0 || !mapContainerReady) {
      return;
    }

    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // If no coordinates to show, don't initialize map
        if (coordinates.length === 0) {
          setIsLoading(false);
          return;
        }

        // Since we're already checking mapContainerReady, mapRef should be available
        if (!mapRef.current) {
          throw new Error("Map container element not available");
        }

        // Initialize Google Maps API if not already loaded
        if (!isGoogleMapsLoaded()) {
          await initGoogleMaps();
        }

        if (!isMounted) return;

        // Ensure container has dimensions with multiple fallback strategies
        await ensureContainerDimensions(mapRef.current, height);

        if (!isMounted) return;

        // Double-check mapRef is still available after dimension setup
        if (!mapRef.current) {
          throw new Error("Map container lost during dimension setup");
        }

        // Validate coordinates
        if (
          !coordinates[0] ||
          typeof coordinates[0].lat !== "number" ||
          typeof coordinates[0].lng !== "number"
        ) {
          throw new Error("Invalid coordinates provided");
        }

        const mapOptions: google.maps.MapOptions & { mapId?: string } = {
          center: { lat: coordinates[0].lat, lng: coordinates[0].lng },
          zoom: 15,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          // Map ID for Advanced Markers support
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined,
        };

        const map = new google.maps.Map(mapRef.current, mapOptions);
        googleMapRef.current = map;

        // Verify map was created successfully
        if (!map || typeof map.setCenter !== "function") {
          throw new Error("Failed to create map instance");
        }

        // Clear existing markers
        markersRef.current.forEach((marker) => {
          marker.map = null; // Remove marker from map
        });
        markersRef.current = [];

        // Add markers with error handling
        coordinates.forEach((coord, index) => {
          try {
            const marker = createMapMarker(
              new google.maps.LatLng(coord.lat, coord.lng),
              map,
              {
                title: coord.title,
                icon: coord.icon,
                label: coord.label,
              }
            );
            markersRef.current.push(marker);
          } catch (markerError) {
            console.error(
              `EntryDetailsMap: Failed to create marker ${index + 1}:`,
              markerError
            );
          }
        });

        // Fit bounds if there are multiple markers
        if (markersRef.current.length > 1) {
          try {
            fitMapToMarkers(map, markersRef.current);
          } catch (boundsError) {
            console.error(
              "EntryDetailsMap: Failed to fit map bounds:",
              boundsError
            );
          }
        }

        setIsLoading(false);
      } catch (err) {
        console.error(
          `EntryDetailsMap: Failed to initialize map (attempt ${
            retryCount + 1
          }):`,
          err
        );

        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          // Retry logic for certain types of errors
          if (
            retryCount < maxRetries &&
            (errorMessage?.includes("dimensions") ||
              errorMessage?.includes("container") ||
              errorMessage?.includes("timeout") ||
              errorMessage?.includes("not available") ||
              errorMessage?.includes("lost"))
          ) {
            retryCount++;
            setTimeout(() => {
              if (isMounted) initializeMap();
            }, 500 * retryCount); // Exponential backoff
            return;
          }

          // Final error
          setError(
            errorMessage?.includes("API")
              ? "Failed to load Google Maps API. Please check your internet connection."
              : "Failed to load map. Please refresh the page and try again."
          );
          setIsLoading(false);
        }
      }
    };

    // Helper function to ensure container has proper dimensions
    const ensureContainerDimensions = async (
      container: HTMLElement,
      height: string
    ) => {
      // Force layout calculation
      container.style.width = "100%";
      container.style.height = height;
      container.style.position = "relative";

      // Wait for DOM to update
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const rect = container.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        container.style.minWidth = "300px";
        container.style.minHeight = "200px";

        // Wait again
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    initializeMap();

    // Cleanup function
    const cleanup = () => {
      isMounted = false;
      if (googleMapRef.current) {
        // Clear markers
        markersRef.current.forEach((marker) => {
          marker.map = null; // Remove marker from map
        });
        markersRef.current = [];
        // Note: Google Maps doesn't have a destroy method, but we clear references
        googleMapRef.current = null;
      }
    };

    return cleanup;
  }, [coordinates, height, mapContainerReady]);

  // Don't render anything if no coordinates
  if (coordinates.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg ${className}`}
      >
        <div className="text-center p-4">
          <div className="text-gray-500 mb-2">📍</div>
          <div className="text-sm text-gray-600">
            No location data available
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg ${className}`}
        style={{ height }}
      >
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️</div>
          <div className="text-sm text-gray-600">{error}</div>
        </div>
      </div>
    );
  }

  // Always render the map container so the ref callback gets called
  // Show loading overlay on top if still loading

  return (
    <div className={`relative ${className}`}>
      <div
        ref={setMapContainerRef}
        className="w-full rounded-lg border border-gray-200"
        style={{
          height,
          minHeight: "200px",
          position: "relative",
          display: "block", // Ensure it's a block element
        }}
        data-testid="map-container"
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-50 bg-opacity-75 flex items-center justify-center rounded-lg z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <div className="text-sm text-gray-600">Loading map...</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {coordinates.length > 0 && !isLoading && (
        <div className="absolute top-2 right-2 bg-white bg-opacity-90 p-2 rounded shadow-lg z-10">
          <div className="text-xs font-medium text-gray-700 mb-1">Legend:</div>
          {coordinates.map((coord, index) => (
            <div
              key={index}
              className="flex items-center gap-1 text-xs text-gray-600 mb-1"
            >
              <img
                src={coord.icon}
                alt={coord.label}
                className="w-4 h-4"
                onError={(e) => {
                  // Fallback for icon loading errors
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span>{coord.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
