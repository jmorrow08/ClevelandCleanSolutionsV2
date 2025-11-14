import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../../context/SettingsContext";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { computeLastCompletedPeriod } from "../../services/payrollPeriods";
import FaviconUpload from "../../components/FaviconUpload";

type PayrollFrequency = "weekly" | "biweekly" | "monthly";

export default function OrgSettings() {
  const { settings, save } = useSettings();
  const { show } = useToast();
  const { claims } = useAuth();

  const canEdit = Boolean(claims?.super_admin || claims?.owner);

  // Company profile state
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [faviconDataUrl, setFaviconDataUrl] = useState("");

  const [arTermsDays, setArTermsDays] = useState<number | "">("");
  const [payrollCycle, setPayrollCycle] = useState<PayrollFrequency>("monthly");
  const [anchorDayOfWeek, setAnchorDayOfWeek] = useState<number>(1);
  const [anchorDayOfMonth, setAnchorDayOfMonth] = useState<number>(1);
  const [anchorDate, setAnchorDate] = useState<string>("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [defaultSubject, setDefaultSubject] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const terms = (settings?.arTermsDays ??
      settings?.billingTermsDays ??
      30) as number | undefined;
    setArTermsDays(typeof terms === "number" ? terms : "");
    const freq = (settings?.payrollCycle as any)?.frequency as
      | PayrollFrequency
      | undefined;
    setPayrollCycle(freq || "monthly");
    const pc = settings?.payrollCycle as any;
    setAnchorDayOfWeek(
      Number.isInteger(pc?.anchorDayOfWeek) ? Number(pc.anchorDayOfWeek) : 1
    );
    setAnchorDayOfMonth(
      Number.isInteger(pc?.anchorDayOfMonth) ? Number(pc.anchorDayOfMonth) : 1
    );
    // anchorDate -> ISO yyyy-mm-dd
    try {
      const ad = pc?.anchorDate?.toDate
        ? pc.anchorDate.toDate()
        : pc?.anchorDate?.seconds
        ? new Date(pc.anchorDate.seconds * 1000)
        : pc?.anchorDate instanceof Date
        ? pc.anchorDate
        : pc?.anchorDate
        ? new Date(pc.anchorDate)
        : null;
      setAnchorDate(
        ad && !Number.isNaN(ad.getTime()) ? ad.toISOString().slice(0, 10) : ""
      );
    } catch {
      setAnchorDate("");
    }
    setFromName(settings?.emailBranding?.fromName || "");
    setFromEmail(settings?.emailBranding?.fromEmail || "");
    setReplyToEmail(settings?.emailBranding?.replyToEmail || "");
    setDefaultSubject(settings?.emailBranding?.defaultSubject || "");
    setFooterHtml(settings?.emailBranding?.footerHtml || "");
    setFacebook(settings?.socialLinks?.facebook || "");
    setInstagram(settings?.socialLinks?.instagram || "");
    setTwitter(settings?.socialLinks?.twitter || "");
    setLinkedin(settings?.socialLinks?.linkedin || "");
    setTiktok(settings?.socialLinks?.tiktok || "");
    setYoutube(settings?.socialLinks?.youtube || "");

    // Load company profile settings
    setCompanyName(settings?.companyProfile?.name || "");
    setCompanyEmail(settings?.companyProfile?.email || "");
    setCompanyPhone(settings?.companyProfile?.phone || "");
    setLogoDataUrl(settings?.companyProfile?.logoDataUrl || "");
    setFaviconDataUrl(settings?.companyProfile?.faviconDataUrl || "");
  }, [settings]);

  const isValid = useMemo(() => {
    const arOk = typeof arTermsDays === "number" && arTermsDays >= 0;
    const emailOk = !fromEmail || /.+@.+\..+/.test(fromEmail);
    const replyOk = !replyToEmail || /.+@.+\..+/.test(replyToEmail);
    const aDowOk = anchorDayOfWeek >= 0 && anchorDayOfWeek <= 6;
    const aDomOk = anchorDayOfMonth >= 1 && anchorDayOfMonth <= 28;
    const urlsOk = [facebook, instagram, twitter, linkedin, tiktok, youtube]
      .filter(Boolean)
      .every((u) => /^https?:\/\//i.test(u));
    return arOk && emailOk && replyOk && aDowOk && aDomOk && urlsOk;
  }, [
    arTermsDays,
    fromEmail,
    replyToEmail,
    anchorDayOfWeek,
    anchorDayOfMonth,
    facebook,
    instagram,
    twitter,
    linkedin,
    tiktok,
    youtube,
  ]);

  async function handleSave() {
    if (!canEdit) return;
    if (!isValid) {
      show({ type: "error", message: "Please fix validation errors" });
      return;
    }
    try {
      setSaving(true);
      await save({
        arTermsDays: typeof arTermsDays === "number" ? arTermsDays : undefined,
        billingTermsDays:
          typeof arTermsDays === "number" ? arTermsDays : undefined,
        payrollCycle: {
          frequency: payrollCycle,
          anchorDayOfWeek,
          anchorDayOfMonth,
          ...(anchorDate && { anchorDate: new Date(anchorDate) }),
        },
        emailBranding: {
          ...(fromName.trim() && { fromName: fromName.trim() }),
          ...(fromEmail.trim() && { fromEmail: fromEmail.trim() }),
          ...(replyToEmail.trim() && { replyToEmail: replyToEmail.trim() }),
          ...(defaultSubject.trim() && {
            defaultSubject: defaultSubject.trim(),
          }),
          ...(footerHtml.trim() && { footerHtml: footerHtml.trim() }),
        },
        socialLinks: {
          ...(facebook.trim() && { facebook: facebook.trim() }),
          ...(instagram.trim() && { instagram: instagram.trim() }),
          ...(twitter.trim() && { twitter: twitter.trim() }),
          ...(linkedin.trim() && { linkedin: linkedin.trim() }),
          ...(tiktok.trim() && { tiktok: tiktok.trim() }),
          ...(youtube.trim() && { youtube: youtube.trim() }),
        },
        companyProfile: {
          name: companyName || undefined,
          email: companyEmail || undefined,
          phone: companyPhone || undefined,
          logoDataUrl: logoDataUrl || undefined,
          faviconDataUrl: faviconDataUrl || undefined,
        },
      });
      show({ type: "success", message: "Settings saved" });
    } catch (e: any) {
      show({ type: "error", message: e?.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="text-lg font-medium">Organization Settings</div>

      <section className="space-y-6">
        {/* Company Profile Section */}
        <div>
          <h3 className="text-lg font-medium mb-4">Company Profile</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Company Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Cleveland Clean Solutions"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Company Email</label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="info@cleclean.com"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Company Phone</label>
              <input
                type="tel"
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="(216) 555-0000"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Logo URL</label>
              <input
                type="url"
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={logoDataUrl}
                onChange={(e) => setLogoDataUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                disabled={!canEdit}
              />
              {logoDataUrl && (
                <div className="mt-2">
                  <img
                    src={logoDataUrl}
                    alt="Company Logo"
                    className="h-16 object-contain border rounded"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Favicon</label>
              <FaviconUpload
                value={faviconDataUrl}
                onChange={setFaviconDataUrl}
                disabled={!canEdit}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Upload a custom favicon for the browser tab (PNG, ICO, SVG
                recommended)
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <label className="block text-sm mb-1">AR Terms (days)</label>
          <input
            type="number"
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
            value={arTermsDays}
            onChange={(e) => {
              const v = e.target.value;
              const n = Number(v);
              if (v === "") setArTermsDays("");
              else if (!Number.isNaN(n)) setArTermsDays(n);
            }}
            placeholder="30"
            disabled={!canEdit}
            min={0}
          />
          <p className="text-xs text-zinc-500 mt-1">
            Used for invoice due dates and AR aging buckets.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Payroll Cycle</label>
          <select
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
            value={payrollCycle}
            onChange={(e) =>
              setPayrollCycle(e.target.value as PayrollFrequency)
            }
            disabled={!canEdit}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {payrollCycle === "weekly" && (
            <div className="mt-2">
              <label className="block text-sm mb-1">
                Anchor Day of Week (0=Sun..6=Sat)
              </label>
              <input
                type="number"
                min={0}
                max={6}
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={anchorDayOfWeek}
                onChange={(e) => setAnchorDayOfWeek(Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
          )}
          {payrollCycle === "biweekly" && (
            <div className="mt-2">
              <label className="block text-sm mb-1">
                Anchor Start Date (aligns 14-day windows)
              </label>
              <input
                type="date"
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          )}
          {payrollCycle === "monthly" && (
            <div className="mt-2">
              <label className="block text-sm mb-1">Anchor Day of Month</label>
              <input
                type="number"
                min={1}
                max={28}
                className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
                value={anchorDayOfMonth}
                onChange={(e) => setAnchorDayOfMonth(Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
          )}
          <PayrollPreview
            frequency={payrollCycle}
            dow={anchorDayOfWeek}
            dom={anchorDayOfMonth}
            adate={anchorDate}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Email From Name</label>
          <input
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Cleveland Clean Solutions"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Email From Address</label>
          <input
            type="email"
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="billing@example.com"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Reply-To Address</label>
          <input
            type="email"
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
            placeholder="support@example.com"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Default Email Subject</label>
          <input
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60"
            value={defaultSubject}
            onChange={(e) => setDefaultSubject(e.target.value)}
            placeholder="Your invoice from Cleveland Clean Solutions"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Email Footer (HTML)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 card-bg disabled:opacity-60 h-28"
            value={footerHtml}
            onChange={(e) => setFooterHtml(e.target.value)}
            placeholder="<p>Thanks for choosing us!</p>"
            disabled={!canEdit}
          />
          <div className="mt-2 text-xs text-zinc-500">Preview</div>
          <div className="mt-1 border rounded-md p-3 card-bg">
            <div className="text-sm font-medium mb-1">
              Subject: {defaultSubject || "(no subject)"}
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              From: {fromName || ""} &lt;{fromEmail || ""}&gt;
            </div>
            <div className="text-sm">Hello,</div>
            <div className="text-sm">
              This is a preview of your branded email.
            </div>
            <div
              className="mt-3 text-sm border-t pt-2"
              dangerouslySetInnerHTML={{ __html: footerHtml || "" }}
            />
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-1">Social Links</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded-md px-3 py-2 card-bg"
              placeholder="https://facebook.com/yourpage"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              disabled={!canEdit}
            />
            <input
              className="border rounded-md px-3 py-2 card-bg"
              placeholder="https://instagram.com/yourpage"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              disabled={!canEdit}
            />
            <input
              className="border rounded-md px-3 py-2 card-bg"
              placeholder="https://twitter.com/yourhandle"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              disabled={!canEdit}
            />
            <input
              className="border rounded-md px-3 py-2 card-bg"
              placeholder="https://linkedin.com/company/yourcompany"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              disabled={!canEdit}
            />
            <input
              className="border rounded-md px-3 py-2 card-bg"
              placeholder="https://tiktok.com/@yourhandle"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              disabled={!canEdit}
            />
            <input
              className="border rounded-md px-3 py-2 card-bg"
              placeholder="https://youtube.com/@yourchannel"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <div className="pt-2">
        <button
          className={`px-3 py-1.5 rounded-md text-white ${
            !canEdit || !isValid || saving
              ? "bg-zinc-400"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          onClick={handleSave}
          disabled={!canEdit || !isValid || saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!canEdit && (
          <span className="text-xs text-zinc-500 ml-3">
            Read-only. Only owners and super admins can edit.
          </span>
        )}
      </div>
    </div>
  );
}

function PayrollPreview({
  frequency,
  dow,
  dom,
  adate,
}: {
  frequency: PayrollFrequency;
  dow: number;
  dom: number;
  adate: string;
}) {
  const period = useMemo(() => {
    const cycle: any = {
      frequency,
      anchorDayOfWeek: dow,
      anchorDayOfMonth: dom,
      anchorDate: adate ? new Date(adate) : undefined,
    };
    return computeLastCompletedPeriod(new Date(), cycle);
  }, [frequency, dow, dom, adate]);
  return (
    <div className="mt-2 text-xs text-zinc-500">
      Last completed period:{" "}
      {period
        ? `${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}`
        : "—"}
    </div>
  );
}
