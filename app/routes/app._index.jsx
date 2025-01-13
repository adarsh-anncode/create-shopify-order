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

// Loader to fetch customer and product data from Shopify
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch customer data
  const customerResponse = await admin.graphql(`
    query {
      customers(first: 10) {
        nodes {
          id
        }
      }
    }
  `);

  // Fetch product data
  const productsResponse = await admin.graphql(`
    query {
      products(first: 10) {
          nodes {
            id
            title
            handle
            variants(first: 100) {
            nodes {
                id
            }
          }
        }
      }
    }
  `);

  // Parse and return data to be used by the component
  const customerData = await customerResponse.json();
  const productsData = await productsResponse.json();

  return {
    customerData: customerData?.data?.customers?.nodes || [],
    productsData: productsData?.data?.products?.nodes || [],
  };
};

// Action to create orders based on form input
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const dataString = formData.get("data");
  const data = JSON.parse(dataString);
  let responseJson = [];
  function randomNumberGenerator(max = 10) {
    return Math.floor(Math.random() * max);
  }

  async function generateRandomOrders(customerData, productsData) {
    const randomCustomer = customerData[randomNumberGenerator()];
    const randomProduct = productsData[randomNumberGenerator()];
    const randomQuantity = randomNumberGenerator(10) + 1;

    // Create order payload

    const response = await admin.graphql(
      `#graphql
        mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
          orderCreate(order: $order, options: $options) {
            userErrors {
              field
              message
            }
            order {
              id
              lineItems(first: 5) {
                nodes {
                  product {
                    id
                  }
                  quantity
                }
              }
              customer {
                id
              }
              transactions {
                kind
                status
                amountSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
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
                quantity: randomQuantity,
                priceSet: {
                  shopMoney: {
                    amount: "119.24",
                    currencyCode: "EUR",
                  },
                },
              },
            ],
            customer: {
              toAssociate: {
                id: randomCustomer.id,
              },
            },
            financialStatus: "PAID",
            transactions: [
              {
                kind: "SALE",
                status: "SUCCESS",
                amountSet: {
                  shopMoney: {
                    amount: "238.47",
                    currencyCode: "EUR",
                  },
                },
              },
            ],
          },
        },
      },
    );
    return await response.json();
  }
  switch (data.call_key) {
    case "create-order":
      // Create orders
      const { loaderData, orderCount } = data;
      const { customerData, productsData } = loaderData;
      // logics to generate random products/customers/quantity
      for (let i = 0; i < orderCount; i++) {
        setTimeout(async () => {
          const orderResponse = await generateRandomOrders(
            customerData,
            productsData,
          );
          console.log("Order Response", orderResponse?.data);
          responseJson.push("Order Response", orderResponse?.data);
        }, 30000);
      }

      break;
    default:
      break;
  }
  return responseJson;
};

// Main component to render the order creation form
export default function OrderCreator() {
  const loaderData = useLoaderData(); // Load data for customers and products
  const actionData = useActionData(); // Action data after form submission
  const navigation = useNavigation();
  const submit = useSubmit(); // Handle form submission
  const [orderCount, setOrderCount] = useState(""); // Track input value for order count

  // Log loader and action data for debugging
  useEffect(() => {
    if (actionData) {
      console.log("Action Data:", actionData); // Log the action response
    }
  }, [actionData]);

  // Handle form submission
  const handleFormSubmit = () => {
    const postData = new FormData();
    const data = JSON.stringify({
      call_key: "create-order",
      loaderData: loaderData,
      orderCount: orderCount, // Get order count from state
    });
    postData.append("data", data);
    submit(postData, { method: "post" });
    return;
  };

  return (
    <Page title="Order Creator">
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
                  onChange={(value) => setOrderCount(value)} // Update state on input change
                  name="orderCount" // Set form field name for submission
                />
                <Button onClick={handleFormSubmit}>Generate Button</Button>
              </InlineStack>
            </Box>
          ) : (
            <Card>Loading....</Card>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
