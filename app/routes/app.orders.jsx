import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

// Mock function to simulate fetching tracking info from a Courier API
async function fetchCourierDeliveryStatus(trackingNumber, company) {
  // In a real application, you would make an API call to the courier service here:
  // const response = await fetch(`https://api.courier.example.com/v1/track?number=${trackingNumber}`);
  // const data = await response.json();
  
  // Here we'll mock an API response for demonstration purposes
  const mockApiResponses = [
    { delivery: { status: 'DELIVERED' } },
    { delivery: { status: 'In Transit' } },
    { delivery: { status: 'Out For Delivery' } },
    { delivery: { status: 'RTO_Initiated' } },
    { delivery: { status: 'Pending' } }
  ];
  
  // Use tracking number to deterministically pick a mock response, or default to second one
  const index = trackingNumber ? trackingNumber.charCodeAt(trackingNumber.length - 1) % mockApiResponses.length : 1;
  const mockApiResponse = mockApiResponses[index];
  
  const rawStatus = mockApiResponse.delivery?.status || '';
  
  // Normalize the status
  let normalizedStatus = 'unknown';
  const statusLower = rawStatus.toLowerCase();
  
  if (statusLower.includes('delivered')) {
    normalizedStatus = 'delivered';
  } else if (statusLower.includes('transit') || statusLower.includes('pending')) {
    normalizedStatus = 'in_transit';
  } else if (statusLower.includes('out') && statusLower.includes('delivery')) {
    normalizedStatus = 'out_for_delivery';
  } else if (statusLower.includes('rto') || statusLower.includes('return')) {
    normalizedStatus = 'RTO';
  }

  return { rawStatus, normalizedStatus };
}

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
  const rawOrders = responseJson.data.orders.edges.map((edge) => edge.node);

  // Enrich the orders with Courier API delivery statuses
  const enhancedOrders = await Promise.all(rawOrders.map(async (order) => {
    if (order.fulfillments && order.fulfillments.length > 0) {
      const enrichedFulfillments = await Promise.all(order.fulfillments.map(async (fulfillment) => {
        let enhancedTrackingInfo = fulfillment.trackingInfo;
        
        if (fulfillment.trackingInfo) {
          enhancedTrackingInfo = await Promise.all(fulfillment.trackingInfo.map(async (tracking) => {
            if (tracking.number) {
              const { normalizedStatus } = await fetchCourierDeliveryStatus(tracking.number, tracking.company);
              return { ...tracking, courierDeliveryStatus: normalizedStatus };
            }
            return { ...tracking, courierDeliveryStatus: 'unknown' };
          }));
        }
        
        return { ...fulfillment, trackingInfo: enhancedTrackingInfo };
      }));
      return { ...order, fulfillments: enrichedFulfillments };
    }
    return order;
  }));

  return enhancedOrders;
};

export default function Orders() {
  const orders = useLoaderData();

  // Helper function to render a visually distinct status badge
  const renderDeliveryStatus = (status) => {
    let color = "gray"; // default/unknown
    if (status === "delivered") color = "green";
    if (status === "in_transit") color = "blue";
    if (status === "out_for_delivery") color = "orange";
    if (status === "RTO") color = "red";

    return (
      <span style={{ 
        display: "inline-block",
        padding: "2px 8px", 
        borderRadius: "12px", 
        backgroundColor: color, 
        color: "white", 
        fontSize: "0.85em",
        fontWeight: "bold",
        textTransform: "capitalize"
      }}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

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
                              <s-box key={idx} padding="base" background="surface" borderRadius="base" style={{ marginTop: "0.5rem", border: "1px solid #ccc" }}>
                                <p>
                                  {tracking.company && <strong>{tracking.company}: </strong>}
                                  {tracking.url ? (
                                    <s-link href={tracking.url} target="_blank">{tracking.number || "Track Shipment"}</s-link>
                                  ) : (
                                    <span>{tracking.number || "No tracking number"}</span>
                                  )}
                                </p>
                                <p style={{ marginTop: "0.25rem" }}>
                                  <strong>Courier Delivery Status: </strong>
                                  {renderDeliveryStatus(tracking.courierDeliveryStatus)}
                                </p>
                              </s-box>
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
