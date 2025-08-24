import { useState } from "react";
import Campaigns from "./Campaigns";
import Templates from "./Templates";
import Social from "./Social";
import { RoleGuard } from "../../context/RoleGuard";

export default function CampaignsPage() {
  const [tab, setTab] = useState<"campaigns" | "templates" | "social">(
    "campaigns"
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Marketing</h1>
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            tab === "campaigns"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-600 dark:text-zinc-300"
          }`}
          onClick={() => setTab("campaigns")}
        >
          Campaigns
        </button>
        <button
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            tab === "templates"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-600 dark:text-zinc-300"
          }`}
          onClick={() => setTab("templates")}
        >
          Templates
        </button>
        <button
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            tab === "social"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-600 dark:text-zinc-300"
          }`}
          onClick={() => setTab("social")}
        >
          Social
        </button>
      </div>
      {tab === "campaigns" ? (
        <Campaigns />
      ) : tab === "templates" ? (
        <Templates />
      ) : (
        <Social />
      )}
      <div className="text-xs text-zinc-500">
        <RoleGuard allow={["owner", "super_admin"]}>
          <div>
            Backend stubs planned:
            <ul className="list-disc ml-5">
              <li>
                sendCampaignBatch(campaignId): resolves audience, fans out
                notifications
              </li>
              <li>
                handleSendGridWebhook: update campaignActivities for
                delivered/opened/clicked
              </li>
              <li>
                reviewRequestFlow: post-service trigger; send X hours after
                completion
              </li>
            </ul>
          </div>
        </RoleGuard>
      </div>
    </div>
  );
}
