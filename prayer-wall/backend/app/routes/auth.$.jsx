import { authenticate } from "../shopify.server";

// Standard Shopify OAuth catch-all — handles /auth/login, /auth/callback, etc.
// You only need to visit this once, when installing the app on the First Cup store.
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};
