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
    const customerQuery = `query { customers(first: 10) { nodes { id } } }`;
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
  const randomProduct = productsData[randomIndex(productsData.length)];
  const randomProducts = productsData[randomIndex(productsData.length)];
  const randomQuantity = randomIndex(10) + 1;
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
            lineItems: [
              {
                productId: randomProduct.id,
                variantId: randomProduct.variants.nodes[0].id,
                sku: randomProduct.variants.nodes[0].sku,
                vendor: randomProduct?.vendor,
                quantity: randomQuantity,
                priceSet: {
                  shopMoney: { amount: "119.24", currencyCode: "EUR" },
                },
              },
              {
                productId: randomProducts.id,
                variantId: randomProducts.variants.nodes[0].id,
                sku: randomProducts.variants.nodes[0].sku,
                vendor: randomProducts?.vendor,
                quantity: randomQuantity,
                priceSet: {
                  shopMoney: { amount: "119.24", currencyCode: "EUR" },
                },
              },
            ],
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
    return response.json();
  } catch (error) {
    if (error) {
      console.warn("Rate limit hit. Retrying after delay...");
      await delay(60000); // Wait 1 minute before retrying
      return generateRandomOrders(admin, customerData, productsData); // Retry
    }
    console.error("Order creation error:", error);
    return null;
  }
};
// export const action = async ({ request }) => {
//     const { admin } = await authenticate.admin(request);
//     const formData = new URLSearchParams(await request.formData());
//     const data = JSON.parse(formData.get("data"));
//     const { loaderData, orderCount } = data;

//     if (!orderCount || orderCount <= 0) return [];

//     const responseJson = [];

//     // Create a delay function that returns a promise
//     const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//     // Loop through the order count and create orders with delay
//     for (let i = 0; i < orderCount; i++) {
//       // Delay by 30 seconds for each iteration
//       await delay(i * 200); // Delay increases by 30 seconds per iteration

//       const orderResponse = await generateRandomOrders(
//         admin,
//         loaderData.customerData,
//         loaderData.productsData
//       );

//       if (orderResponse) {
//         console.log("Order Response", orderResponse?.data);
//         responseJson.push(orderResponse?.data);
//       }
//     }

//     return responseJson;
//   };

// Main component for rendering order creation UI

// export const action = async ({ request }) => {
//   console.log("order creation");
//   const { admin } = await authenticate.admin(request);
//   const formData = new URLSearchParams(await request.formData());
//   const data = JSON.parse(formData.get("data"));
//   const { loaderData, orderCount } = data;

//   if (!orderCount || orderCount <= 0) return [];

//   const responseJson = [];

//   // Create a delay function that returns a promise
//   const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//   // Loop through the order count and create orders with delay
//   for (let i = 0; i < orderCount; i++) {
//     // Delay by 30 seconds for each iteration
//     await delay(8000); // Delay increases by 30 seconds per iteration

//     const orderResponse = await generateRandomOrders(
//       admin,
//       loaderData.customerData,
//       loaderData.productsData,
//     );

//     if (orderResponse) {
//       console.log("Order Response", orderResponse?.data);
//       responseJson.push(orderResponse?.data);
//     }
//   }

//   return responseJson;
// };

export const action = async ({ request }) => {
  console.log("Order creation started");
  const { admin } = await authenticate.admin(request);
  const formData = new URLSearchParams(await request.formData());
  const data = JSON.parse(formData.get("data"));
  const { loaderData, orderCount } = data;

  if (!orderCount || orderCount <= 0) return [];

  const responseJson = [];
  const BATCH_SIZE = 5; // Number of orders to process in a single batch
  const DELAY_MS = 10000; // Delay of 10 seconds between batches

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
