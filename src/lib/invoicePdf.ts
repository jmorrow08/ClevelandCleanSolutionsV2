export type CompanyInfo = {
  name?: string;
  email?: string;
  phone?: string;
};

export type InvoicePdfInput = {
  invoice: any;
  company?: CompanyInfo;
  logoUrl?: string;
};

function toDate(value: any): Date | undefined {
  if (!value) return undefined;

  // Handle Firestore Timestamp
  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  // Handle Firestore Timestamp with seconds
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  // Handle Date object
  if (value instanceof Date) {
    return value;
  }

  // Handle numeric timestamp
  const asNum = Number(value);
  if (Number.isFinite(asNum)) {
    return new Date(asNum);
  }

  // Handle string dates
  if (typeof value === "string") {
    try {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (_e) {
      // Continue to next attempt
    }
  }

  // Final attempt with Date constructor
  try {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (_e) {
    console.warn("Failed to parse date value:", value);
  }

  return undefined;
}

function currency(n?: number): string {
  const x = Number(n || 0) || 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(x);
}

function escapeHtml(s: any): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ((
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        } as Record<string, string>
      )[m])
  );
}

export function buildInvoiceHtml({
  company,
  logoUrl,
  invoice,
}: InvoicePdfInput): HTMLElement {
  const due = toDate(invoice?.dueDate);
  const dueStr = due ? due.toLocaleDateString() : "";

  // Debug logging for date handling
  console.log("Invoice due date processing:", {
    originalDueDate: invoice?.dueDate,
    processedDue: due,
    formattedDueStr: dueStr,
  });

  const rawItems = invoice?.lineItems || invoice?.items || [];
  const items = (Array.isArray(rawItems) ? rawItems : []).map((li: any) => {
    const qty = Number(li?.qty ?? li?.quantity ?? 1);
    const rate = Number(li?.rate ?? li?.price ?? 0);
    const amount = Number(li?.amount ?? qty * rate);
    return {
      description: li?.description ?? li?.desc ?? "",
      qty,
      rate,
      amount,
    };
  });
  const subtotal = items.reduce(
    (s: number, li: any) => s + (Number(li?.amount || 0) || 0),
    0
  );
  const total = Number(invoice?.total ?? invoice?.subtotal ?? subtotal);

  const container = document.createElement("div");
  container.innerHTML = `
  <div id="pdf-invoice" style="width:100%;max-width:900px;padding:40px;font-family:Inter,system-ui,Arial;line-height:1.5;background:#fff;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
      <div style="display:flex;gap:16px;align-items:center">
        <img src="${escapeHtml(
          logoUrl || "/vite.svg"
        )}" style="height:60px;width:auto;border-radius:8px"/>
        <div>
          <div style="font-weight:800;font-size:24px;color:#1f2937;margin-bottom:4px">${escapeHtml(
            company?.name || "Cleveland Clean Solutions"
          )}</div>
          <div style="font-size:14px;color:#6b7280;line-height:1.4">${escapeHtml(
            company?.email || ""
          )}${company?.phone ? " • " + escapeHtml(company.phone) : ""}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:28px;font-weight:800;color:#1f2937;margin-bottom:8px">INVOICE</div>
        <div style="font-size:14px;color:#6b7280;margin-bottom:4px">No. ${escapeHtml(
          invoice?.invoiceNumber || invoice?.id || ""
        )}</div>
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px">Due: ${escapeHtml(
          dueStr
        )}</div>
        <div style="font-size:12px;padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;display:inline-block;background:#f9fafb;color:#374151;font-weight:600;text-transform:uppercase">${String(
          invoice?.status || "pending"
        ).toUpperCase()}</div>
      </div>
    </div>

    <div style="display:flex;gap:32px;margin:24px 0 32px">
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#f9fafb">
        <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:8px">Bill To</div>
        <div style="font-weight:700;font-size:16px;color:#1f2937;margin-bottom:4px">${escapeHtml(
          invoice?.clientName || ""
        )}</div>
        <div style="font-size:14px;color:#6b7280">${escapeHtml(
          invoice?.clientEmail || invoice?.payeeEmail || ""
        )}</div>
      </div>
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:20px;background:#f9fafb">
        <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-bottom:8px">Notes</div>
        <div style="font-size:14px;color:#374151;line-height:1.5">${
          invoice?.notes
            ? escapeHtml(invoice?.notes)
            : '<span style="color:#9ca3af">—</span>'
        }</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="text-align:left;border-bottom:2px solid #e5e7eb;padding:16px 12px;font-size:14px;font-weight:600;color:#374151">Description</th>
          <th style="text-align:right;border-bottom:2px solid #e5e7eb;padding:16px 12px;font-size:14px;font-weight:600;color:#374151">Qty</th>
          <th style="text-align:right;border-bottom:2px solid #e5e7eb;padding:16px 12px;font-size:14px;font-weight:600;color:#374151">Rate</th>
          <th style="text-align:right;border-bottom:2px solid #e5e7eb;padding:16px 12px;font-size:14px;font-weight:600;color:#374151">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (li: any) => `
          <tr>
            <td style="padding:16px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">${escapeHtml(
              li.description
            )}</td>
            <td style="padding:16px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">${
              li.qty
            }</td>
            <td style="padding:16px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">${currency(
              li.rate
            )}</td>
            <td style="padding:16px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;font-weight:600">${currency(
              li.amount
            )}</td>
          </tr>`
          )
          .join("")}
        ${
          items.length === 0
            ? `<tr><td colspan="4" style="padding:24px;color:#9ca3af;text-align:center;font-size:14px;font-style:italic">No line items</td></tr>`
            : ""
        }
      </tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
      <div style="min-width:300px;border:2px solid #e5e7eb;border-radius:12px;padding:24px;background:#f9fafb">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px;color:#374151">
          <div>Subtotal</div>
          <div>${currency(subtotal)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:18px;color:#1f2937;padding-top:12px;border-top:1px solid #e5e7eb">
          <div>Total</div>
          <div>${currency(total)}</div>
        </div>
      </div>
    </div>

    <div style="margin-top:32px;font-size:12px;color:#9ca3af;text-align:center;padding-top:24px;border-top:1px solid #f3f4f6">Thank you for your business.</div>
  </div>`;
  return container.querySelector("#pdf-invoice") as HTMLElement;
}

export async function renderInvoicePreview({
  company,
  logoUrl,
  invoice,
}: InvoicePdfInput) {
  // Fetch line items from subcollection if not provided
  let completeInvoice = { ...invoice };

  if (!invoice.lineItems && invoice.id) {
    try {
      const { initializeApp, getApps } = await import("firebase/app");
      const { getFirestore, collection, getDocs, doc, getDoc } = await import(
        "firebase/firestore"
      );
      const { firebaseConfig } = await import("../services/firebase");

      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      // First, check if line items are stored directly in the invoice document
      const invoiceDoc = await getDoc(doc(db, "invoices", invoice.id));
      const invoiceData = invoiceDoc.data();

      let lineItems: any[] = [];

      // Check for line items in the invoice document first
      if (invoiceData?.lineItems && Array.isArray(invoiceData.lineItems)) {
        lineItems = invoiceData.lineItems;
        console.log("Found line items in invoice document:", lineItems);
      } else if (invoiceData?.items && Array.isArray(invoiceData.items)) {
        lineItems = invoiceData.items;
        console.log("Found items in invoice document:", lineItems);
      } else {
        // Fetch line items from subcollection
        const lineItemsSnap = await getDocs(
          collection(db, `invoices/${invoice.id}/lineItems`)
        );
        lineItemsSnap.forEach((doc) => {
          lineItems.push({ id: doc.id, ...doc.data() });
        });
        console.log("Found line items in subcollection:", lineItems);
      }

      completeInvoice = {
        ...invoice,
        lineItems,
        dueDate: invoice.dueDate || invoiceData?.dueDate,
        notes:
          invoice.notes ||
          invoice.memo ||
          invoiceData?.memo ||
          invoiceData?.notes ||
          "", // Handle both notes and memo fields
      };

      console.log("Complete invoice data:", completeInvoice);
    } catch (error) {
      console.warn("Failed to fetch line items:", error);
      // Continue with original invoice data
    }
  }

  const el = buildInvoiceHtml({ company, logoUrl, invoice: completeInvoice });
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.6)";
  overlay.style.zIndex = "10000";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "20px";

  const modal = document.createElement("div");
  modal.style.position = "relative";
  modal.style.width = "100%";
  modal.style.maxWidth = "1000px";
  modal.style.maxHeight = "95vh";
  modal.style.overflow = "auto";
  modal.style.background = "#fff";
  modal.style.borderRadius = "16px";
  modal.style.boxShadow = "0 20px 60px rgba(0,0,0,0.3)";
  modal.style.padding = "0";
  modal.style.border = "1px solid #e5e7eb";

  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.position = "absolute";
  close.style.right = "16px";
  close.style.top = "16px";
  close.style.fontSize = "28px";
  close.style.lineHeight = "1";
  close.style.background = "rgba(0,0,0,0.1)";
  close.style.border = "none";
  close.style.borderRadius = "50%";
  close.style.width = "40px";
  close.style.height = "40px";
  close.style.cursor = "pointer";
  close.style.display = "flex";
  close.style.alignItems = "center";
  close.style.justifyContent = "center";
  close.style.color = "#666";
  close.style.fontWeight = "bold";
  close.style.zIndex = "1";
  close.style.transition = "all 0.2s ease";

  close.addEventListener("mouseenter", () => {
    close.style.background = "rgba(0,0,0,0.2)";
    close.style.color = "#333";
  });

  close.addEventListener("mouseleave", () => {
    close.style.background = "rgba(0,0,0,0.1)";
    close.style.color = "#666";
  });

  close.addEventListener("click", () => overlay.remove());

  // Add download buttons
  const downloadContainer = document.createElement("div");
  downloadContainer.style.position = "absolute";
  downloadContainer.style.right = "16px";
  downloadContainer.style.top = "70px";
  downloadContainer.style.display = "flex";
  downloadContainer.style.flexDirection = "column";
  downloadContainer.style.gap = "8px";
  downloadContainer.style.zIndex = "1";

  const downloadPdfBtn = document.createElement("button");
  downloadPdfBtn.textContent = "Download PDF";
  downloadPdfBtn.style.padding = "8px 16px";
  downloadPdfBtn.style.background = "#3b82f6";
  downloadPdfBtn.style.color = "white";
  downloadPdfBtn.style.border = "none";
  downloadPdfBtn.style.borderRadius = "8px";
  downloadPdfBtn.style.fontSize = "14px";
  downloadPdfBtn.style.fontWeight = "500";
  downloadPdfBtn.style.cursor = "pointer";
  downloadPdfBtn.style.transition = "background 0.2s ease";

  downloadPdfBtn.addEventListener("mouseenter", () => {
    downloadPdfBtn.style.background = "#2563eb";
  });

  downloadPdfBtn.addEventListener("mouseleave", () => {
    downloadPdfBtn.style.background = "#3b82f6";
  });

  downloadPdfBtn.addEventListener("click", async () => {
    try {
      await renderInvoicePdf({ company, logoUrl, invoice: completeInvoice });
    } catch (error) {
      console.error("Failed to download PDF:", error);
    }
  });

  downloadContainer.appendChild(downloadPdfBtn);

  modal.appendChild(close);
  modal.appendChild(downloadContainer);
  modal.appendChild(el);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Close on escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
}

export async function renderInvoicePdf({
  company,
  logoUrl,
  invoice,
}: InvoicePdfInput) {
  // Fetch line items from subcollection if not provided
  let completeInvoice = { ...invoice };

  if (!invoice.lineItems && invoice.id) {
    try {
      const { initializeApp, getApps } = await import("firebase/app");
      const { getFirestore, collection, getDocs, doc, getDoc } = await import(
        "firebase/firestore"
      );
      const { firebaseConfig } = await import("../services/firebase");

      if (!getApps().length) initializeApp(firebaseConfig);
      const db = getFirestore();

      // First, check if line items are stored directly in the invoice document
      const invoiceDoc = await getDoc(doc(db, "invoices", invoice.id));
      const invoiceData = invoiceDoc.data();

      let lineItems: any[] = [];

      // Check for line items in the invoice document first
      if (invoiceData?.lineItems && Array.isArray(invoiceData.lineItems)) {
        lineItems = invoiceData.lineItems;
        console.log("Found line items in invoice document:", lineItems);
      } else if (invoiceData?.items && Array.isArray(invoiceData.items)) {
        lineItems = invoiceData.items;
        console.log("Found items in invoice document:", lineItems);
      } else {
        // Fetch line items from subcollection
        const lineItemsSnap = await getDocs(
          collection(db, `invoices/${invoice.id}/lineItems`)
        );
        lineItemsSnap.forEach((doc) => {
          lineItems.push({ id: doc.id, ...doc.data() });
        });
        console.log("Found line items in subcollection:", lineItems);
      }

      completeInvoice = {
        ...invoice,
        lineItems,
        dueDate: invoice.dueDate || invoiceData?.dueDate,
        notes:
          invoice.notes ||
          invoice.memo ||
          invoiceData?.memo ||
          invoiceData?.notes ||
          "", // Handle both notes and memo fields
      };

      console.log("Complete invoice data:", completeInvoice);
    } catch (error) {
      console.warn("Failed to fetch line items:", error);
      // Continue with original invoice data
    }
  }

  const el = buildInvoiceHtml({ company, logoUrl, invoice: completeInvoice });
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.zIndex = "9999";
  el.style.width = "800px";
  el.style.background = "#fff";
  host.appendChild(el);
  document.body.appendChild(host);
  const images = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      (img as HTMLImageElement).complete
        ? Promise.resolve()
        : new Promise((res) => {
            (img as HTMLImageElement).onload = (
              img as HTMLImageElement
            ).onerror = () => res(undefined);
          })
    )
  );
  const { default: html2pdf } = await import("html2pdf.js");
  await (html2pdf as any)()
    .set({
      margin: [10, 10, 10, 10],
      filename: `${invoice?.invoiceNumber || invoice?.id || "invoice"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: "pt", format: "letter", orientation: "portrait" },
    })
    .from(el)
    .save();
  host.remove();
}
