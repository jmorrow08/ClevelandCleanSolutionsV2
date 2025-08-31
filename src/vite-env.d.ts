/// <reference types="vite/client" />

declare global {
  interface Window {
    googleMapsApiLoaded?: boolean;
    initGoogleMaps?: () => void;
  }
}
