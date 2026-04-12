import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`
    #graphql
    query getOrdersWithTracking {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            customer {
              firstName
              lastName
            }
            displayFinancialStatus
            displayFulfillmentStatus
            fulfillments {
              id
              status
              displayStatus
              trackingInfo {
                number
                url
                company
              }
            }
          }
        }
      }
    }
  `);

  const responseJson = await response.json();
  return responseJson.data.orders.edges.map((edge) => edge.node);
};

export default function Orders() {
  const orders = useLoaderData();

  return (
    <s-page heading="Orders & Tracking">
      {orders.length === 0 ? (
        <s-section heading="No Orders Found">
          <s-paragraph>There are no orders in the store yet.</s-paragraph>
        </s-section>
      ) : (
        <s-stack direction="block" gap="large">
          {orders.map((order) => {
            const customerName = order.customer
              ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
              : "No Customer";

            return (
              <s-section key={order.id} heading={`${order.name} - ${customerName}`}>
                <s-stack direction="block" gap="base">
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <p><strong>Created At:</strong> {new Date(order.createdAt).toLocaleString()}</p>
                    <p><strong>Financial Status:</strong> {order.displayFinancialStatus || "N/A"}</p>
                    <p><strong>Fulfillment Status:</strong> {order.displayFulfillmentStatus || "UNFULFILLED"}</p>

                    {order.fulfillments && order.fulfillments.length > 0 && (
                      <div style={{ marginTop: "1rem" }}>
                        <strong>Fulfillments & Tracking:</strong>
                        {order.fulfillments.map((fulfillment) => (
                          <div key={fulfillment.id} style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
                            <p><strong>Status:</strong> {fulfillment.displayStatus || fulfillment.status}</p>
                            {fulfillment.trackingInfo && fulfillment.trackingInfo.map((tracking, idx) => (
                              <p key={idx}>
                                {tracking.company && <span>{tracking.company}: </span>}
                                {tracking.url ? (
                                  <s-link href={tracking.url} target="_blank">{tracking.number || "Track Shipment"}</s-link>
                                ) : (
                                  <span>{tracking.number || "No tracking number"}</span>
                                )}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </s-box>
                </s-stack>
              </s-section>
            );
          })}
        </s-stack>
      )}
    </s-page>
  );
}
