// This app has no admin UI. Moderation happens directly in Shopify Admin → Content → Entries.
// The only user-facing surface is the storefront app proxy at /apps/prayer-wall.
// We intentionally skip authenticate.admin() here — this install uses Shopify managed install
// which blocks the OAuth code flow; the proxy route uses authenticate.public.appProxy() instead.
export const loader = async () => {
  return new Response(
    `<!doctype html>
    <html>
      <body style="font-family: sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5;">
        <h1>First Cup Prayer Wall</h1>
        <p>The app is installed and connected. There's nothing to configure here —
        review and publish prayer requests directly in <strong>Shopify Admin &rarr; Content &rarr; Entries &rarr; Prayer Request</strong>.
        This app just handles the storefront actions (submitting, praying, deleting, and staging praise-report updates)
        that Shopify can't do natively.</p>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } },
  );
};
