export async function getCustomerDisplayName(admin, customerId) {
  const response = await admin.graphql(
    `#graphql
    query CustomerName($id: ID!) {
      customer(id: $id) {
        displayName
      }
    }`,
    { variables: { id: customerId } },
  );
  const json = await response.json();
  return json.data?.customer?.displayName || "A member of our community";
}
