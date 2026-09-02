// All reads/writes against the `prayer_request` metaobject (see
// /prayer-wall/docs/prayer_request_metaobject_setup.md for the field spec).
//
// NOTE on scale: findByCustomer() below fetches a page of entries and filters
// in JS rather than using a server-side field filter. That's intentional for
// a single-shop, low-volume feature like this — if the wall ever grows past a
// few hundred simultaneous entries, swap this for a proper filtered query.

const METAOBJECT_TYPE = "prayer_request";

const FIELD_KEYS = [
  "request_text",
  "display_name",
  "is_anonymous",
  "customer_id",
  "status",
  "submitted_at",
  "posted_at",
  "praying_names",
  "praying_customer_ids",
  "praise_report",
  "pending_praise_report",
];

function fieldsToObject(fieldNodes) {
  const out = {};
  for (const f of fieldNodes) {
    out[f.key] = f.jsonValue;
  }
  return out;
}

const FIELD_SELECTION = FIELD_KEYS.map(
  (key) => `${key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}: field(key: "${key}") { jsonValue }`,
).join("\n");

export async function listAllPrayerRequests(admin) {
  const response = await admin.graphql(
    `#graphql
    query ListPrayerRequests($type: String!, $cursor: String) {
      metaobjects(type: $type, first: 250, after: $cursor) {
        nodes {
          id
          ${FIELD_SELECTION}
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { variables: { type: METAOBJECT_TYPE } },
  );
  const json = await response.json();
  const nodes = json.data?.metaobjects?.nodes ?? [];
  return nodes.map((n) => ({
    id: n.id,
    requestText: n.requestText?.jsonValue,
    displayName: n.displayName?.jsonValue,
    isAnonymous: n.isAnonymous?.jsonValue === true || n.isAnonymous?.jsonValue === "true",
    customerId: n.customerId?.jsonValue,
    status: n.status?.jsonValue,
    submittedAt: n.submittedAt?.jsonValue,
    postedAt: n.postedAt?.jsonValue,
    prayingNames: n.prayingNames?.jsonValue ?? [],
    prayingCustomerIds: n.prayingCustomerIds?.jsonValue ?? [],
    praiseReport: n.praiseReport?.jsonValue,
    pendingPraiseReport: n.pendingPraiseReport?.jsonValue,
  }));
}

export async function findByCustomer(admin, customerId) {
  const all = await listAllPrayerRequests(admin);
  return all.filter((r) => r.customerId === customerId);
}

export async function findById(admin, id) {
  const all = await listAllPrayerRequests(admin);
  return all.find((r) => r.id === id) ?? null;
}

function toFieldInputs(values) {
  return Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
}

export async function createRequest(admin, { requestText, displayName, isAnonymous, customerId }) {
  const now = new Date().toISOString();
  const response = await admin.graphql(
    `#graphql
    mutation CreatePrayerRequest($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metaobject: {
          type: METAOBJECT_TYPE,
          fields: toFieldInputs({
            request_text: requestText,
            display_name: isAnonymous ? "" : displayName,
            is_anonymous: String(!!isAnonymous),
            customer_id: customerId,
            status: "active",
            submitted_at: now,
            posted_at: now,
            praying_names: [],
            praying_customer_ids: [],
          }),
        },
      },
    },
  );
  const json = await response.json();
  const errors = json.data?.metaobjectCreate?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return json.data.metaobjectCreate.metaobject;
}

// Keep old name as alias so any other callers aren't broken
export const createPendingRequest = createRequest;

async function updateFields(admin, id, values) {
  const response = await admin.graphql(
    `#graphql
    mutation UpdatePrayerRequest($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
    { variables: { id, metaobject: { fields: toFieldInputs(values) } } },
  );
  const json = await response.json();
  const errors = json.data?.metaobjectUpdate?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return json.data.metaobjectUpdate.metaobject;
}

export async function togglePray(admin, { id, customerId, customerName }) {
  const entry = await findById(admin, id);
  if (!entry) throw new Error("Prayer request not found");

  const ids = entry.prayingCustomerIds ?? [];
  const names = entry.prayingNames ?? [];
  const idx = ids.indexOf(customerId);

  let nextIds, nextNames, praying;
  if (idx === -1) {
    nextIds = [...ids, customerId];
    nextNames = [...names, customerName];
    praying = true;
  } else {
    nextIds = ids.filter((_, i) => i !== idx);
    nextNames = names.filter((_, i) => i !== idx);
    praying = false;
  }

  await updateFields(admin, id, {
    praying_customer_ids: nextIds,
    praying_names: nextNames,
  });

  return { praying, count: nextIds.length };
}

export async function softDelete(admin, { id, customerId }) {
  const entry = await findById(admin, id);
  if (!entry) throw new Error("Prayer request not found");
  if (entry.customerId !== customerId) throw new Error("Not the owner of this request");

  await updateFields(admin, id, { status: "deleted" });
}

export async function stagePraiseUpdate(admin, { id, customerId, praiseReportText }) {
  const entry = await findById(admin, id);
  if (!entry) throw new Error("Prayer request not found");
  if (entry.customerId !== customerId) throw new Error("Not the owner of this request");

  await updateFields(admin, id, { praise_report: praiseReportText });
}
