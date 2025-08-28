# Payroll Functions Implementation

This document describes the implementation of Firebase callable functions to replace HTTP endpoints for payroll operations, eliminating CORS preflight failures.

## Changes Made

### 1. Firebase Functions (`functions/src/index.ts`)

Created three new callable functions:

- **`createPayrollRun`**: Creates a new payroll run with draft status

  - Input: `{ periodStart, periodEnd }` (timestamps)
  - Output: `{ id, success }`
  - Validates user permissions (admin/owner/super_admin)
  - Creates document in `payrollRuns` collection

- **`recalcPayrollRun`**: Recalculates totals for an existing payroll run

  - Input: `{ runId }`
  - Output: `{ success, totals }`
  - Validates user permissions
  - Calculates totals from approved timesheets
  - Updates the payroll run document

- **`approveTimesheetsInRun`**: Batch approves timesheets for a payroll run
  - Input: `{ runId, timesheetIds }`
  - Output: `{ count }`
  - Validates user permissions
  - Updates timesheet documents with `approvedInRunId`

### 2. Client-Side Updates

#### `src/services/queries/payroll.ts`

- Added `createPayrollRun()` function using `httpsCallable`
- Updated `approveTimesheets()` to use `approveTimesheetsInRun` callable
- Added `recalcPayrollRun()` function using `httpsCallable`
- Enhanced error handling with Firebase Functions specific error codes

#### `src/features/finance/PayrollRunsTab.tsx`

- Added "Create Payroll Run" button
- Implemented `doCreatePayrollRun()` function
- Added proper error handling and user feedback
- Navigation to run detail page upon successful creation

### 3. Configuration Updates

- Updated `firebase.json` to include functions configuration
- Created `functions/package.json` with necessary dependencies
- Created `functions/tsconfig.json` for TypeScript compilation

## Testing

### 1. Start Firebase Emulator

```bash
firebase emulators:start --only functions
```

### 2. Test Functions

The functions are now available at:

- `http://127.0.0.1:5001/cleveland-clean-portal/us-central1/createPayrollRun`
- `http://127.0.0.1:5001/cleveland-clean-portal/us-central1/recalcPayrollRun`
- `http://127.0.0.1:5001/cleveland-clean-portal/us-central1/approveTimesheetsInRun`

### 3. Browser Testing

1. Start your development server
2. Open the browser console
3. Run the test function: `window.testCreatePayrollRun()`
4. Check for success/error messages

### 4. UI Testing

1. Navigate to the Payroll Runs tab
2. Select a date range
3. Click "Create Payroll Run"
4. Verify success toast and navigation to run detail

## Benefits

1. **No CORS Issues**: Callable functions don't trigger CORS preflight requests
2. **Better Security**: Server-side validation and authentication
3. **Improved Error Handling**: Structured error responses
4. **Consistent API**: All payroll operations use the same pattern
5. **Type Safety**: TypeScript support for both client and server

## Error Handling

The implementation includes comprehensive error handling:

- **Authentication Errors**: User not logged in
- **Permission Errors**: User lacks required permissions
- **Validation Errors**: Invalid input parameters
- **Not Found Errors**: Missing resources
- **Network Errors**: Connection issues

All errors are displayed to users via toast notifications with clear, actionable messages.

## Deployment

To deploy the functions to production:

```bash
cd functions
npm run build
firebase deploy --only functions
```

## Notes

- Functions are deployed to `us-central1` region
- All functions require admin/owner/super_admin permissions
- Timesheet approval is now handled via batch operations
- Payroll run creation creates a draft status by default
- Recalculation includes rate caching for performance
