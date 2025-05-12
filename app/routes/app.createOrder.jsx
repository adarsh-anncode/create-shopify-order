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

// Generate random orders
const generateRandomOrders = async (admin, customerData, productsData) => {
  const randomIndex = (max) => Math.floor(Math.random() * max);
  const randomCustomer = customerData[randomIndex(customerData.length)];
  const randomQuantity = randomIndex(10) + 1;

  // Create 18 random lineItems
  const lineItems = Array.from({ length: 18 }, () => {
    const randomProduct = productsData[randomIndex(productsData.length)];
    return {
      productId: randomProduct.id,
      variantId: randomProduct.variants.nodes[0].id,
      sku: randomProduct.variants.nodes[0].sku,
      vendor: randomProduct?.vendor,
      quantity: randomQuantity,
      priceSet: {
        shopMoney: { amount: "119.24", currencyCode: "EUR" },
      },
    };
  });
  // console.log("lineItems: ", lineItems);

  // Create a delay function that returns a promise
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const response = await admin.graphql(
      `
        mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
          orderCreate(order: $order, options: $options) {
            userErrors { field message }
            order {
              id
              lineItems(first: 5) { nodes { product { id } quantity } }
              customer { id }
              transactions {
                kind status amountSet { shopMoney { amount currencyCode } }
              }
            }
          }
        }`,
      {
        variables: {
          order: {
            currency: "EUR",
            lineItems: lineItems,
            customer: { toAssociate: { id: randomCustomer.id } },
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
          },
        },
      },
    );
    const { data, extensions } = await response.json();
    console.log("data: ", data?.orderCreate?.userErrors);
    // Check for order creation success
    if (!data?.orderCreate?.order) {
      console.warn("Order creation failed. Retrying after delay...");
      await delay(10000); // Wait 10 seconds before retrying
      return generateRandomOrders(admin, customerData, productsData); // Retry
    }
    return { data, extensions };
  } catch (error) {
    if (false) {
      console.warn("Rate limit hit. Retrying after delay...");
      await delay(60000); // Wait 1 minutes before retrying
      return generateRandomOrders(admin, customerData, productsData); // Retry
    }
    console.error("Order creation error:", error.message);
    return error;
  }
};
export const action = async ({ request }) => {
  console.log("Order creation started");
  const { admin } = await authenticate.admin(request);
  const formData = new URLSearchParams(await request.formData());
  const data = JSON.parse(formData.get("data"));
  const { loaderData, orderCount } = data;

  if (!orderCount || orderCount <= 0) return [];

  const responseJson = [];
  const BATCH_SIZE = 1; // Number of orders to process in a single batch
  const DELAY_MS = 1000; // Delay of 1 seconds between batches

  // Create a delay function
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Chunk the total orders into batches of BATCH_SIZE
  const chunks = Math.ceil(orderCount / BATCH_SIZE);

  for (let i = 0; i < chunks; i++) {
    // Create a batch of orders
    const promises = [];
    for (let j = 0; j < BATCH_SIZE; j++) {
      const orderIndex = i * BATCH_SIZE + j;
      if (orderIndex >= orderCount) break;

      promises.push(
        generateRandomOrders(
          admin,
          loaderData.customerData,
          loaderData.productsData,
        ),
      );
    }

    // Await completion of the current batch
    const batchResults = await Promise.all(promises);
    console.log("batchResults: ", batchResults);
    responseJson.push(...batchResults);

    console.log(`Batch ${i + 1}/${chunks} completed.`);

    // Add a delay after each batch except the last one
    if (i < chunks - 1) {
      console.log(
        `Waiting for ${DELAY_MS / 1000} seconds before next batch...`,
      );
      await delay(DELAY_MS);
    }
  }

  return responseJson;
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
              <Text variant="headingMd">Generate a number of orders.</Text>

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
