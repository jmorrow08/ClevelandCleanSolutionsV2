# Payroll Safety Features

This document describes the new safety and future-proofing features added to the payroll system.

## Features Implemented

### 1. Rate Snapshot Backfill Utility

**Purpose**: Ensures all timesheets have proper rate snapshots for accurate payroll calculations.

**Function**: `backfillRateSnapshots(startDate, endDate)`

**How it works**:

- Scans timesheets in the specified date range
- Identifies timesheets missing `rateSnapshot` field
- Queries `employeeRates` collection for effective rates at timesheet start time
- Updates timesheets with proper rate snapshots
- Supports both hourly and per-visit rate types
- Includes caching for performance optimization

**Usage**:

```typescript
import { backfillRateSnapshots } from "../services/queries/payroll";

const result = await backfillRateSnapshots(
  new Date("2024-01-01"),
  new Date("2024-01-31")
);

console.log(
  `Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`
);
```

**UI Access**: Available in Finance Hub → Payroll Runs tab for admin users.

### 2. Locked Timesheet Protection

**Purpose**: Prevents editing of timesheets that are part of locked payroll runs.

**How it works**:

- Enhanced `isTimesheetLocked()` function to check payroll run status
- Caches locked payroll run IDs for performance
- Disables Save/Approve buttons for locked timesheets
- Provides visual feedback to users

**Implementation**:

```typescript
// Enhanced locking logic
function isTimesheetLocked(timesheet: Timesheet): boolean {
  if (!timesheet.approvedInRunId) {
    return false;
  }

  // Check if the payroll run is locked
  return lockedRunIds.has(timesheet.approvedInRunId);
}
```

**UI Behavior**:

- Save button disabled for locked timesheets
- Approve button disabled for locked timesheets
- Edit button disabled for locked timesheets
- Clear visual indication of locked state

### 3. Payroll Run Status Checking

**Purpose**: Provides utilities to check payroll run lock status.

**Functions**:

- `isPayrollRunLocked(runId: string)`: Check if specific run is locked
- `getLockedPayrollRunIds()`: Get all locked run IDs

**Usage**:

```typescript
import {
  isPayrollRunLocked,
  getLockedPayrollRunIds,
} from "../services/queries/payroll";

// Check specific run
const isLocked = await isPayrollRunLocked("run-123");

// Get all locked runs
const lockedIds = await getLockedPayrollRunIds();
```

## Firebase Functions

### `backfillRateSnapshots`

**Endpoint**: `https://us-central1-[project-id].cloudfunctions.net/backfillRateSnapshots`

**Parameters**:

- `startDate`: Timestamp (milliseconds)
- `endDate`: Timestamp (milliseconds)

**Response**:

```json
{
  "success": true,
  "updated": 150,
  "skipped": 25,
  "errors": 0,
  "total": 175
}
```

**Security**: Requires admin/owner/super_admin permissions.

## Testing

### Emulator Testing

Run the test script to verify backfill functionality:

```bash
node test_backfill.js
```

This will:

1. Create test employee rate
2. Create test timesheet without rateSnapshot
3. Call backfill function
4. Verify timesheet was updated with rateSnapshot

### UI Testing

1. Navigate to Finance Hub → Payroll Runs
2. Use the "Backfill Rate Snapshots" section
3. Select date range and click "Backfill Rate Snapshots"
4. Verify success message and results

## Safety Considerations

1. **Data Integrity**: Backfill only updates timesheets missing rateSnapshot
2. **Performance**: Uses batching and caching for large datasets
3. **Error Handling**: Graceful handling of missing rates or invalid data
4. **Audit Trail**: Backfill operations are tracked with timestamps and user IDs
5. **Permissions**: Admin-level access required for all operations

## Future Enhancements

1. **Scheduled Backfill**: Automate backfill for new timesheets
2. **Rate Validation**: Validate rate snapshots against current rates
3. **Bulk Operations**: Support for larger date ranges with pagination
4. **Notifications**: Alert users when backfill completes
5. **Rollback**: Ability to revert backfill operations if needed
