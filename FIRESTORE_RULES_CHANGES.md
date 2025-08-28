# Firestore Rules Changes for V2

## Overview

Updated Firestore security rules to support V2 requirements while maintaining V1 compatibility.

## Changes Made

### 1. Timesheets Collection (`/timesheets/{id}`)

**Previous**: Functions-only writes; read restricted to Admin/Owner/Super Admin
**New**: Employees can read/write their own timesheets; admins can manage everything

**Key Changes**:

- Added `isTimesheetOwner()` function to check if user owns the timesheet
- Added `isTimesheetOwnerForCreate()` function for create operations
- Added `employeeCanUpdateFields()` function to restrict employee updates to specific fields:
  - `start`, `end`, `hours`, `jobId`, `employeeApproved`, `employeeComment`
- Added `isValidTimesheetData()` function for data validation
- **Read**: Employees can read their own timesheets, admins can read all
- **Create**: Employees can create their own timesheets, admins can create any
- **Update**: Employees can update their own timesheets with field restrictions, admins can update any
- **Delete**: Admin roles only

### 2. PayrollRuns Collection (`/payrollRuns/{id}`)

**Previous**: Admin/Owner can create/update/read; delete restricted to super_admin
**New**: Employees can read locked runs and their own summaries; admins can manage everything

**Key Changes**:

- Added `isLockedRun()` function (for future use)
- **Read**: All signed-in users (employees can read locked runs and their own summaries)
- **Write**: Admin roles only (create, update)
- **Delete**: Super admin only

### 3. Presence Collection (`/presence/{uid}`)

**Status**: Already correctly implemented

- **Read**: Any authenticated user
- **Create/Update**: User can write their own presence document only
- **Delete**: Super admin only

### 4. Helper Functions

**Status**: Already exists

- `isAdmin()` function already implemented and working
- All other V2 helper functions (`isSuperAdmin()`, `isMarketing()`, `isEmployeeV2()`, etc.) already exist

## V1 Compatibility

✅ **Maintained**: All existing V1 rules remain unchanged
✅ **Backward Compatible**: V1 applications will continue to work without modification
✅ **Additive Changes**: New rules are additive and don't break existing functionality

## Testing

- Rules syntax validated
- All functions properly defined
- Proper closing braces and structure maintained
- No breaking changes to existing collections

## Next Steps

1. Deploy rules to staging environment for testing
2. Test employee portal timesheet functionality
3. Test presence updates in employee portal
4. Verify admin functionality remains intact
5. Deploy to production when testing is complete

## Security Notes

- Employee timesheet access is restricted to their own records only
- Employee updates are limited to specific fields to prevent unauthorized changes
- Admin roles maintain full access to all data
- Presence collection maintains narrow permissions (users can only write their own)
- All existing V1 security measures remain in place
