import { authenticate } from "../shopify.server";
import db from "../db.server";

// Required webhook — cleans up the stored session if the app is ever uninstalled.
export const action = async ({ request }) => {
  const { shop, session } = await authenticate.webhook(request);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
