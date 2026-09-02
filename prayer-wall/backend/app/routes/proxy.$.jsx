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

  // Submit, pray, delete, and praise updates require a logged-in customer
  if (!customerId && ["submit", "pray", "delete", "update-praise"].includes(actionName)) {
    return json({ error: "You must be logged in to do that." }, { status: 401 });
  }

  switch (actionName) {
    case "submit": {
      const requestText = (body.requestText || "").trim();
      if (!requestText) return json({ error: "Prayer request text is required." }, { status: 400 });
      const isAnonymous = !customerId || !!body.isAnonymous;

      if (customerId) {
        const existing = await findByCustomer(admin, customerId);
        const limitCheck = checkSubmissionAllowed(existing);
        if (!limitCheck.allowed) {
          return json({ error: limitCheck.reason }, { status: 429 });
        }
      }

      const displayName = isAnonymous ? "" : body.displayName || (await getCustomerDisplayName(admin, customerId));

      const metaobject = await createRequest(admin, {
        requestText,
        displayName,
        isAnonymous,
        customerId,
      });

      await notifyModeratorOfNewRequest({
        shop,
        metaobjectId: metaobject.id,
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
    .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));

  const myRequests = customerId
    ? all.filter((r) => r.customerId === customerId && r.status !== "deleted")
    : [];

  const submitCheck = customerId
    ? checkSubmissionAllowed(myRequests)
    : { allowed: false, reason: null };

  return json({
    requests: published.map((r) => ({
      id: r.id,
      requestText: r.requestText,
      displayName: r.isAnonymous ? null : r.displayName,
      postedAt: r.postedAt,
      prayingCount: (r.prayingCustomerIds ?? []).length,
      prayingNames: r.prayingNames ?? [],
      isPrayingByMe: customerId ? (r.prayingCustomerIds ?? []).includes(customerId) : false,
      praiseReport: r.praiseReport || null,
      isMyRequest: r.customerId === customerId,
    })),
    myPendingRequests: myRequests
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, requestText: r.requestText, submittedAt: r.submittedAt })),
    canSubmit: submitCheck.allowed,
    limitReason: submitCheck.allowed ? null : submitCheck.reason,
    loggedIn: !!customerId,
  });
};
