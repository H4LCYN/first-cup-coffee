# `prayer_request` Metaobject — Setup Spec

Merchant-owned metaobject (created via Admin GraphQL, editable afterward in Shopify Admin → Content → Entries, plain form UI, no JSON).

## Fields

| Key | Type | Notes |
|---|---|---|
| `request_text` | `multi_line_text_field` | Required. The prayer request itself. |
| `display_name` | `single_line_text_field` | Optional. Blank when `is_anonymous` is true. |
| `is_anonymous` | `boolean` | Default `false`. |
| `customer_id` | `single_line_text_field` | Hidden/internal. Stores the Shopify customer GID. Drives ownership checks (inline controls, delete, praise-report updates) — set once at submission, never edited by the moderator. |
| `status` | `single_line_text_field` with `choices` validation: `pending`, `active`, `expired`, `deleted` | The moderator only ever touches this to flip `pending` → `active`. `expired`/`deleted` are set by the backend, not hand-edited. |
| `submitted_at` | `date_time` | Set at submission. Drives the 24h cooldown check. |
| `posted_at` | `date_time` | Set when status flips to `active`. Drives the 15-day expiry (not `submitted_at`). |
| `praying_names` | `list.single_line_text_field` | Display names shown privately to the poster. |
| `praying_customer_ids` | `list.single_line_text_field` | Hidden/internal. Parallel list to `praying_names`, used for dedup + un-pray toggle. |
| `praise_report` | `multi_line_text_field` | Public once approved. Presence of non-empty text = "Answered" for filtering. |
| `pending_praise_report` | `multi_line_text_field` | Hidden/internal staging field for an unapproved update; moderator copies into `praise_report` to publish. |

## One-time setup mutation

Run once against the store (via Shopify CLI `admin` context, GraphiQL in a custom/dev app, or a setup script in the Remix app's install flow):

```graphql
mutation CreatePrayerRequestDefinition {
  metaobjectDefinitionCreate(definition: {
    type: "prayer_request"
    name: "Prayer Request"
    displayNameKey: "request_text"
    access: { admin: MERCHANT_READ_WRITE, storefront: PUBLIC_READ }
    fieldDefinitions: [
      { key: "request_text", name: "Request Text", type: "multi_line_text_field", required: true }
      { key: "display_name", name: "Display Name", type: "single_line_text_field" }
      { key: "is_anonymous", name: "Anonymous", type: "boolean" }
      { key: "customer_id", name: "Customer ID", type: "single_line_text_field" }
      { key: "status", name: "Status", type: "single_line_text_field",
        validations: [{ name: "choices", value: "[\"pending\",\"active\",\"expired\",\"deleted\"]" }] }
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
```

`access.storefront: PUBLIC_READ` lets the theme read entries directly via Liquid's `metaobjects` object without needing the Storefront API — all writes still go through the app-proxy backend, which uses the Admin API (customer never has direct write access, by design).

## What the moderator actually does day to day

1. Open the email link (goes straight to the entry in Admin → Content → Entries → Prayer Request).
2. New post: read `request_text`, fix typos if needed, change `status` from `pending` to `active` (this auto-sets `posted_at` via the backend when it detects the flip — or the backend sets it directly when it processes the save, depending on final implementation).
3. Update: read `pending_praise_report`, copy into `praise_report` if it's fine, clear `pending_praise_report`.

No JSON, no GraphQL, no customer lookups — every field the moderator touches is a plain text box, checkbox, or dropdown.
