import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function adminEntryUrl(shop, metaobjectGid) {
  // metaobjectGid looks like "gid://shopify/Metaobject/123456789"
  const numericId = metaobjectGid.split("/").pop();
  return `https://${shop}/admin/content/entries/prayer_request/${numericId}`;
}

export async function notifyModeratorOfNewRequest({ shop, metaobjectId, requestText, displayName, isAnonymous }) {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping moderator email. Set it in .env to enable notifications.");
    return;
  }
  const url = adminEntryUrl(shop, metaobjectId);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: process.env.MODERATOR_EMAIL,
    subject: "New prayer request posted to the wall",
    text: `A new prayer request has been posted live on the Prayer Wall.\n\n` +
      `From: ${isAnonymous ? "Anonymous" : displayName || "(no name given)"}\n\n` +
      `Request:\n${requestText}\n\n` +
      `View it in Shopify Admin:\n${url}`,
  });
}

export async function notifyModeratorOfSpamReport({ shop, metaobjectId, requestText, reportedByCustomerId }) {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping spam report email.");
    return;
  }
  const url = adminEntryUrl(shop, metaobjectId);
  const to = process.env.SPAM_REPORT_EMAIL || "support@firstcup.com";
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject: "Prayer Wall — spam report",
    text: `A prayer request has been reported as spam.\n\n` +
      `Reported by: ${reportedByCustomerId || "Anonymous guest"}\n\n` +
      `Request text:\n${requestText}\n\n` +
      `Review and remove if needed:\n${url}`,
  });
}

export async function notifyModeratorOfPraiseUpdate({ shop, metaobjectId, pendingPraiseReportText }) {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping moderator email. Set it in .env to enable notifications.");
    return;
  }
  const url = adminEntryUrl(shop, metaobjectId);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: process.env.MODERATOR_EMAIL,
    subject: "New praise report posted to the Prayer Wall",
    text: `A praise report has been published live on the Prayer Wall.\n\n` +
      `Report:\n${pendingPraiseReportText}\n\n` +
      `View it in Shopify Admin:\n${url}`,
  });
}
