#!/usr/bin/env node
/**
 * One-time migration: adds the optional `title` field to the existing
 * prayer_request metaobject definition. Safe to re-run — it exits early if the
 * field is already there.
 *
 * Needs an Admin token with the write_metaobject_definitions scope.
 *
 * Usage:
 *   SHOPIFY_STORE_DOMAIN=first-cup-coffee-co.myshopify.com \
 *   SHOPIFY_ADMIN_TOKEN=shpat_xxxx \
 *   node add-title-field.mjs
 */

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN } = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
  console.error("Missing required env vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN");
  process.exit(1);
}

async function gql(query, variables) {
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

const lookup = await gql(`
  query { metaobjectDefinitionByType(type: "prayer_request") { id fieldDefinitions { key } } }
`);
const def = lookup.data?.metaobjectDefinitionByType;
if (!def) {
  console.error("prayer_request definition not found:", JSON.stringify(lookup.errors ?? lookup));
  process.exit(1);
}
if (def.fieldDefinitions.some((f) => f.key === "title")) {
  console.log("`title` field already exists — nothing to do.");
  process.exit(0);
}

const result = await gql(
  `mutation AddTitle($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition { id fieldDefinitions { key } }
      userErrors { field message }
    }
  }`,
  {
    id: def.id,
    definition: {
      fieldDefinitions: [
        {
          create: {
            key: "title",
            name: "Title",
            type: "single_line_text_field",
            validations: [{ name: "max", value: "80" }],
          },
        },
      ],
    },
  },
);

const errors = result.data?.metaobjectDefinitionUpdate?.userErrors ?? [];
if (errors.length || result.errors) {
  console.error("Failed:", JSON.stringify(errors.length ? errors : result.errors, null, 2));
  process.exit(1);
}
console.log("Added `title` field:", JSON.stringify(result.data.metaobjectDefinitionUpdate.metaobjectDefinition));
