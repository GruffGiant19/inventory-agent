import OpenAI from "openai";

export const agentToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_inventory",
      description:
        "Search the product inventory using a customer's informal description. Returns matching products with name, price, and available stock. If multiple close matches are found, ask a clarifying question. Always call this first when a customer mentions a product.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "The customer's informal product description",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_stock",
      description: "Check whether a specific quantity of a product is currently available.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["product_id", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reserve_stock",
      description:
        "Atomically reserve (decrement) stock for a product. Prevents overselling. Only call after confirming the customer wants to order and stock is available.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["product_id", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description:
        "Create a structured order with line items, after successfully reserving stock. Use status 'awaiting_address' if no delivery address yet, 'confirmed' if provided in the same message.",
      parameters: {
        type: "object",
        properties: {
          customer_phone: { type: "string" },
          items: {
            type: "array",
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
          status: { type: "string", enum: ["pending", "confirmed", "awaiting_address"] },
          delivery_address: { type: "string" },
        },
        required: ["customer_phone", "items", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "provide_delivery_address",
      description:
        "Call this when the customer is supplying a delivery address for an order that's already awaiting one — not when placing a new order.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          delivery_address: { type: "string" },
        },
        required: ["order_id", "delivery_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_delivery",
      description:
        "Log a Yango delivery request for a confirmed order with a delivery address. Mock — records the request, no external API call.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          notes: { type: "string" },
        },
        required: ["order_id"],
      },
    },
  },
];