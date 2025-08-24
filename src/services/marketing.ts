// Marketing backend stub notes — to be implemented in Cloud Functions
// This file documents the flows and provides placeholder types used by UI.

export type CampaignActivityEvent =
  | {
      type: "delivered";
      campaignId: string;
      notificationId?: string;
      email?: string;
      at: number;
    }
  | {
      type: "opened";
      campaignId: string;
      notificationId?: string;
      email?: string;
      at: number;
    }
  | {
      type: "clicked";
      campaignId: string;
      notificationId?: string;
      email?: string;
      at: number;
      url?: string;
    };

// sendCampaignBatch(campaignId):
// - Resolve audience based on saved JSON query
// - Fan out one document per recipient into `notifications` collection with fields:
//   { type: "email_campaign", campaignId, toEmail, templateId, payload, status: "queued", provider: "sendgrid", createdAt }
// - A separate Functions worker processes notifications and calls SendGrid (real keys later)
export async function sendCampaignBatch(_campaignId: string): Promise<void> {
  // no-op in web app; implemented server-side
  return;
}

// handleSendGridWebhook:
// - HTTP endpoint that receives SendGrid event webhooks
// - Map events to `campaignActivities` collection with shape:
//   { campaignId, notificationId, email, event: "delivered|open|click", url?, occurredAt, receivedAt }
// - Update aggregate counters on campaign document: metrics.sent/delivered/opened/clicked
export async function handleSendGridWebhook(_payload: unknown): Promise<void> {
  // no-op; documented for future Cloud Functions implementation
  return;
}

// reviewRequestFlow:
// - Firestore trigger on serviceHistory create/update to "completed"
// - After X hours (org setting), enqueue a review-request email notification using a template
// - De-dupe if already sent or if review exists with score
export async function reviewRequestFlow(_jobId: string): Promise<void> {
  // no-op; server-only
  return;
}
