import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase";
import { addDays, isAfter, isBefore } from "date-fns";

export interface ServiceAgreementProjection {
  agreementId: string;
  clientId: string;
  agreementName: string;
  paymentAmount: number;
  paymentFrequency: string;
  paymentScheduleDetails: {
    monthlyPaymentDay?: number;
    quarterlyMonth?: number;
    quarterlyDay?: number;
  };
  contractStartDate: Date;
  contractEndDate?: Date;
  isActive: boolean;
  nextPaymentDate?: Date;
  projectedPayments: Array<{
    date: Date;
    amount: number;
    type: "monthly" | "quarterly";
  }>;
}

export interface FinancialProjection {
  totalExpectedRevenue: number;
  agreements: Array<{
    agreementId: string;
    agreementName: string;
    clientId: string;
    clientName: string;
    paymentAmount: number;
    paymentFrequency: string;
    nextPaymentDate?: Date;
    contractStatus: string;
  }>;
  projectedPayments: Array<{
    date: string; // YYYY-MM-DD
    amount: number;
    agreementId: string;
    agreementName: string;
    clientId: string;
  }>;
  monthlyBreakdown: Record<string, number>; // YYYY-MM -> total amount
  upcomingPayments: Array<{
    agreementId: string;
    agreementName: string;
    clientId: string;
    paymentDate: Date;
    amount: number;
    daysUntil: number;
  }>;
}

export class ServiceAgreementProjectionService {
  private static async getActiveAgreements(): Promise<any[]> {
    if (!getApps().length) initializeApp(firebaseConfig);
    const db = getFirestore();

    // First, get all active clients
    const activeClientsQuery = query(
      collection(db, "clientMasterList"),
      where("status", "==", true)
    );

    const activeClientsSnapshot = await getDocs(activeClientsQuery);
    const activeClientIds = new Set<string>();
    const clientNames: Record<string, string> = {};

    activeClientsSnapshot.forEach((doc) => {
      const data = doc.data();
      activeClientIds.add(doc.id);
      clientNames[doc.id] = data.companyName || data.name || doc.id;
    });

    console.log("Found active clients:", activeClientIds.size);

    // Get all service agreements to filter properly
    const q1 = query(collection(db, "serviceAgreements"));
    const snapshot1 = await getDocs(q1);
    let agreements: any[] = [];

    const now = new Date();

    snapshot1.forEach((doc) => {
      const data = doc.data();
      const clientId = data.clientId;

      // Skip if client is not active
      if (!clientId || !activeClientIds.has(clientId)) {
        console.log("Skipping agreement - client not active:", {
          id: doc.id,
          clientId,
          agreementName: data.agreementName,
        });
        return;
      }

      // Skip if agreement is explicitly inactive
      if (data.isActive === false) {
        console.log("Skipping agreement - explicitly inactive:", {
          id: doc.id,
          agreementName: data.agreementName,
          isActive: data.isActive,
        });
        return;
      }

      // Skip if agreement has no payment amount
      if (!data.paymentAmount || data.paymentAmount <= 0) {
        console.log("Skipping agreement - no payment amount:", {
          id: doc.id,
          agreementName: data.agreementName,
          paymentAmount: data.paymentAmount,
        });
        return;
      }

      // Check if contract has expired
      let contractEndDate: Date | null = null;
      if (data.contractEndDate) {
        if (data.contractEndDate.toDate) {
          contractEndDate = data.contractEndDate.toDate();
        } else if (typeof data.contractEndDate === "string") {
          contractEndDate = new Date(data.contractEndDate);
        } else if (data.contractEndDate instanceof Date) {
          contractEndDate = data.contractEndDate;
        } else if (data.contractEndDate.seconds) {
          contractEndDate = new Date(data.contractEndDate.seconds * 1000);
        }
      }

      if (contractEndDate && contractEndDate < now) {
        console.log("Skipping agreement - contract expired:", {
          id: doc.id,
          agreementName: data.agreementName,
          contractEndDate: contractEndDate.toISOString(),
          now: now.toISOString(),
        });
        return;
      }

      // Check if contract start date is in the future
      let contractStartDate: Date | null = null;
      if (data.contractStartDate) {
        if (data.contractStartDate.toDate) {
          contractStartDate = data.contractStartDate.toDate();
        } else if (typeof data.contractStartDate === "string") {
          contractStartDate = new Date(data.contractStartDate);
        } else if (data.contractStartDate instanceof Date) {
          contractStartDate = data.contractStartDate;
        } else if (data.contractStartDate.seconds) {
          contractStartDate = new Date(data.contractStartDate.seconds * 1000);
        }
      }

      if (contractStartDate && contractStartDate > now) {
        console.log("Skipping agreement - contract not started yet:", {
          id: doc.id,
          agreementName: data.agreementName,
          contractStartDate: contractStartDate.toISOString(),
          now: now.toISOString(),
        });
        return;
      }

      console.log("Found active service agreement:", {
        id: doc.id,
        agreementName: data.agreementName,
        clientId,
        clientName: clientNames[clientId],
        paymentAmount: data.paymentAmount,
        paymentFrequency: data.paymentFrequency,
        contractStartDate: data.contractStartDate,
        contractEndDate: data.contractEndDate,
        isActive: data.isActive,
        paymentScheduleDetails: data.paymentScheduleDetails,
        serviceDays: data.serviceDays,
      });

      agreements.push({
        id: doc.id,
        ...data,
        clientName: clientNames[clientId], // Add resolved client name
      });
    });

    console.log("Total active agreements to process:", agreements.length);
    return agreements;
  }

  private static calculatePaymentDates(
    agreement: any,
    startDate: Date,
    endDate?: Date,
    projectionDays: number = 90
  ): Array<{ date: Date; amount: number; type: "monthly" | "quarterly" }> {
    const payments: Array<{
      date: Date;
      amount: number;
      type: "monthly" | "quarterly";
    }> = [];
    const paymentAmount = agreement.paymentAmount || 0;

    console.log("Calculating payment dates for:", {
      agreementName: agreement.agreementName,
      paymentAmount,
      paymentFrequency: agreement.paymentFrequency,
      paymentScheduleDetails: agreement.paymentScheduleDetails,
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString(),
      projectionDays,
    });

    if (!paymentAmount || paymentAmount <= 0) {
      console.log("No payment amount or invalid amount");
      return payments;
    }

    const now = new Date();
    const endProjection = addDays(now, projectionDays);

    console.log("Date ranges:", {
      now: now.toISOString(),
      endProjection: endProjection.toISOString(),
      contractEndDate: endDate?.toISOString(),
    });

    // Use contract end date if it exists, otherwise use projection end date
    const finalEndDate =
      endDate && isBefore(endDate, endProjection) ? endDate : endProjection;

    if (agreement.paymentFrequency === "monthly") {
      const paymentDay =
        agreement.paymentScheduleDetails?.monthlyPaymentDay || 1;

      console.log("Processing monthly payments:", {
        paymentDay,
        finalEndDate: finalEndDate.toISOString(),
        now: now.toISOString(),
      });

      // Start from the current month to find the next payment
      let currentDate = new Date(now.getFullYear(), now.getMonth(), paymentDay);

      // If the payment day for this month has already passed, move to next month
      if (isBefore(currentDate, now)) {
        console.log("Payment day this month has passed, moving to next month");
        currentDate.setMonth(currentDate.getMonth() + 1);
        console.log("Next payment date:", currentDate.toISOString());
      }

      // Ensure we haven't exceeded contract end date
      if (isAfter(currentDate, finalEndDate)) {
        console.log("Next payment would be after contract end date");
        return payments;
      }

      // Generate the next monthly payment
      console.log("Adding next monthly payment:", {
        date: currentDate.toISOString(),
        isAfterNow: isAfter(currentDate, now),
        isBeforeFinalEnd: isBefore(currentDate, finalEndDate),
      });

      payments.push({
        date: new Date(currentDate),
        amount: paymentAmount,
        type: "monthly",
      });

      console.log("Generated next monthly payment");
    } else if (agreement.paymentFrequency === "quarterly") {
      const quarterMonth =
        agreement.paymentScheduleDetails?.quarterlyMonth || 1;
      const paymentDay = agreement.paymentScheduleDetails?.quarterlyDay || 1;

      console.log("Processing quarterly payments:", {
        quarterMonth,
        paymentDay,
        finalEndDate: finalEndDate.toISOString(),
        now: now.toISOString(),
      });

      // Start from the scheduled quarter month this year
      let currentDate = new Date(
        now.getFullYear(),
        quarterMonth - 1,
        paymentDay
      );

      // If this quarter's payment date has passed, move to next year
      if (isBefore(currentDate, now)) {
        console.log("Quarter payment date has passed, moving to next year");
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        console.log("Next quarterly payment date:", currentDate.toISOString());
      }

      // Ensure we haven't exceeded contract end date
      if (isAfter(currentDate, finalEndDate)) {
        console.log("Next payment would be after contract end date");
        return payments;
      }

      // Generate the next quarterly payment
      console.log("Adding next quarterly payment:", {
        date: currentDate.toISOString(),
        isAfterNow: isAfter(currentDate, now),
        isBeforeFinalEnd: isBefore(currentDate, finalEndDate),
      });

      payments.push({
        date: new Date(currentDate),
        amount: paymentAmount,
        type: "quarterly",
      });

      console.log("Generated next quarterly payment");
    } else {
      console.log("Unknown payment frequency:", agreement.paymentFrequency);
    }

    return payments;
  }

  static async getFinancialProjections(
    projectionDays: number = 90
  ): Promise<FinancialProjection> {
    const agreements = await this.getActiveAgreements();

    let totalExpectedRevenue = 0;
    const projectedPayments: Array<{
      date: string;
      amount: number;
      agreementId: string;
      agreementName: string;
      clientId: string;
    }> = [];

    const monthlyBreakdown: Record<string, number> = {};
    const upcomingPayments: Array<{
      agreementId: string;
      agreementName: string;
      clientId: string;
      paymentDate: Date;
      amount: number;
      daysUntil: number;
    }> = [];

    const agreementDetails: Array<{
      agreementId: string;
      agreementName: string;
      clientId: string;
      clientName: string;
      paymentAmount: number;
      paymentFrequency: string;
      nextPaymentDate?: Date;
      contractStatus: string;
    }> = [];

    const now = new Date();
    console.log("Current date:", now.toISOString());
    console.log("Projection days:", projectionDays);

    for (const agreement of agreements) {
      console.log(
        "Processing agreement:",
        agreement.agreementName || "Unnamed",
        {
          paymentAmount: agreement.paymentAmount,
          paymentFrequency: agreement.paymentFrequency,
          contractStartDate: agreement.contractStartDate,
          contractEndDate: agreement.contractEndDate,
        }
      );

      // Handle different date formats for contract start date
      let startDate: Date | null = null;
      if (agreement.contractStartDate) {
        if (agreement.contractStartDate.toDate) {
          startDate = agreement.contractStartDate.toDate();
        } else if (typeof agreement.contractStartDate === "string") {
          startDate = new Date(agreement.contractStartDate);
        } else if (agreement.contractStartDate instanceof Date) {
          startDate = agreement.contractStartDate;
        } else if (agreement.contractStartDate.seconds) {
          // Handle Firestore Timestamp format
          startDate = new Date(agreement.contractStartDate.seconds * 1000);
        }
      }

      // Handle different date formats for contract end date
      let endDate: Date | undefined = undefined;
      if (agreement.contractEndDate) {
        if (agreement.contractEndDate.toDate) {
          endDate = agreement.contractEndDate.toDate();
        } else if (typeof agreement.contractEndDate === "string") {
          endDate = new Date(agreement.contractEndDate);
        } else if (agreement.contractEndDate instanceof Date) {
          endDate = agreement.contractEndDate;
        } else if (agreement.contractEndDate.seconds) {
          // Handle Firestore Timestamp format
          endDate = new Date(agreement.contractEndDate.seconds * 1000);
        }
      }

      // Add agreement to details list
      let nextPayment: Date | undefined = undefined;
      if (startDate) {
        const payments = this.calculatePaymentDates(
          agreement,
          startDate,
          endDate,
          projectionDays
        );
        if (payments.length > 0) {
          nextPayment = payments[0].date;
        }
      }

      agreementDetails.push({
        agreementId: agreement.id,
        agreementName: agreement.agreementName || "Unnamed Agreement",
        clientId: agreement.clientId || "",
        clientName: agreement.clientName || "Unknown Client",
        paymentAmount: agreement.paymentAmount || 0,
        paymentFrequency: agreement.paymentFrequency || "Unknown",
        nextPaymentDate: nextPayment,
        contractStatus: agreement.isActive === false ? "Inactive" : "Active",
      });

      console.log("Parsed dates:", {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        now: now.toISOString(),
        isAfterNow: startDate ? isAfter(now, startDate) : "no start date",
        startDateType: typeof agreement.contractStartDate,
        endDateType: typeof agreement.contractEndDate,
      });

      if (!startDate || isNaN(startDate.getTime())) {
        console.log("Skipping agreement - invalid start date");
        continue;
      }

      // For testing, let's process agreements even if start date is in the past
      // Comment out this check to see all agreements
      // if (isAfter(now, startDate)) {
      //   console.log("Skipping agreement - start date is in the past");
      //   continue;
      // }

      const payments = this.calculatePaymentDates(
        agreement,
        startDate,
        endDate,
        projectionDays
      );

      console.log("Calculated payments for agreement:", payments.length);

      for (const payment of payments) {
        const dateKey = payment.date.toISOString().slice(0, 10); // YYYY-MM-DD
        const monthKey = payment.date.toISOString().slice(0, 7); // YYYY-MM

        console.log("Adding payment:", {
          date: dateKey,
          amount: payment.amount,
          type: payment.type,
        });

        projectedPayments.push({
          date: dateKey,
          amount: payment.amount,
          agreementId: agreement.id,
          agreementName: agreement.agreementName || "Unnamed Agreement",
          clientId: agreement.clientId,
        });

        totalExpectedRevenue += payment.amount;

        // Add to monthly breakdown
        monthlyBreakdown[monthKey] =
          (monthlyBreakdown[monthKey] || 0) + payment.amount;

        // Add to upcoming payments (next 30 days)
        const daysUntil = Math.ceil(
          (payment.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntil <= 30 && daysUntil >= 0) {
          upcomingPayments.push({
            agreementId: agreement.id,
            agreementName: agreement.agreementName || "Unnamed Agreement",
            clientId: agreement.clientId,
            paymentDate: payment.date,
            amount: payment.amount,
            daysUntil,
          });
        }
      }
    }

    console.log("Final results:", {
      totalExpectedRevenue,
      projectedPaymentsCount: projectedPayments.length,
      monthlyBreakdownKeys: Object.keys(monthlyBreakdown),
      upcomingPaymentsCount: upcomingPayments.length,
    });

    // Sort upcoming payments by date
    upcomingPayments.sort(
      (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()
    );

    return {
      totalExpectedRevenue,
      agreements: agreementDetails,
      projectedPayments,
      monthlyBreakdown,
      upcomingPayments,
    };
  }

  static async getRevenueByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const projections = await this.getFinancialProjections(365); // Get full year for filtering

    return projections.projectedPayments
      .filter((payment) => {
        const paymentDate = new Date(payment.date);
        return paymentDate >= startDate && paymentDate <= endDate;
      })
      .reduce((total, payment) => total + payment.amount, 0);
  }

  static async getProjectedCashflow(
    days: number = 90
  ): Promise<Array<{ date: string; inflow: number; outflow: number }>> {
    const projections = await this.getFinancialProjections(days);
    const cashflow: Record<string, number> = {};

    // Group projected payments by date
    for (const payment of projections.projectedPayments) {
      cashflow[payment.date] = (cashflow[payment.date] || 0) + payment.amount;
    }

    // Convert to array format expected by charts
    return Object.entries(cashflow)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, inflow]) => ({
        date,
        inflow,
        outflow: 0, // We'll keep outflows as 0 for now since user said they're not adding outgoing data yet
      }));
  }
}
