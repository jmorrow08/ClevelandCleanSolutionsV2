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
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (value instanceof Date) return value;
  const asNum = Number(value);
  if (Number.isFinite(asNum)) return new Date(asNum);
  try {
    return new Date(value);
  } catch (_e) {
    return undefined;
  }
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
  <div id="pdf-invoice" style="width:800px;padding:28px;font-family:Inter,system-ui,Arial;line-height:1.35;background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="display:flex;gap:12px;align-items:center">
        <img src="${escapeHtml(
          logoUrl || "/vite.svg"
        )}" style="height:48px;width:auto;border-radius:6px"/>
        <div>
          <div style="font-weight:800;font-size:18px">${escapeHtml(
            company?.name || "Cleveland Clean Solutions"
          )}</div>
          <div style="font-size:12px;color:#667085">${escapeHtml(
            company?.email || ""
          )}${company?.phone ? " • " + escapeHtml(company.phone) : ""}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800">INVOICE</div>
        <div style="font-size:12px;color:#667085">No. ${escapeHtml(
          invoice?.invoiceNumber || invoice?.id || ""
        )}</div>
        <div style="font-size:12px;color:#667085">Due: ${escapeHtml(
          dueStr
        )}</div>
        <div style="font-size:12px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;display:inline-block;margin-top:4px">${String(
          invoice?.status || "pending"
        ).toUpperCase()}</div>
      </div>
    </div>

    <div style="display:flex;gap:24px;margin:12px 0 18px">
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:12px">
        <div style="font-size:12px;color:#667085">Bill To</div>
        <div style="font-weight:700">${escapeHtml(
          invoice?.clientName || ""
        )}</div>
        <div style="font-size:12px;color:#667085">${escapeHtml(
          invoice?.clientEmail || invoice?.payeeEmail || ""
        )}</div>
      </div>
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:12px">
        <div style="font-size:12px;color:#667085">Notes</div>
        <div>${
          invoice?.notes
            ? escapeHtml(invoice?.notes)
            : '<span style="color:#98a2b3">—</span>'
        }</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:left;border-bottom:1px solid #e2e8f0;padding:8px">Description</th>
          <th style="text-align:right;border-bottom:1px solid #e2e8f0;padding:8px">Qty</th>
          <th style="text-align:right;border-bottom:1px solid #e2e8f0;padding:8px">Rate</th>
          <th style="text-align:right;border-bottom:1px solid #e2e8f0;padding:8px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (li: any) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #f1f5f9">${escapeHtml(
              li.description
            )}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${
              li.qty
            }</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${currency(
              li.rate
            )}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #f1f5f9">${currency(
              li.amount
            )}</td>
          </tr>`
          )
          .join("")}
        ${
          items.length === 0
            ? `<tr><td colspan="4" style="padding:12px;color:#98a2b3;text-align:center">No line items</td></tr>`
            : ""
        }
      </tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <div style="min-width:260px;border:1px solid #e2e8f0;border-radius:10px;padding:12px">
        <div style="display:flex;justify-content:space-between"><div>Subtotal</div><div>${currency(
          subtotal
        )}</div></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin-top:8px">
          <div>Total</div><div>${currency(total)}</div>
        </div>
      </div>
    </div>

    <div style="margin-top:18px;font-size:11px;color:#98a2b3">Thank you for your business.</div>
  </div>`;
  return container.querySelector("#pdf-invoice") as HTMLElement;
}

export async function renderInvoicePreview({
  company,
  logoUrl,
  invoice,
}: InvoicePdfInput) {
  const el = buildInvoiceHtml({ company, logoUrl, invoice });
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.4)";
  overlay.style.zIndex = "10000";
  const modal = document.createElement("div");
  modal.style.position = "absolute";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.maxWidth = "90vw";
  modal.style.maxHeight = "90vh";
  modal.style.overflow = "auto";
  modal.style.background = "#fff";
  modal.style.borderRadius = "12px";
  modal.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";
  modal.style.padding = "12px";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.position = "absolute";
  close.style.right = "8px";
  close.style.top = "4px";
  close.style.fontSize = "22px";
  close.style.lineHeight = "22px";
  close.style.background = "transparent";
  close.style.border = "none";
  close.style.cursor = "pointer";
  close.addEventListener("click", () => overlay.remove());
  modal.appendChild(close);
  modal.appendChild(el);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

export async function renderInvoicePdf({
  company,
  logoUrl,
  invoice,
}: InvoicePdfInput) {
  const el = buildInvoiceHtml({ company, logoUrl, invoice });
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
