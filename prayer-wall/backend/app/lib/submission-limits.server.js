const MAX_ACTIVE = Number(process.env.MAX_ACTIVE_REQUESTS_PER_CUSTOMER || 5);

export function checkSubmissionAllowed(existingRequestsForCustomer) {
  const countable = existingRequestsForCustomer.filter(
    (r) => r.status === "pending" || r.status === "active",
  );

  if (countable.length >= MAX_ACTIVE) {
    return {
      allowed: false,
      reason: `You already have ${MAX_ACTIVE} active prayer requests. Delete one before posting another.`,
    };
  }

  return { allowed: true };
}

export function isExpired(request, lifetimeDays = Number(process.env.REQUEST_LIFETIME_DAYS || 15)) {
  if (request.status !== "active" || !request.postedAt) return false;
  const postedAt = new Date(request.postedAt).getTime();
  const ageDays = (Date.now() - postedAt) / (1000 * 60 * 60 * 24);
  return ageDays > lifetimeDays;
}
