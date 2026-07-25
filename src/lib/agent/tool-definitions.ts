import Anthropic from "@anthropic-ai/sdk";

export const agentToolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_inventory",
    description:
      "Search the product inventory using a customer's informal description. Returns matching products with name, price, and available stock. If multiple close matches are found, the agent should ask a clarifying question. Always call this first when a customer mentions a product.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "The customer's informal product description, e.g. 'the gold trim small boxes' or 'clear cupcake containers'",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "check_stock",
    description:
      "Check whether a specific quantity of a product is currently available in stock.",
    input_schema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "The UUID of the product to check",
        },
        quantity: {
          type: "number",
          description: "The quantity the customer wants to order",
        },
      },
      required: ["product_id", "quantity"],
    },
  },
  {
    name: "reserve_stock",
    description:
      "Atomically reserve (decrement) stock for a product. This is a single database operation that prevents overselling. Only call this after confirming the customer wants to order and stock is available.",
    input_schema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "The UUID of the product to reserve",
        },
        quantity: {
          type: "number",
          description: "The quantity to reserve",
        },
      },
      required: ["product_id", "quantity"],
    },
  },
  {
    name: "create_order",
    description:
      "Create a structured order record with line items. Call this after successfully reserving stock. Use status 'awaiting_address' if the customer hasn't provided a delivery address yet, 'confirmed' if they have.",
    input_schema: {
      type: "object",
      properties: {
        customer_phone: {
          type: "string",
          description: "The customer's WhatsApp phone number",
        },
        items: {
          type: "array",
          description: "The items in the order",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
            },
            required: ["product_id", "quantity", "unit_price"],
          },
        },
        status: {
          type: "string",
          enum: ["pending", "confirmed", "awaiting_address"],
          description: "Order status",
        },
        delivery_address: {
          type: "string",
          description: "Delivery address if provided by the customer",
        },
      },
      required: ["customer_phone", "items", "status"],
    },
  },
  {
    name: "request_delivery",
    description:
      "Log a Yango delivery request for a confirmed order with a delivery address. This is a mock — it records the request but does not call an external API.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The UUID of the order to dispatch",
        },
        notes: {
          type: "string",
          description: "Optional notes for the delivery driver",
        },
      },
      required: ["order_id"],
    },
  },
];
