// Single dispatcher for every storefront-facing action, reached via Shopify's
// App Proxy at /apps/prayer-wall/<action> (see shopify.app.toml [app_proxy]).
// Shopify verifies the request signature and appends `logged_in_customer_id`
// for us before it ever reaches this route — see authenticate.public.appProxy.

import { authenticate } from "../shopify.server";
import { getCustomerDisplayName } from "../lib/customers.server";
import {
  createRequest,
  findByCustomer,
  findById,
  listAllPrayerRequests,
  softDelete,
  stagePraiseUpdate,
  togglePray,
} from "../lib/metaobjects.server";
import {
  notifyModeratorOfNewRequest,
  notifyModeratorOfPraiseUpdate,
  notifyModeratorOfSpamReport,
} from "../lib/email.server";
import { checkSubmissionAllowed } from "../lib/submission-limits.server";
import { checkGuestAllowed, clientIpHash, recordGuestSubmission } from "../lib/guest-throttle.server";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  const actionName = params["*"]; // "submit" | "pray" | "delete" | "update-praise"

  const url = new URL(request.url);
  const rawCustomerId = url.searchParams.get("logged_in_customer_id");
  const customerId = rawCustomerId ? `gid://shopify/Customer/${rawCustomerId}` : null;
  const shop = session.shop;

  const body = await request.json().catch(() => ({}));

  // Pray, delete, and praise updates require a logged-in customer. Guests can submit,
  // but their requests go to the moderation queue (see "submit" below).
  if (!customerId && ["pray", "delete", "update-praise"].includes(actionName)) {
    return json({ error: "You must be logged in to do that." }, { status: 401 });
  }

  switch (actionName) {
    case "submit": {
      const title = String(body.title || "").trim().slice(0, 80);
      const requestText = (body.requestText || "").trim().slice(0, 2000);
      if (!requestText) return json({ error: "Prayer request text is required." }, { status: 400 });

      if (!customerId) {
        // Honeypot: the field is hidden from real visitors, so anything filling it is a bot.
        // Pretend it worked so the bot has nothing to adapt to.
        if (body.website) return json({ ok: true, status: "pending" });

        const ipHash = clientIpHash(request);
        const guestCheck = await checkGuestAllowed(ipHash);
        if (!guestCheck.allowed) return json({ error: guestCheck.reason }, { status: 429 });

        const metaobject = await createRequest(admin, {
          title,
          requestText,
          isAnonymous: true,
          customerId: null,
          status: "pending",
        });
        await recordGuestSubmission(ipHash);

        await notifyModeratorOfNewRequest({
          shop,
          metaobjectId: metaobject.id,
          title,
          requestText,
          isAnonymous: true,
          pending: true,
        });

        return json({ ok: true, status: "pending" });
      }

      const isAnonymous = !!body.isAnonymous;

      const existing = await findByCustomer(admin, customerId);
      const limitCheck = checkSubmissionAllowed(existing);
      if (!limitCheck.allowed) {
        return json({ error: limitCheck.reason }, { status: 429 });
      }

      const displayName = isAnonymous ? "" : body.displayName || (await getCustomerDisplayName(admin, customerId));

      const metaobject = await createRequest(admin, {
        title,
        requestText,
        displayName,
        isAnonymous,
        customerId,
      });

      await notifyModeratorOfNewRequest({
        shop,
        metaobjectId: metaobject.id,
        title,
        requestText,
        displayName,
        isAnonymous,
      });

      return json({ ok: true, status: "active" });
    }

    case "pray": {
      const { id } = body;
      if (!id) return json({ error: "Missing prayer request id." }, { status: 400 });
      const customerName = await getCustomerDisplayName(admin, customerId);
      const result = await togglePray(admin, { id, customerId, customerName });
      return json({ ok: true, ...result });
    }

    case "delete": {
      const { id } = body;
      if (!id) return json({ error: "Missing prayer request id." }, { status: 400 });
      try {
        await softDelete(admin, { id, customerId });
      } catch (e) {
        return json({ error: e.message }, { status: 403 });
      }
      return json({ ok: true });
    }

    case "update-praise": {
      const { id, praiseReportText } = body;
      if (!id || !praiseReportText?.trim()) {
        return json({ error: "Missing prayer request id or praise report text." }, { status: 400 });
      }
      try {
        await stagePraiseUpdate(admin, { id, customerId, praiseReportText: praiseReportText.trim() });
      } catch (e) {
        return json({ error: e.message }, { status: 403 });
      }
      await notifyModeratorOfPraiseUpdate({
        shop,
        metaobjectId: id,
        pendingPraiseReportText: praiseReportText.trim(),
      });
      return json({ ok: true });
    }

    case "report-spam": {
      const { id } = body;
      if (!id) return json({ error: "Missing prayer request id." }, { status: 400 });
      const entry = await findById(admin, id);
      if (!entry) return json({ error: "Prayer request not found." }, { status: 404 });
      await notifyModeratorOfSpamReport({
        shop,
        metaobjectId: id,
        requestText: entry.requestText,
        reportedByCustomerId: customerId,
      }).catch(() => {});
      return json({ ok: true });
    }

    default:
      return json({ error: `Unknown action: ${actionName}` }, { status: 404 });
  }
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const rawCustomerId = url.searchParams.get("logged_in_customer_id");
  const customerId = rawCustomerId ? `gid://shopify/Customer/${rawCustomerId}` : null;

  const all = await listAllPrayerRequests(admin);

  const published = all
    .filter((r) => r.status === "active")
    // Guest posts approved in Admin have no posted_at, so fall back to submitted_at.
    .sort((a, b) => new Date(b.postedAt || b.submittedAt || 0) - new Date(a.postedAt || a.submittedAt || 0));

  const myRequests = customerId
    ? all.filter((r) => r.customerId === customerId && r.status !== "deleted")
    : [];

  const submitCheck = customerId
    ? checkSubmissionAllowed(myRequests)
    : { allowed: false, reason: null };

  return json({
    requests: published.map((r) => ({
      id: r.id,
      title: r.title || null,
      requestText: r.requestText,
      displayName: r.isAnonymous ? null : r.displayName,
      postedAt: r.postedAt || r.submittedAt,
      prayingCount: (r.prayingCustomerIds ?? []).length,
      prayingNames: r.prayingNames ?? [],
      isPrayingByMe: customerId ? (r.prayingCustomerIds ?? []).includes(customerId) : false,
      praiseReport: r.praiseReport || null,
      // Guests have no customerId, and neither do anonymous/legacy rows — don't let null match null.
      isMyRequest: !!customerId && r.customerId === customerId,
    })),
    myPendingRequests: myRequests
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, requestText: r.requestText, submittedAt: r.submittedAt })),
    canSubmit: submitCheck.allowed,
    // Separate flag so the older live section (which has no guest modal) keeps hiding the
    // form from guests; only the new section reads this. Guest throttling happens on submit.
    guestCanSubmit: !customerId,
    limitReason: submitCheck.allowed ? null : submitCheck.reason,
    loggedIn: !!customerId,
  });
};
