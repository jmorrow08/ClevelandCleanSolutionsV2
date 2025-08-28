# Payroll Prep Feature

## Overview

The Payroll Prep feature allows administrators to scan serviceHistory jobs for a selected period, generate missing timesheets, and set rate snapshots for payroll processing.

## Features

### 1. Period Selection

- Default period is set from the organization's payroll cycle settings
- Manual date range selection (start and end dates)
- Validation to ensure end date is after start date

### 2. Job Scanning

- Queries `serviceHistory` collection for jobs within the selected period
- Extracts employee assignments from both `assignedEmployees` array and legacy `employeeAssignments`
- Identifies jobs that don't have existing timesheets

### 3. Rate Resolution

- Looks up effective employee rates for each job assignment
- Supports both hourly and per-visit rate types
- Prioritizes scoped rates (location-specific or client-specific) over global rates
- Falls back to global rates if no scoped rate is found

### 4. Timesheet Generation

- Creates draft timesheets with `employeeApproved: false` and `adminApproved: false`
- Sets appropriate rate snapshots based on the effective rate at the job date
- For hourly rates: calculates hours from job duration (if available)
- For per-visit rates: sets units = 1

### 5. Missing Rate Detection

- Identifies assignments where no effective rate can be found
- Shows warnings for missing rates
- Skips generation for assignments without rates

## Usage

### Access

1. Navigate to **Finance** in the admin sidebar
2. Click on the **Payroll Prep** tab
3. Or directly access `/finance/payroll-prep`

### Workflow

1. **Set Period**: Adjust start and end dates if needed (defaults to last completed payroll period)
2. **Scan Jobs**: Click "Scan Jobs" to analyze serviceHistory for the period
3. **Review Results**: Check the summary statistics and preview table
4. **Generate Timesheets**: Click "Generate Timesheets" to create draft timesheets

### UI Components

#### Summary Statistics

- Total Jobs: Number of serviceHistory entries in the period
- Total Assignments: Number of employee-job assignments
- Draft Timesheets: Number of timesheets that will be generated
- Missing Rates: Number of assignments without rate information

#### Preview Table

Shows all draft timesheets with:

- Employee ID
- Job ID
- Service Date
- Rate Type (Per Visit/Hourly)
- Rate Amount
- Units/Hours
- Status (Draft)

## Data Structure

### Timesheet Fields

```typescript
{
  employeeId: string;
  jobId: string;
  start: Timestamp;
  end: Timestamp;
  hours: number;
  units: number;
  rateSnapshot: {
    type: "per_visit" | "hourly";
    amount: number;
  }
  employeeApproved: false;
  adminApproved: false;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Rate Resolution Logic

1. **Scoped Rates**: Look for rates with matching `locationId` or `clientProfileId`
2. **Global Rates**: Fallback to rates without location/client scope
3. **Rate Types**: Support both `per_visit` and `hourly` rate types
4. **Effective Date**: Use the most recent rate effective on or before the job date

## Error Handling

- **Missing Rates**: Assignments without rate information are skipped and reported
- **Existing Timesheets**: Jobs with existing timesheets are skipped
- **Invalid Dates**: Validation prevents invalid date ranges
- **Network Errors**: Graceful error handling with user-friendly messages

## Permissions

- Requires admin, owner, or super_admin role
- Accessible through the Finance section of the admin interface

## Technical Implementation

### Files Created/Modified

- `src/features/finance/PayrollPrepTab.tsx` - Main component
- `src/services/queries/payroll.ts` - Helper functions
- `src/features/finance/FinanceHub.tsx` - Added tab
- `src/app/router.tsx` - Added route
- `src/app/AppLayout.tsx` - Added sidebar link

### Key Functions

- `scanJobsForPeriod()` - Main scanning logic
- `generateTimesheets()` - Timesheet creation
- `getEffectiveRate()` - Rate resolution
- `checkTimesheetExists()` - Duplicate detection

## Future Enhancements

- Employee name display in the UI
- Bulk rate assignment for missing rates
- Export functionality for payroll reports
- Integration with payroll run creation
- Advanced filtering options
