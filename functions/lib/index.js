"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillRateSnapshots = exports.approveTimesheetsInRun = exports.payrollGenerate = exports.payrollScan = exports.recalcPayrollRun = exports.createPayrollRun = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
// Payroll Functions
exports.createPayrollRun = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    try {
        // Validate input
        const { periodStart, periodEnd } = data;
        if (!periodStart || !periodEnd) {
            throw new functions.https.HttpsError("invalid-argument", "periodStart and periodEnd are required");
        }
        // Validate user permissions
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }
        // Check if user has admin/owner/super_admin role
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("permission-denied", "User not found");
        }
        const userData = userDoc.data();
        const hasPermission = (userData === null || userData === void 0 ? void 0 : userData.admin) || (userData === null || userData === void 0 ? void 0 : userData.owner) || (userData === null || userData === void 0 ? void 0 : userData.super_admin);
        if (!hasPermission) {
            throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
        }
        // Create payroll run document
        const payrollRunData = {
            periodStart: admin.firestore.Timestamp.fromMillis(periodStart),
            periodEnd: admin.firestore.Timestamp.fromMillis(periodEnd),
            status: "draft",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid,
            totalHours: 0,
            totalEarnings: 0,
            byEmployee: {},
        };
        const docRef = await db.collection("payrollRuns").add(payrollRunData);
        return {
            id: docRef.id,
            success: true,
        };
    }
    catch (error) {
        console.error("createPayrollRun error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to create payroll run");
    }
});
exports.recalcPayrollRun = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    var _a;
    try {
        // Validate input
        const { runId } = data;
        if (!runId) {
            throw new functions.https.HttpsError("invalid-argument", "runId is required");
        }
        // Validate user permissions
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("permission-denied", "User not found");
        }
        const userData = userDoc.data();
        const hasPermission = (userData === null || userData === void 0 ? void 0 : userData.admin) || (userData === null || userData === void 0 ? void 0 : userData.owner) || (userData === null || userData === void 0 ? void 0 : userData.super_admin);
        if (!hasPermission) {
            throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
        }
        // Get the payroll run
        const runDoc = await db.collection("payrollRuns").doc(runId).get();
        if (!runDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Payroll run not found");
        }
        const runData = runDoc.data();
        const periodStart = runData === null || runData === void 0 ? void 0 : runData.periodStart;
        const periodEnd = runData === null || runData === void 0 ? void 0 : runData.periodEnd;
        if (!periodStart || !periodEnd) {
            throw new functions.https.HttpsError("invalid-argument", "Payroll run missing period dates");
        }
        // Get timesheets approved for this run
        const timesheetsSnapshot = await db
            .collection("timesheets")
            .where("approvedInRunId", "==", runId)
            .orderBy("employeeId", "asc")
            .orderBy("start", "asc")
            .get();
        const totals = {
            byEmployee: {},
            totalHours: 0,
            totalEarnings: 0,
        };
        const rateCache = new Map();
        // Calculate totals from timesheets
        for (const doc of timesheetsSnapshot.docs) {
            const timesheet = doc.data();
            const employeeId = timesheet === null || timesheet === void 0 ? void 0 : timesheet.employeeId;
            const hours = Number((timesheet === null || timesheet === void 0 ? void 0 : timesheet.hours) || 0) || 0;
            if (!employeeId || hours <= 0)
                continue;
            // Get hourly rate
            let rate = Number(((_a = timesheet === null || timesheet === void 0 ? void 0 : timesheet.rateSnapshot) === null || _a === void 0 ? void 0 : _a.hourlyRate) || 0) || 0;
            if (!rate) {
                const startTs = timesheet === null || timesheet === void 0 ? void 0 : timesheet.start;
                const cacheKey = `${employeeId}|${(startTs === null || startTs === void 0 ? void 0 : startTs.seconds) || "0"}`;
                if (rateCache.has(cacheKey)) {
                    rate = rateCache.get(cacheKey);
                }
                else {
                    // Get effective rate for employee at time
                    const rateQuery = await db
                        .collection("employeeRates")
                        .where("employeeId", "==", employeeId)
                        .where("effectiveDate", "<=", startTs)
                        .orderBy("effectiveDate", "desc")
                        .limit(1)
                        .get();
                    if (!rateQuery.empty) {
                        const rateDoc = rateQuery.docs[0].data();
                        rate = Number((rateDoc === null || rateDoc === void 0 ? void 0 : rateDoc.hourlyRate) || 0) || 0;
                    }
                    rateCache.set(cacheKey, rate);
                }
            }
            const earnings = Math.round((hours * rate + Number.EPSILON) * 100) / 100;
            const current = totals.byEmployee[employeeId] || {
                hours: 0,
                earnings: 0,
                hourlyRate: rate || undefined,
            };
            current.hours += hours;
            current.earnings =
                Math.round((current.earnings + earnings) * 100) / 100;
            if (!current.hourlyRate && rate)
                current.hourlyRate = rate;
            totals.byEmployee[employeeId] = current;
            totals.totalHours += hours;
            totals.totalEarnings =
                Math.round((totals.totalEarnings + earnings) * 100) / 100;
        }
        // Round totals
        totals.totalHours = Math.round(totals.totalHours * 100) / 100;
        totals.totalEarnings = Math.round(totals.totalEarnings * 100) / 100;
        // Update the payroll run with new totals
        await db
            .collection("payrollRuns")
            .doc(runId)
            .update(Object.assign(Object.assign({}, totals), { updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: context.auth.uid }));
        return {
            success: true,
            totals,
        };
    }
    catch (error) {
        console.error("recalcPayrollRun error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to recalculate payroll run");
    }
});
exports.payrollScan = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    try {
        // Validate input
        const { periodStart, periodEnd } = data;
        if (!periodStart || !periodEnd) {
            throw new functions.https.HttpsError("invalid-argument", "periodStart and periodEnd are required");
        }
        // Validate user permissions
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("permission-denied", "User not found");
        }
        const userData = userDoc.data();
        const hasPermission = (userData === null || userData === void 0 ? void 0 : userData.admin) || (userData === null || userData === void 0 ? void 0 : userData.owner) || (userData === null || userData === void 0 ? void 0 : userData.super_admin);
        if (!hasPermission) {
            throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
        }
        const startDate = new Date(periodStart);
        const endDate = new Date(periodEnd);
        // Query timesheets in the period
        const timesheetsSnapshot = await db
            .collection("timesheets")
            .where("clockInTime", ">=", admin.firestore.Timestamp.fromDate(startDate))
            .where("clockInTime", "<", admin.firestore.Timestamp.fromDate(endDate))
            .get();
        const timesheets = [];
        const missingRates = [];
        let totalHours = 0;
        let totalEarnings = 0;
        timesheetsSnapshot.forEach((doc) => {
            const timesheetData = doc.data();
            const timesheet = Object.assign({ id: doc.id }, timesheetData);
            timesheets.push(timesheet);
            // Check for missing rates
            if (!timesheet.hourlyRate && timesheet.employeeProfileId) {
                missingRates.push({
                    timesheetId: doc.id,
                    employeeId: timesheet.employeeProfileId,
                    date: timesheet.clockInTime,
                });
            }
            // Calculate totals
            if (timesheet.hours && timesheet.hourlyRate) {
                totalHours += timesheet.hours;
                totalEarnings += timesheet.hours * timesheet.hourlyRate;
            }
        });
        return {
            periodId: `${startDate.getTime()}-${endDate.getTime()}`,
            timesheetCount: timesheets.length,
            totalHours: Math.round(totalHours * 100) / 100,
            totalEarnings: Math.round(totalEarnings * 100) / 100,
            missingRates,
            timesheets: timesheets.map((t) => ({
                id: t.id,
                employeeProfileId: t.employeeProfileId,
                clockInTime: t.clockInTime,
                clockOutTime: t.clockOutTime,
                hours: t.hours,
                hourlyRate: t.hourlyRate,
            })),
        };
    }
    catch (error) {
        console.error("payrollScan error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to scan payroll period");
    }
});
exports.payrollGenerate = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    try {
        // Validate input
        const { periodStart, periodEnd, periodId } = data;
        if (!periodStart || !periodEnd) {
            throw new functions.https.HttpsError("invalid-argument", "periodStart and periodEnd are required");
        }
        // Validate user permissions
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("permission-denied", "User not found");
        }
        const userData = userDoc.data();
        const hasPermission = (userData === null || userData === void 0 ? void 0 : userData.admin) || (userData === null || userData === void 0 ? void 0 : userData.owner) || (userData === null || userData === void 0 ? void 0 : userData.super_admin);
        if (!hasPermission) {
            throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
        }
        const startDate = new Date(periodStart);
        const endDate = new Date(periodEnd);
        // Query timesheets in the period
        const timesheetsSnapshot = await db
            .collection("timesheets")
            .where("clockInTime", ">=", admin.firestore.Timestamp.fromDate(startDate))
            .where("clockInTime", "<", admin.firestore.Timestamp.fromDate(endDate))
            .get();
        let created = 0;
        const batch = db.batch();
        timesheetsSnapshot.forEach((doc) => {
            const timesheetData = doc.data();
            const timesheet = Object.assign({ id: doc.id }, timesheetData);
            // Create payroll run for each employee if it doesn't exist
            if (timesheet.employeeProfileId &&
                timesheet.hours &&
                timesheet.hourlyRate) {
                const payrollRunRef = db.collection("payrollRuns").doc();
                const payrollRunData = {
                    periodStart: admin.firestore.Timestamp.fromDate(startDate),
                    periodEnd: admin.firestore.Timestamp.fromDate(endDate),
                    periodId: periodId || `${startDate.getTime()}-${endDate.getTime()}`,
                    status: "draft",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdBy: context.auth.uid,
                    employeeProfileId: timesheet.employeeProfileId,
                    hours: timesheet.hours,
                    hourlyRate: timesheet.hourlyRate,
                    earnings: timesheet.hours * timesheet.hourlyRate,
                    timesheetId: timesheet.id,
                };
                batch.set(payrollRunRef, payrollRunData);
                created++;
            }
        });
        await batch.commit();
        return {
            success: true,
            created,
        };
    }
    catch (error) {
        console.error("payrollGenerate error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to generate payroll runs");
    }
});
exports.approveTimesheetsInRun = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    try {
        // Validate input
        const { runId, timesheetIds } = data;
        if (!runId) {
            throw new functions.https.HttpsError("invalid-argument", "runId is required");
        }
        if (!Array.isArray(timesheetIds) || timesheetIds.length === 0) {
            return { count: 0 };
        }
        // Validate user permissions
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("permission-denied", "User not found");
        }
        const userData = userDoc.data();
        const hasPermission = (userData === null || userData === void 0 ? void 0 : userData.admin) || (userData === null || userData === void 0 ? void 0 : userData.owner) || (userData === null || userData === void 0 ? void 0 : userData.super_admin);
        if (!hasPermission) {
            throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
        }
        // Verify payroll run exists
        const runDoc = await db.collection("payrollRuns").doc(runId).get();
        if (!runDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Payroll run not found");
        }
        // Batch update timesheets
        const batch = db.batch();
        let count = 0;
        for (const id of timesheetIds) {
            if (!id)
                continue;
            const timesheetRef = db.collection("timesheets").doc(id);
            batch.update(timesheetRef, {
                approvedInRunId: runId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            count += 1;
        }
        await batch.commit();
        return { count };
    }
    catch (error) {
        console.error("approveTimesheetsInRun error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to approve timesheets");
    }
});
exports.backfillRateSnapshots = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    try {
        // Validate input
        const { startDate, endDate } = data;
        if (!startDate || !endDate) {
            throw new functions.https.HttpsError("invalid-argument", "startDate and endDate are required");
        }
        // Validate user permissions
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("permission-denied", "User not found");
        }
        const userData = userDoc.data();
        const hasPermission = (userData === null || userData === void 0 ? void 0 : userData.admin) || (userData === null || userData === void 0 ? void 0 : userData.owner) || (userData === null || userData === void 0 ? void 0 : userData.super_admin);
        if (!hasPermission) {
            throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
        }
        const startTimestamp = admin.firestore.Timestamp.fromMillis(startDate);
        const endTimestamp = admin.firestore.Timestamp.fromMillis(endDate);
        // Query timesheets in the date range that are missing rateSnapshot
        const timesheetsSnapshot = await db
            .collection("timesheets")
            .where("start", ">=", startTimestamp)
            .where("start", "<", endTimestamp)
            .get();
        const batch = db.batch();
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        const rateCache = new Map();
        for (const doc of timesheetsSnapshot.docs) {
            const timesheet = doc.data();
            // Skip if timesheet already has rateSnapshot
            if (timesheet.rateSnapshot) {
                skipped++;
                continue;
            }
            const employeeId = timesheet.employeeId;
            const startTime = timesheet.start;
            if (!employeeId || !startTime) {
                errors++;
                continue;
            }
            try {
                // Get effective rate for employee at timesheet start time
                const cacheKey = `${employeeId}|${startTime.seconds || "0"}`;
                let rateSnapshot = rateCache.get(cacheKey);
                if (!rateSnapshot) {
                    // Query for the most recent rate effective at or before the timesheet start
                    const rateQuery = await db
                        .collection("employeeRates")
                        .where("employeeId", "==", employeeId)
                        .where("effectiveDate", "<=", startTime)
                        .orderBy("effectiveDate", "desc")
                        .limit(1)
                        .get();
                    if (rateQuery.empty) {
                        // No rate found, skip this timesheet
                        skipped++;
                        continue;
                    }
                    const rateDoc = rateQuery.docs[0].data();
                    // Determine rate type and create snapshot
                    if (rateDoc.rateType === "per_visit" && rateDoc.perVisitRate) {
                        rateSnapshot = {
                            type: "per_visit",
                            amount: Number(rateDoc.perVisitRate) || 0
                        };
                    }
                    else if (rateDoc.rateType === "hourly" && rateDoc.hourlyRate) {
                        rateSnapshot = {
                            type: "hourly",
                            amount: Number(rateDoc.hourlyRate) || 0
                        };
                    }
                    else if (rateDoc.hourlyRate) {
                        // Legacy format - assume hourly
                        rateSnapshot = {
                            type: "hourly",
                            amount: Number(rateDoc.hourlyRate) || 0
                        };
                    }
                    else {
                        // No valid rate found
                        skipped++;
                        continue;
                    }
                    rateCache.set(cacheKey, rateSnapshot);
                }
                // Update timesheet with rate snapshot
                const timesheetRef = db.collection("timesheets").doc(doc.id);
                batch.update(timesheetRef, {
                    rateSnapshot,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
                    backfilledBy: context.auth.uid
                });
                updated++;
            }
            catch (error) {
                console.error(`Error processing timesheet ${doc.id}:`, error);
                errors++;
            }
        }
        // Commit all updates
        await batch.commit();
        return {
            success: true,
            updated,
            skipped,
            errors,
            total: timesheetsSnapshot.size
        };
    }
    catch (error) {
        console.error("backfillRateSnapshots error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to backfill rate snapshots");
    }
});
//# sourceMappingURL=index.js.map