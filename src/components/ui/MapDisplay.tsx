import { useEffect, useRef, useState } from "react";
import {
  initGoogleMaps,
  isGoogleMapsLoaded,
  createMapMarker,
  fitMapToMarkers,
  formatCoordinates,
  getAddressFromCoordinates,
} from "../../services/maps";
import { useAppConfig } from "@/config/appConfig";

interface Coordinate {
  lat: number;
  lng: number;
  label?: string;
  title?: string;
  icon?: string;
}

interface MapDisplayProps {
  coordinates: Coordinate[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  height?: string;
  showControls?: boolean;
  onMarkerClick?: (coordinate: Coordinate) => void;
  markers?: Array<{
    position: { lat: number; lng: number };
    title?: string;
    label?: string;
    icon?: string;
  }>;
}

export default function MapDisplay({
  coordinates,
  center,
  zoom = 12,
  className = "",
  height = "400px",
  showControls = true,
  onMarkerClick,
  markers,
}: MapDisplayProps) {
  const { defaultMapCenter } = useAppConfig();
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  // Initialize map
  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Google Maps API if not already loaded
        if (!isGoogleMapsLoaded()) {
          await initGoogleMaps();
        }

        if (!isMounted || !mapRef.current) return;

        // Create map instance
        const mapOptions: google.maps.MapOptions = {
          center: center || defaultMapCenter,
          zoom: zoom,
          mapTypeControl: showControls,
          streetViewControl: showControls,
          fullscreenControl: showControls,
          zoomControl: showControls,
        };

        const map = new google.maps.Map(mapRef.current, mapOptions);
        googleMapRef.current = map;

        // Clear existing markers
        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        // Add markers
        const allMarkers =
          markers ||
          coordinates.map((coord) => ({
            position: { lat: coord.lat, lng: coord.lng },
            title: coord.title,
            label: coord.label,
            icon: coord.icon,
          }));

        allMarkers.forEach((markerData, index) => {
          const marker = createMapMarker(
            new google.maps.LatLng(
              markerData.position.lat,
              markerData.position.lng
            ),
            map,
            {
              title: markerData.title,
              icon: markerData.icon,
              label: markerData.label,
            }
          );

          // Add click listener if callback provided
          if (onMarkerClick && coordinates[index]) {
            marker.addListener("click", () => {
              onMarkerClick(coordinates[index]);
            });
          }

          markersRef.current.push(marker);
        });

        // Fit bounds if there are markers
        if (markersRef.current.length > 0) {
          fitMapToMarkers(map, markersRef.current);
        }

        setIsLoading(false);
      } catch (err) {
        console.error("Failed to initialize map:", err);
        if (isMounted) {
          setError(
            "Failed to load map. Please check your internet connection."
          );
          setIsLoading(false);
        }
      }
    };

    initializeMap();

    return () => {
      isMounted = false;
    };
  }, [
    coordinates,
    center,
    zoom,
    markers,
    showControls,
    onMarkerClick,
    defaultMapCenter,
  ]);

  // Load addresses for coordinates
  useEffect(() => {
    const loadAddresses = async () => {
      const newAddresses: Record<string, string> = {};

      for (const coord of coordinates) {
        const key = `${coord.lat},${coord.lng}`;
        if (!addresses[key]) {
          try {
            const address = await getAddressFromCoordinates(
              coord.lat,
              coord.lng
            );
            newAddresses[key] = address;
          } catch (err) {
            newAddresses[key] = formatCoordinates(coord.lat, coord.lng);
          }
        }
      }

      if (Object.keys(newAddresses).length > 0) {
        setAddresses((prev) => ({ ...prev, ...newAddresses }));
      }
    };

    if (coordinates.length > 0 && !isLoading) {
      loadAddresses();
    }
  }, [coordinates, isLoading, addresses]);

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

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg ${className}`}
        style={{ height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <div className="text-sm text-gray-600">Loading map...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapRef}
        className="w-full rounded-lg border border-gray-200"
        style={{ height }}
      />

      {/* Coordinate list overlay */}
      {coordinates.length > 0 && (
        <div className="absolute top-2 right-2 bg-white bg-opacity-90 p-2 rounded shadow-lg max-w-xs max-h-32 overflow-y-auto">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Locations:
          </div>
          {coordinates.map((coord, index) => {
            const key = `${coord.lat},${coord.lng}`;
            const address = addresses[key] || "Loading...";
            return (
              <div key={index} className="text-xs text-gray-600 mb-1">
                <div className="font-medium">
                  {coord.label || `Point ${index + 1}`}
                </div>
                <div className="text-gray-500 truncate" title={address}>
                  {address}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
