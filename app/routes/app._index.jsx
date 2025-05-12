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
        products(first: 50) {
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

// Generate a single order payload
const generateOrderPayload = (customerData, productsData) => {
  const randomIndex = (max) => Math.floor(Math.random() * max);

  const randomCustomer = customerData[randomIndex(customerData.length)];
  const randomProduct1 = productsData[randomIndex(productsData.length)];
  const randomProduct2 = productsData[randomIndex(productsData.length)];
  const randomQuantity1 = randomIndex(10) + 1;
  const randomQuantity2 = randomIndex(10) + 1;

  return {
    currency: "USD",
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
  };
};

// Action handler for sequential order creation
export const action = async ({ request }) => {
  console.log("Order creation started");
  const { admin } = await authenticate.admin(request);
  const formData = new URLSearchParams(await request.formData());
  const data = JSON.parse(formData.get("data"));
  const { loaderData, orderCount } = data;

  if (!orderCount || orderCount <= 0) return [];

  const results = [];
  const DELAY_MS = 1000; // Delay of 1 second between requests

  for (let i = 0; i < orderCount; i++) {
    try {
      const orderPayload = generateOrderPayload(
        loaderData.customerData,
        loaderData.productsData
      );

      const response = await admin.graphql(
        `
          mutation OrderCreate($input: OrderInput!) {
            orderCreate(input: $input) {
              order {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            input: orderPayload,
          },
        }
      );

      const { data } = await response.json();
      results.push(data?.orderCreate);

      console.log(`Order ${i + 1}/${orderCount} created successfully.`);

      // Add a delay between requests
      if (i < orderCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    } catch (error) {
      console.error(`Error creating order ${i + 1}:`, error);
      results.push({ error: error.message });
    }
  }

  return results;
};

// UI component for rendering the order creation form
export default function OrderCreator() {
  const navigation = useNavigation();
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const [orderCount, setOrderCount] = useState("");

  const handleFormSubmit = () => {
    const postData = new FormData();
    const data = JSON.stringify({
      call_key: "create-order",
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
    <Page title="Order Creator Page">
      <BlockStack>
        <Card>
          {!(navigation.state === "loading") ? (
            <Box padding={400}>
              <TitleBar title="Order Creator" />
              <Text variant="headingMd">Generate multiple orders.</Text>

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