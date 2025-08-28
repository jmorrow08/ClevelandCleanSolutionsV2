# Payroll Loop Verification Test Plan

## Overview

This document outlines the step-by-step verification of the complete payroll loop in the Cleveland Clean Solutions application.

## Test Environment Setup

- Application: Cleveland Clean Solutions V2
- Database: Firebase Firestore
- Authentication: Firebase Auth
- Functions: Firebase Cloud Functions

## Test Steps

### 1. HR → Rates Setup

**Goal**: Add per_visit rate for Employee A scoped to Location X; add hourly rate for Employee B

**Test Data**:

- Employee A: `employee-a-001` (per_visit rate: $25.00, scoped to Location X)
- Employee B: `employee-b-001` (hourly rate: $18.50, global)
- Location X: `location-x-001`

**Verification Points**:

- [ ] Employee rates can be added via HR interface
- [ ] Per_visit rates can be scoped to specific locations
- [ ] Hourly rates can be set globally
- [ ] Rate snapshots are properly stored with type information

### 2. Scheduling/Service History

**Goal**: Create two jobs in last period at Location X with Employee A assigned; one job for Employee B

**Test Data**:

- Job 1: Location X, Employee A, Duration: 2 hours
- Job 2: Location X, Employee A, Duration: 1.5 hours
- Job 3: Location Y, Employee B, Duration: 3 hours

**Verification Points**:

- [ ] Jobs can be created in serviceHistory collection
- [ ] Employee assignments are properly recorded
- [ ] Job durations are captured
- [ ] Location information is preserved

### 3. Payroll Prep - Scan & Generate

**Goal**: Scan last period, generate missing timesheets

**Verification Points**:

- [ ] Payroll prep can scan jobs for a specific period
- [ ] Missing timesheets are identified
- [ ] Rate snapshots are correctly applied
- [ ] Per_visit entries get units=1
- [ ] Hourly entries get hours populated based on job duration

### 4. Employee Portal - Approval Process

**Goal**: Employee A approves both entries; Employee B requests change

**Verification Points**:

- [ ] Employees can view their timesheets
- [ ] Employees can approve timesheets
- [ ] Employees can add comments when requesting changes
- [ ] Employee approval status is properly tracked

### 5. Admin Payroll Prep

**Goal**: Mark adminApproved for A's entries; leave B's unapproved

**Verification Points**:

- [ ] Admins can view all timesheets in period
- [ ] Admins can approve timesheets
- [ ] Approval status is properly tracked
- [ ] Only approved timesheets are included in runs

### 6. Create Draft Run & Approve

**Goal**: Create Draft Run; approve only A's entries; Lock & Compute Totals

**Verification Points**:

- [ ] Payroll runs can be created
- [ ] Specific timesheets can be approved into runs
- [ ] Run totals are calculated correctly
- [ ] Run can be locked with final totals

### 7. Employee Portal - Payroll History

**Goal**: Payroll page shows locked run in history; Estimated earnings reflect approved entries only

**Verification Points**:

- [ ] Locked runs appear in employee payroll history
- [ ] Estimated earnings only include approved entries
- [ ] Payroll history shows correct totals
- [ ] Current period earnings are calculated correctly

## Expected Results

### Manual Math Verification

**Employee A (Per_visit)**:

- Job 1: $25.00 × 1 unit = $25.00
- Job 2: $25.00 × 1 unit = $25.00
- Total: $50.00

**Employee B (Hourly)**:

- Job 3: $18.50 × 3 hours = $55.50
- Total: $55.50 (if approved, $0.00 if not approved)

**System Totals**:

- Total Hours: 6.5 hours (Employee B only)
- Total Earnings: $105.50 (if all approved) or $50.00 (if only Employee A approved)

## Technical Implementation Notes

### Rate Structure

```typescript
// Per_visit rate structure
{
  employeeId: "employee-a-001",
  rateType: "per_visit",
  amount: 25.00,
  locationId: "location-x-001",
  effectiveDate: Timestamp
}

// Hourly rate structure
{
  employeeId: "employee-b-001",
  rateType: "hourly",
  amount: 18.50,
  effectiveDate: Timestamp
}
```

### Timesheet Structure

```typescript
// Per_visit timesheet
{
  employeeId: "employee-a-001",
  jobId: "job-1",
  units: 1,
  hours: 0,
  rateSnapshot: {
    type: "per_visit",
    amount: 25.00
  },
  employeeApproved: boolean,
  adminApproved: boolean,
  approvedInRunId: string | null
}

// Hourly timesheet
{
  employeeId: "employee-b-001",
  jobId: "job-3",
  units: 1,
  hours: 3.0,
  rateSnapshot: {
    type: "hourly",
    amount: 18.50
  },
  employeeApproved: boolean,
  adminApproved: boolean,
  approvedInRunId: string | null
}
```

### Payroll Run Structure

```typescript
{
  id: "run-001",
  periodStart: Timestamp,
  periodEnd: Timestamp,
  status: "locked",
  totals: {
    byEmployee: {
      "employee-a-001": { hours: 0, earnings: 50.00 },
      "employee-b-001": { hours: 3.0, earnings: 55.50, hourlyRate: 18.50 }
    },
    totalHours: 3.0,
    totalEarnings: 105.50
  }
}
```

## Success Criteria

- [ ] All steps complete without errors
- [ ] Totals match manual calculations
- [ ] Rate snapshots are preserved correctly
- [ ] Employee approvals work as expected
- [ ] Admin approvals work as expected
- [ ] Payroll runs lock correctly
- [ ] Employee portal shows correct history and estimates
