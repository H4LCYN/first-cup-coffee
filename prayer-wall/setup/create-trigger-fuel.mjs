#!/usr/bin/env node
/**
 * Creates the Trigger Fuel product as a DRAFT (not visible on the storefront),
 * using the trigger-fuel product template. Safe to re-run: it stops if a product
 * with the handle already exists.
 *
 * Needs an Admin token with read_products + write_products.
 *
 * Usage:
 *   SHOPIFY_STORE_DOMAIN=first-cup-coffee-co.myshopify.com \
 *   SHOPIFY_ADMIN_TOKEN=shpat_xxxx \
 *   node create-trigger-fuel.mjs [--dry-run]
 *
 * Not set here (do these in the admin): product images, inventory counts, and
 * confirming the price with Elijah. Inventory is left untracked so the draft can
 * be tested; turn tracking on before publishing.
 */

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN } = process.env;
const DRY_RUN = process.argv.includes("--dry-run");

const HANDLE = "trigger-fuel";
const PRICE = "19.50";
const WEIGHT_GRAMS = 463; // matches Brew Around & Find Out's 16 oz bag
const TEXTURES = ["Whole Bean", "Ground"];

const product = {
  title: "Trigger Fuel",
  handle: HANDLE,
  vendor: "First Cup Coffee Co",
  productType: "Coffee",
  // "16 oz bag" is the tag the other 1 lb coffees carry; it is what appears to put
  // them in the 1-lb-bag-subscription collection, which the subscription bundle uses.
  tags: ["16 oz bag", "label"],
  status: "DRAFT",
  templateSuffix: "trigger-fuel",
  productOptions: [{ name: "Texture", values: [{ name: TEXTURES[0] }] }],
};

const variantFields = {
  price: PRICE,
  inventoryItem: { tracked: false, measurement: { weight: { value: WEIGHT_GRAMS, unit: "GRAMS" } } },
};

if (DRY_RUN) {
  console.log(JSON.stringify({ product, variantFields, extraTextures: TEXTURES.slice(1) }, null, 2));
  process.exit(0);
}

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
  const json = await res.json();
  if (json.errors) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }
  return json.data;
}

function failOnUserErrors(label, errors) {
  if (errors?.length) {
    console.error(`${label} failed:`, JSON.stringify(errors, null, 2));
    process.exit(1);
  }
}

const existing = await gql(
  `query($handle: String!) { productByIdentifier(identifier: { handle: $handle }) { id title status } }`,
  { handle: HANDLE },
);
if (existing.productByIdentifier) {
  console.log("A product with handle", HANDLE, "already exists:", JSON.stringify(existing.productByIdentifier));
  process.exit(0);
}

// 1. Product with the first Texture value (Shopify makes one default variant).
const created = await gql(
  `mutation($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id handle variants(first: 1) { nodes { id } } }
      userErrors { field message }
    }
  }`,
  { product },
);
failOnUserErrors("productCreate", created.productCreate.userErrors);
const productId = created.productCreate.product.id;
const firstVariantId = created.productCreate.product.variants.nodes[0].id;

// 2. Price + weight on the default variant.
const updated = await gql(
  `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }`,
  { productId, variants: [{ id: firstVariantId, ...variantFields }] },
);
failOnUserErrors("productVariantsBulkUpdate", updated.productVariantsBulkUpdate.userErrors);

// 3. Remaining Texture values as extra variants.
const extra = TEXTURES.slice(1).map((name) => ({
  ...variantFields,
  optionValues: [{ optionName: "Texture", name }],
}));
if (extra.length) {
  const added = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    { productId, variants: extra },
  );
  failOnUserErrors("productVariantsBulkCreate", added.productVariantsBulkCreate.userErrors);
}

const numericId = productId.split("/").pop();
console.log("Created draft product:", productId);
console.log(`Edit it: https://${SHOPIFY_STORE_DOMAIN}/admin/products/${numericId}`);
console.log("Still to do in the admin: add images, set inventory, confirm the price, then publish.");
