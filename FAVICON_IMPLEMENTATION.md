# Custom Favicon Implementation

## Overview

This implementation adds custom favicon support to the Cleveland Clean Solutions admin portal, allowing administrators to upload and manage custom favicons through the Organization Settings page.

## Features

- **Custom Favicon Upload**: Admins can upload custom favicons (PNG, ICO, SVG) through the Organization Settings
- **Dynamic Updates**: Favicon and page title update automatically when settings change
- **Fallback Support**: Graceful fallback to default CCS favicon if custom favicon fails to load
- **Browser Compatibility**: Supports multiple favicon formats and sizes
- **Real-time Preview**: Shows favicon preview in settings page

## Implementation Details

### Files Modified

- `src/context/SettingsContext.tsx` - Added `faviconDataUrl` to settings schema
- `src/features/settings/OrgSettings.tsx` - Added favicon upload UI
- `src/components/FaviconUpload.tsx` - New reusable favicon upload component
- `src/hooks/useFavicon.tsx` - Custom hook for favicon management
- `src/App.tsx` - Integrated favicon hook into app
- `index.html` - Updated with new favicon and title
- `public/favicon.svg` - Default CCS favicon

### File Validation

- **Supported Formats**: PNG, JPEG, GIF, SVG, ICO
- **Size Limit**: 1MB maximum
- **Automatic Conversion**: Files are converted to base64 data URLs for storage

### Settings Schema

```typescript
companyProfile?: {
  name?: string;
  email?: string;
  phone?: string;
  logoDataUrl?: string;
  faviconDataUrl?: string; // NEW: Custom favicon data URL
};
```

### Usage

1. Navigate to Organization Settings
2. Scroll to Company Profile section
3. Find the "Favicon" field
4. Click to upload or drag & drop a favicon image
5. Save settings to apply changes

### Browser Support

- Modern browsers with SVG favicon support (recommended)
- Fallback to PNG/ICO for older browsers
- Apple touch icon support for iOS devices

### Storage

- Favicon data is stored as base64 data URL in Firestore
- Data is saved to `appSettings/company` collection
- Settings are cached and synchronized across sessions

## Future Enhancements

- Multiple favicon sizes for different devices
- Automatic favicon generation from company logo
- Favicon preview in browser tabs during upload
- Batch favicon processing for multiple formats

## Technical Notes

- The `useFavicon` hook listens to settings changes and updates the document dynamically
- Favicon is updated by manipulating the DOM `<link>` elements
- Title is updated to include company name when available
- SVG format provides crisp scaling across all device sizes
