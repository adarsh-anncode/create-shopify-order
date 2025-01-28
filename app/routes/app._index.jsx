import {
  Page,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  useLoaderData,
  useActionData,
  useSubmit,
  useNavigation,
} from "@remix-run/react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";

// Fetch data for customers and products from Shopify
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const fetchData = async (query) => {
    const response = await admin.graphql(query);
    return response.json();
  };

  try {
    const customerQuery = `query { customers(first: 20) { nodes { id } } }`;
    const productsQuery = `
      query {
        products(first: 50, query: "3/4") {
          nodes {
            id
            title
            handle
            vendor
            variants(first: 100) { nodes { id title sku } }
          }
        }
      }
    `;
    const [customerData, productsData] = await Promise.all([
      fetchData(customerQuery),
      fetchData(productsQuery),
    ]);

    return {
      customerData: customerData?.data?.customers?.nodes || [],
      productsData: productsData?.data?.products?.nodes || [],
    };
  } catch (error) {
    console.error("Data fetching error:", error);
    return { customerData: [], productsData: [] };
  }
};

// Generate bulk order creation payload
const generateBulkPayload = (customerData, productsData, orderCount) => {
  const randomIndex = (max) => Math.floor(Math.random() * max);

  const orders = [];
  for (let i = 0; i < orderCount; i++) {
    const randomCustomer = customerData[randomIndex(customerData.length)];
    const randomProduct1 = productsData[randomIndex(productsData.length)];
    const randomProduct2 = productsData[randomIndex(productsData.length)];
    const randomQuantity1 = randomIndex(10) + 1;
    const randomQuantity2 = randomIndex(10) + 1;

    orders.push({
      currency: "EUR",
      lineItems: [
        {
          productId: randomProduct1.id,
          variantId: randomProduct1.variants.nodes[0].id,
          sku: randomProduct1.variants.nodes[0].sku,
          vendor: randomProduct1.vendor,
          quantity: randomQuantity1,
        },
        {
          productId: randomProduct2.id,
          variantId: randomProduct2.variants.nodes[0].id,
          sku: randomProduct2.variants.nodes[0].sku,
          vendor: randomProduct2.vendor,
          quantity: randomQuantity2,
        },
      ],
      customer: {
        toAssociate: { id: randomCustomer.id },
      },
      financialStatus: "PAID",
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          amountSet: {
            shopMoney: { amount: "238.47", currencyCode: "EUR" },
          },
        },
      ],
    });
  }
  return orders;
};

// Action handler for bulk order creation
export const action = async ({ request }) => {
  console.log("Bulk order creation started");
  const { admin } = await authenticate.admin(request);
  const formData = new URLSearchParams(await request.formData());
  const data = JSON.parse(formData.get("data"));
  const { loaderData, orderCount } = data;

  if (!orderCount || orderCount <= 0) return [];

  const bulkOrders = generateBulkPayload(
    loaderData.customerData,
    loaderData.productsData,
    orderCount
  );
  try {
    const response = await admin.graphql(`
      mutation BulkOperationRunMutation($orders: [OrderCreateInput!]!) {
        bulkOperationRunMutation(
          mutation: """
          mutation CreateOrders($orders: [OrderCreateInput!]!) {
            ordersCreate(orders: $orders) {
              userErrors {
                field
                message
              }
            }
          }
          """,
          input: $orders
        ) {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        orders: bulkOrders, // Ensure `bulkOrders` matches Shopify's `OrderCreateInput` schema
      },
    });
    
    

    const { data } = await response.json();
    console.log("Bulk operation response:", data);

    if (data?.bulkOperationRunMutation?.bulkOperation?.status === "CREATED") {
      console.log("Bulk order creation initiated successfully.");
      return { success: true, bulkOperationId: data.bulkOperationRunMutation.bulkOperation.id };
    } else {
      console.warn("Bulk order creation failed.");
      return { success: false, errors: data?.bulkOperationRunMutation?.userErrors || [] };
    }
  } catch (error) {
    console.error("Bulk order creation error:", error?.GraphqlQueryError);
    return { success: false, error };
  }
};

// UI component for rendering the bulk order creation form
export default function OrderCreator() {
  const navigation = useNavigation();
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const [orderCount, setOrderCount] = useState("");

  const handleFormSubmit = () => {
    const postData = new FormData();
    const data = JSON.stringify({
      call_key: "bulk-create-order",
      loaderData: loaderData,
      orderCount: orderCount,
    });
    postData.append("data", data);
    submit(postData, { method: "post" });
  };

  useEffect(() => {
    if (actionData) {
      console.log("Action Data:", actionData);
    }
  }, [actionData]);

  return (
    <Page title="Bulk Order Creator Page">
      <BlockStack>
        <Card>
          {!(navigation.state === "loading") ? (
            <Box padding={400}>
              <TitleBar title="Bulk Order Creator" />
              <Text variant="headingMd">Generate multiple orders efficiently.</Text>

              <InlineStack gap={400}>
                <TextField
                  placeholder="Enter the number of orders to generate"
                  value={orderCount}
                  onChange={(value) => setOrderCount(value)}
                  name="orderCount"
                />
                <Button onClick={handleFormSubmit}>Generate Orders</Button>
              </InlineStack>
            </Box>
          ) : (
            <Card>Loading...</Card>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
