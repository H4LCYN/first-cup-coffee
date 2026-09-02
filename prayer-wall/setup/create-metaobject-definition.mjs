#!/usr/bin/env node
/**
 * One-time setup: creates the prayer_request metaobject definition on the store.
 * Run once — re-running after the definition exists will surface a userError, not a crash.
 *
 * Usage:
 *   SHOPIFY_STORE_DOMAIN=first-cup-coffee-co.myshopify.com \
 *   SHOPIFY_ADMIN_TOKEN=shpat_xxxx \
 *   node create-metaobject-definition.mjs
 */

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN } = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
  console.error("Missing required env vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN");
  process.exit(1);
}

const mutation = `
  mutation CreatePrayerRequestDefinition {
    metaobjectDefinitionCreate(definition: {
      type: "prayer_request"
      name: "Prayer Request"
      displayNameKey: "request_text"
      access: { storefront: PUBLIC_READ }
      fieldDefinitions: [
        { key: "request_text", name: "Request Text", type: "multi_line_text_field", required: true }
        { key: "display_name", name: "Display Name", type: "single_line_text_field" }
        { key: "is_anonymous", name: "Anonymous", type: "boolean" }
        { key: "customer_id", name: "Customer ID", type: "single_line_text_field" }
        { key: "status", name: "Status", type: "single_line_text_field",
          validations: [{ name: "choices", value: "[\\\"pending\\\",\\\"active\\\",\\\"expired\\\",\\\"deleted\\\"]" }] }
        { key: "submitted_at", name: "Submitted At", type: "date_time" }
        { key: "posted_at", name: "Posted At", type: "date_time" }
        { key: "praying_names", name: "Praying Names", type: "list.single_line_text_field" }
        { key: "praying_customer_ids", name: "Praying Customer IDs", type: "list.single_line_text_field" }
        { key: "praise_report", name: "Praise Report", type: "multi_line_text_field" }
        { key: "pending_praise_report", name: "Pending Praise Report Update", type: "multi_line_text_field" }
      ]
    }) {
      metaobjectDefinition { id type }
      userErrors { field message }
    }
  }
`;

const res = await fetch(
  `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query: mutation }),
  }
);

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { data, errors } = await res.json();

if (errors?.length) {
  console.error("GraphQL errors:", JSON.stringify(errors, null, 2));
  process.exit(1);
}

const { metaobjectDefinition, userErrors } = data.metaobjectDefinitionCreate;

if (userErrors.length) {
  console.error("User errors:", JSON.stringify(userErrors, null, 2));
  process.exit(1);
}

console.log(`Created: ${metaobjectDefinition.type} (${metaobjectDefinition.id})`);
