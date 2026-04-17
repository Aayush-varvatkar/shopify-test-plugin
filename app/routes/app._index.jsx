import { useState, useMemo, useCallback } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AppProvider,
  Page,
  Box,
  BlockStack,
  InlineStack,
  Popover,
  Button,
  DatePicker,
  ActionList,
  Text,
  Divider,
  Select,
} from '@shopify/polaris';
import { CalendarIcon, FilterIcon } from '@shopify/polaris-icons';
import '@shopify/polaris/build/esm/styles.css';
import enTranslations from '@shopify/polaris/locales/en.json';

// Mock function to simulate fetching tracking info
async function fetchCourierDeliveryStatus(trackingNumber, company) {
  const mockApiResponses = [
    { delivery: { status: 'DELIVERED' } },
    { delivery: { status: 'In Transit' } },
    { delivery: { status: 'Out For Delivery' } },
    { delivery: { status: 'RTO_Initiated' } },
    { delivery: { status: 'Pending' } }
  ];
  
  const index = trackingNumber ? trackingNumber.charCodeAt(trackingNumber.length - 1) % mockApiResponses.length : 1;
  const rawStatus = mockApiResponses[index].delivery?.status || '';
  
  let normalizedStatus = 'unknown';
  const statusLower = rawStatus.toLowerCase();
  
  if (statusLower.includes('delivered')) normalizedStatus = 'delivered';
  else if (statusLower.includes('transit') || statusLower.includes('pending')) normalizedStatus = 'in_transit';
  else if (statusLower.includes('out') && statusLower.includes('delivery')) normalizedStatus = 'out_for_delivery';
  else if (statusLower.includes('rto') || statusLower.includes('return')) normalizedStatus = 'rto_failed';

  return { rawStatus, normalizedStatus };
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`
    #graphql
    query getOrdersWithTrackingForAnalytics {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
              }
            }
            lineItems(first: 10) {
              edges {
                node {
                  title
                  product {
                    id
                    productType
                  }
                }
              }
            }
            fulfillments {
              id
              status
              trackingInfo {
                number
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

  const enhancedOrders = await Promise.all(rawOrders.map(async (order) => {
    let orderDeliveryStatus = 'unknown';
    
    if (order.fulfillments && order.fulfillments.length > 0) {
      const enrichedFulfillments = await Promise.all(order.fulfillments.map(async (fulfillment) => {
        let trackingInfo = fulfillment.trackingInfo;
        if (trackingInfo && trackingInfo.length > 0) {
            trackingInfo = await Promise.all(trackingInfo.map(async (tracking) => {
              if (tracking.number) {
                const { normalizedStatus } = await fetchCourierDeliveryStatus(tracking.number, tracking.company);
                orderDeliveryStatus = normalizedStatus;
                return { ...tracking, courierDeliveryStatus: normalizedStatus };
              }
              return { ...tracking, courierDeliveryStatus: 'unknown' };
            }));
        }
        return { ...fulfillment, trackingInfo };
      }));
      return { ...order, fulfillments: enrichedFulfillments, orderDeliveryStatus };
    }
    return { ...order, orderDeliveryStatus };
  }));

  return enhancedOrders;
};

export default function Index() {
  const orders = useLoaderData() || [];
  
  // Date Picker State
  const [datePopoverActive, setDatePopoverActive] = useState(false);
  const toggleDatePopover = useCallback(() => setDatePopoverActive((active) => !active), []);
  
  const [selectedDates, setSelectedDates] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)),
    end: new Date(),
  });
  
  const [{ month, year }, setDate] = useState({
    month: selectedDates.end.getMonth(),
    year: selectedDates.end.getFullYear(),
  });

  const [presetFilter, setPresetFilter] = useState('last30');

  const presetOptions = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 days', value: 'last7' },
    { label: 'Last 30 days', value: 'last30' },
    { label: 'Last 90 days', value: 'last90' },
    { label: 'Last month', value: 'lastMonth' },
    { label: 'Custom', value: 'custom' },
  ];

  const handlePresetChange = useCallback((value) => {
    setPresetFilter(value);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let start, end;
    switch(value) {
      case 'today':
        start = today;
        end = today;
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(today);
        end.setDate(today.getDate() - 1);
        break;
      case 'last7':
        start = new Date(today);
        start.setDate(today.getDate() - 6);
        end = today;
        break;
      case 'last30':
        start = new Date(today);
        start.setDate(today.getDate() - 29);
        end = today;
        break;
      case 'last90':
        start = new Date(today);
        start.setDate(today.getDate() - 89);
        end = today;
        break;
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'custom':
        return;
      default:
        return;
    }
    
    setSelectedDates({ start, end });
    setDate({ month: end.getMonth(), year: end.getFullYear() });
  }, []);

  // Product Filter State
  const [productPopoverActive, setProductPopoverActive] = useState(false);
  const toggleProductPopover = useCallback(() => setProductPopoverActive((active) => !active), []);
  const [productFilter, setProductFilter] = useState("All Product Types");

  // Extract unique product titles
  const uniqueProducts = useMemo(() => {
    const titles = new Set();
    orders.forEach(order => {
      order.lineItems?.edges?.forEach(item => {
        const title = item.node.title;
        if (title && title.trim() !== '') {
          titles.add(title.trim());
        }
      });
    });
    return Array.from(titles).sort();
  }, [orders]);
  
  // Filter logic
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Date Filter
      const orderDate = new Date(order.createdAt);
      if (selectedDates && selectedDates.start && selectedDates.end) {
        const start = new Date(selectedDates.start);
        start.setHours(0,0,0,0);
        const end = new Date(selectedDates.end);
        end.setHours(23,59,59,999);
        
        if (orderDate < start || orderDate > end) {
          return false;
        }
      }
      
      // 2. Product Filter
      if (productFilter && productFilter !== "All Product Types") {
        const hasProduct = order.lineItems?.edges?.some(
          item => item.node.title?.trim() === productFilter
        );
        if (!hasProduct) return false;
      }
      
      return true;
    });
  }, [orders, selectedDates, productFilter]);

  // Compute Metrics
  const metrics = useMemo(() => {
    let sales = 0;
    let delivered = 0;
    let failed = 0;
    let pending = 0;

    filteredOrders.forEach(order => {
      sales += parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);
      
      if (order.orderDeliveryStatus === 'delivered') delivered++;
      else if (order.orderDeliveryStatus === 'rto_failed') failed++;
      else if (order.orderDeliveryStatus === 'in_transit' || order.orderDeliveryStatus === 'out_for_delivery') pending++;
    });

    return {
      totalOrders: filteredOrders.length,
      totalSales: sales.toFixed(2),
      delivered,
      failed,
      pending
    };
  }, [filteredOrders]);

  const handleDateSelection = useCallback(
    (value) => {
      setSelectedDates(value);
      setPresetFilter('custom');
    },
    [],
  );

  const formatDateForComparison = (start, end) => {
    const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  const formatDateForInput = (date) => {
    return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
  };

  const dateButton = (
    <Button onClick={toggleDatePopover} icon={CalendarIcon}>
      {presetOptions.find(o => o.value === presetFilter)?.label || 'Custom'}
    </Button>
  );
  
  const productActivator = (
    <Button onClick={toggleProductPopover} icon={FilterIcon}>
      {productFilter}
    </Button>
  );
  
  const productOptions = [
    { content: "All Product Types", onAction: () => { setProductFilter("All Product Types"); toggleProductPopover(); } },
    ...uniqueProducts.map(fp => ({
      content: fp,
      onAction: () => { setProductFilter(fp); toggleProductPopover(); }
    }))
  ];

  const styles = {
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginTop: "32px", marginBottom: "32px" },
    card: { 
      backgroundColor: "#ffffff", padding: "24px", borderRadius: "12px", 
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)", 
      border: "1px solid #f0f0f0", transition: "transform 0.2s ease, box-shadow 0.2s ease",
      display: "flex", flexDirection: "column", gap: "8px"
    },
    cardTitle: { fontSize: "14px", fontWeight: "500", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 },
    cardValue: { fontSize: "32px", fontWeight: "700", color: "#1a1a1a", margin: 0 },
    section: { backgroundColor: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 2px 4px rgba(0,0,0,0.04)", border: "1px solid #f0f0f0" },
    sectionTitle: { fontSize: "18px", fontWeight: "600", marginBottom: "16px", color: "#1a1a1a" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "12px", borderBottom: "2px solid #eee", color: "#666", fontSize: "14px", fontWeight: "600" },
    td: { padding: "12px", borderBottom: "1px solid #eee", fontSize: "14px", color: "#333" },
    empty: { textAlign: "center", padding: "40px", color: "#888", fontStyle: "italic" }
  };

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Dashboard">
        <BlockStack gap="400">
           <InlineStack gap="400" blockAlign="center">
             {/* Date Picker Popover */}
             <Popover
               active={datePopoverActive}
               activator={dateButton}
               autofocusTarget="none"
               onClose={toggleDatePopover}
               fluidContent
             >
               <Box padding="400" minWidth="650px">
                 <BlockStack gap="400">
                   <div style={{ marginBottom: "4px" }}>
                     <Select
                       options={presetOptions}
                       value={presetFilter}
                       onChange={handlePresetChange}
                       label="Date range"
                     />
                   </div>
                   <div style={{ display: 'flex', gap: '12px' }}>
                     <div style={{ flex: 1 }}>
                       <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a1a', marginBottom: '6px' }}>Starting</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #c9cccf', borderRadius: '8px', padding: '8px 12px', background: '#fff' }}>
                         <svg width="14" height="14" viewBox="0 0 20 20" fill="#5c5f62"><path d="M7 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-2 0v1H8V3a1 1 0 0 0-1-1ZM4 8h12v9H4V8Z"/></svg>
                         <span style={{ fontSize: '14px', color: '#1a1a1a' }}>{formatDateForInput(selectedDates.start)}</span>
                       </div>
                     </div>
                     <div style={{ flex: 1 }}>
                       <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a1a', marginBottom: '6px' }}>Ending</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #c9cccf', borderRadius: '8px', padding: '8px 12px', background: '#fff' }}>
                         <svg width="14" height="14" viewBox="0 0 20 20" fill="#5c5f62"><path d="M7 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-2 0v1H8V3a1 1 0 0 0-1-1ZM4 8h12v9H4V8Z"/></svg>
                         <span style={{ fontSize: '14px', color: '#1a1a1a' }}>{formatDateForInput(selectedDates.end)}</span>
                       </div>
                     </div>
                   </div>
                   <DatePicker
                     month={month}
                     year={year}
                     onChange={handleDateSelection}
                     onMonthChange={(month, year) => setDate({ month, year })}
                     selected={selectedDates}
                     multiMonth
                     allowRange
                   />
                   <Divider />
                   <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                     <Button onClick={toggleDatePopover}>Cancel</Button>
                     <Button onClick={toggleDatePopover} variant="primary" tone="success">Apply</Button>
                   </div>
                 </BlockStack>
               </Box>
             </Popover>

             <Text as="span" tone="subdued">Compared to {formatDateForComparison(selectedDates.start, selectedDates.end)}</Text>

             <Popover
               active={productPopoverActive}
               activator={productActivator}
               onClose={toggleProductPopover}
             >
               <div style={{minWidth: "200px"}}>
                 <ActionList items={productOptions} />
               </div>
             </Popover>
           </InlineStack>

           <div style={styles.grid}>
              <div style={{...styles.card, borderLeft: "4px solid #005bd3"}}>
                <h3 style={styles.cardTitle}>Total Orders</h3>
                <p style={styles.cardValue}>{metrics.totalOrders}</p>
              </div>
              <div style={{...styles.card, borderLeft: "4px solid #008060"}}>
                <h3 style={styles.cardTitle}>Total Sales</h3>
                <p style={styles.cardValue}>${metrics.totalSales}</p>
              </div>
              <div style={{...styles.card, borderLeft: "4px solid #10b981"}}>
                <h3 style={styles.cardTitle}>Delivered</h3>
                <p style={styles.cardValue}>{metrics.delivered}</p>
              </div>
              <div style={{...styles.card, borderLeft: "4px solid #f59e0b"}}>
                <h3 style={styles.cardTitle}>Pending / In-Transit</h3>
                <p style={styles.cardValue}>{metrics.pending}</p>
              </div>
              <div style={{...styles.card, borderLeft: "4px solid #ef4444"}}>
                <h3 style={styles.cardTitle}>Failed / RTO</h3>
                <p style={styles.cardValue}>{metrics.failed}</p>
              </div>
           </div>

           <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Recent Activity</h2>
              {filteredOrders.length > 0 ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Order</th>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Products</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Delivery Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.slice(0, 10).map(order => {
                      let statusColor = "#666";
                      let statusBg = "#f5f5f5";
                      
                      if (order.orderDeliveryStatus === 'delivered') { statusColor = "#065f46"; statusBg = "#d1fae5"; }
                      if (order.orderDeliveryStatus === 'in_transit' || order.orderDeliveryStatus === 'out_for_delivery') { statusColor = "#92400e"; statusBg = "#fef3c7"; }
                      if (order.orderDeliveryStatus === 'rto_failed') { statusColor = "#991b1b"; statusBg = "#fee2e2"; }

                      return (
                        <tr key={order.id}>
                          <td style={{...styles.td, fontWeight: "500"}}>{order.name}</td>
                          <td style={styles.td}>{new Date(order.createdAt).toLocaleDateString()}</td>
                          <td style={styles.td}>
                            {order.lineItems?.edges?.map(e => e.node.title).join(", ") || "N/A"}
                          </td>
                          <td style={styles.td}>${order.totalPriceSet?.shopMoney?.amount || "0.00"}</td>
                          <td style={styles.td}>
                            <span style={{
                              padding: "4px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "600",
                              color: statusColor, backgroundColor: statusBg, textTransform: "capitalize"
                            }}>
                              {(order.orderDeliveryStatus || "Pending").replace(/_/g, " ")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={styles.empty}>
                  No orders match the selected filters.
                </div>
              )}
           </div>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
