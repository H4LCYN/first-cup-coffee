// Throttling for guest (logged-out) submissions. Guests have no customer ID, so the
// per-customer limits in submission-limits.server.js can't apply to them.
//
// Two layers:
//  - per visitor IP, when we can tell it apart from Shopify's own proxy hop
//  - a global hourly cap on all guest posts, as a backstop if IPs aren't available

import crypto from "node:crypto";
import prisma from "../db.server";

const PER_IP_PER_DAY = Number(process.env.GUEST_SUBMISSIONS_PER_IP_PER_DAY || 3);
const GLOBAL_PER_HOUR = Number(process.env.GUEST_SUBMISSIONS_PER_HOUR || 20);

// App Proxy requests reach Cloud Run from Shopify's servers, and Cloud Run appends the
// address it saw (Shopify's) to X-Forwarded-For. Only trust the first entry when there's
// more than one, i.e. when something upstream of Cloud Run put the visitor's IP there.
// Otherwise every guest would share Shopify's IP and one bucket.
export function clientIpHash(request) {
  const hops = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops.length < 2) return null;
  return crypto
    .createHash("sha256")
    .update(hops[0] + (process.env.SHOPIFY_API_SECRET || ""))
    .digest("hex");
}

export async function checkGuestAllowed(ipHash) {
  const now = Date.now();

  const lastHour = await prisma.guestSubmission.count({
    where: { createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
  });
  if (lastHour >= GLOBAL_PER_HOUR) {
    return { allowed: false, reason: "We're receiving a lot of requests right now. Please try again later, or log in to post." };
  }

  if (ipHash) {
    const today = await prisma.guestSubmission.count({
      where: { ipHash, createdAt: { gt: new Date(now - 24 * 60 * 60 * 1000) } },
    });
    if (today >= PER_IP_PER_DAY) {
      return { allowed: false, reason: "You've shared several requests today. Please try again tomorrow, or log in to post." };
    }
  }

  return { allowed: true };
}

export async function recordGuestSubmission(ipHash) {
  await prisma.guestSubmission.create({ data: { ipHash } });
}
