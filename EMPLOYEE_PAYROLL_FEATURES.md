# Employee Payroll Features

## Overview

This document describes the new per-period summary and payroll history features that have been added to the employee timesheet view.

## Features Implemented

### 1. Current Period Summary

- **Location**: `src/features/employee/TimesheetView.tsx`
- **Description**: Employees can now see a summary of their current pay period including:
  - Current pay period date range (calculated based on organization settings)
  - Total hours worked in the current period
  - Estimated earnings for the current period
- **Display**: Blue highlighted card at the top of the timesheet view
- **Calculation**: Uses the organization's payroll cycle settings to determine the current period

### 2. Payroll History

- **Location**: `src/features/employee/TimesheetView.tsx`
- **Description**: Employees can view their payroll history showing:
  - Locked payroll runs (completed pay periods)
  - Period date ranges
  - Total hours worked per period
  - Total earnings per period
  - Status of each payroll run
- **Data Source**: Queries `payrollRuns` collection for locked runs and calculates totals from associated timesheets
- **Display**: Clean list format with period dates and earnings prominently displayed

### 3. Rate Calculation

- **Location**: `src/utils/rateUtils.ts`
- **Description**: Centralized utility functions for calculating earnings:
  - `calculateTimesheetEarnings()`: Calculates earnings for a single timesheet entry
  - `formatCurrency()`: Formats currency amounts for display
- **Support**: Handles both hourly and per-visit (piece-rate) calculations
- **Legacy Support**: Includes fallback for legacy rate snapshot formats

## Technical Implementation

### Database Queries

- **Current Period**: Uses existing timesheet queries filtered by date range
- **Payroll History**:
  - Queries `payrollRuns` collection for locked runs
  - For each run, queries `timesheets` collection for employee's approved timesheets
  - Calculates totals client-side for performance

### Firestore Indexes

Added new indexes to support the queries:

```json
{
  "collectionGroup": "payrollRuns",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "periodEnd", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "timesheets",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "employeeId", "order": "ASCENDING" },
    { "fieldPath": "approvedInRunId", "order": "ASCENDING" }
  ]
}
```

### Security Rules

- Employees can read locked payroll runs (existing rule)
- Employees can read their own timesheets (existing rule)
- No additional security rules needed

## Usage

### For Employees

1. Navigate to the Payroll page in the employee portal
2. View current period summary at the top
3. Scroll down to see payroll history
4. Continue using existing timesheet functionality

### For Administrators

- No changes needed to existing payroll processes
- Employees will automatically see their current period estimates
- Payroll history will populate as runs are locked

## Future Enhancements

### Option A: Quick Implementation (Current)

- Client-side calculation of payroll history totals
- Suitable for smaller organizations

### Option B: Scalable Implementation (Future)

- Cloud function to write per-employee summaries to `payrollRuns/{id}/employees/{uid}`
- Better performance for larger organizations
- Reduces client-side computation

## Files Modified

- `src/features/employee/TimesheetView.tsx` - Main implementation
- `src/features/employee/PayrollPage.tsx` - Updated to use enhanced TimesheetView
- `src/utils/rateUtils.ts` - New utility functions
- `firestore.indexes.json` - Added required indexes

## Testing

- Verify current period calculation matches organization settings
- Test with both hourly and per-visit rate types
- Confirm payroll history shows locked runs correctly
- Test with various rate snapshot formats (new and legacy)
