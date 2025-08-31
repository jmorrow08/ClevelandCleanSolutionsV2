# Google Maps Setup for V2 Activity Enhancement

## Overview

The V2 Activity section has been enhanced with employee time tracking and Google Maps integration for displaying clock-in/out locations.

## Prerequisites

- Google Cloud Console account
- Firebase project with Firestore enabled
- V2 employee portal already collecting GPS coordinates

## Setup Steps

### 1. Google Maps API Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - **Maps JavaScript API** (required)
   - **Geocoding API** (optional, for address lookup)
4. Create an API key in "Credentials" section
5. Restrict the API key to your domain for security

### 2. Environment Configuration

Create a `.env.local` file in the project root with:

```bash
# Firebase Configuration (existing)
VITE_FIREBASE_API_KEY="your_firebase_api_key"
VITE_FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_project_id"
VITE_FIREBASE_STORAGE_BUCKET="your_project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
VITE_FIREBASE_APP_ID="your_app_id"
VITE_FIREBASE_MEASUREMENT_ID="your_measurement_id"

# Google Maps API Configuration (new)
VITE_GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"
```

### 3. Features Enabled

After setup, the enhanced Activity section will provide:

- **Real-time Employee Tracking**: Live updates of currently clocked-in employees
- **Location Visualization**: Interactive maps showing clock-in/out locations
- **Activity Statistics**: Dashboard with active employees, today's activity, and total entries
- **Filtering Options**: Filter by active status, today's entries, or all entries
- **Detailed Views**: Click on map markers or table rows for detailed activity information

## Data Requirements

The enhancement leverages existing V2 infrastructure:

- Employee portal already collects GPS coordinates via `navigator.geolocation`
- Coordinates stored as `GeoPoint` in Firestore (`clockInCoordinates`, `clockOutCoordinates`)
- `employeeTimeTracking` collection has proper security rules

## Security Considerations

- API key is restricted to prevent unauthorized usage
- Location data access is limited to admin/owner roles
- All map interactions are client-side only

## Troubleshooting

- **Maps not loading**: Check API key configuration and console errors
- **No coordinates showing**: Verify employee portal is collecting GPS data
- **Performance issues**: Maps load asynchronously and only when needed

## V1 Compatibility

This enhancement brings V2 Activity section to feature parity with V1's employee activity dashboard while maintaining V2's modern architecture and improved user experience.
