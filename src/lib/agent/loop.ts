import Anthropic from "@anthropic-ai/sdk";
import { agentToolDefinitions } from "./tool-definitions";
import {
  searchInventory,
  checkStock,
  reserveStock,
  createOrder,
  requestDelivery,
  logConversation,
  getConversationHistory,
  findOpenOrder,
  updateOrderAddress,
} from "./tools";

const anthropic = new Anthropic({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const OWNER_ID = process.env.SUPABASE_OWNER_ID ?? "";

const SYSTEM_PROMPT = `You are an AI order-taking agent for a small packaging import business that sells food and cake packaging goods (boxes, containers, trays, cups, etc.) via WhatsApp.

Your job is to:
1. Understand what product(s) the customer wants and in what quantity.
2. Search the inventory to find matching products.
3. If multiple close matches exist, ask a single clear clarifying question before proceeding.
4. Check and atomically reserve stock to prevent overselling.
5. Create a structured order and reply with a clear confirmation (product name, quantity, unit price, total).
6. If the customer hasn't provided a delivery address, ask for it after confirming the order.
7. Once an address is given, log the delivery request.

Rules:
- Be warm, concise, and professional. This is a WhatsApp conversation.
- Never guess or fabricate availability — always check stock first.
- Never reserve stock twice for the same item in one conversation turn.
- If an item is out of stock, say so honestly and offer to notify when restocked.
- Currency is GHS (Ghana Cedis). Format prices as e.g. "GHS 12.50".
- Always confirm the exact product name, not just the customer's informal description.
- If the customer is providing a delivery address for a previous order, update that order.`;

type ConversationMessage = {
  role: "customer" | "assistant";
  content: string;
};

/**
 * Dispatch a tool call to the appropriate tool function.
 */
async function dispatchTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  customerPhone: string,
  ownerId: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "search_inventory": {
        const result = await searchInventory(toolInput.description as string);
        if (result.products.length === 0) {
          return JSON.stringify({
            found: false,
            message: "No matching products found in inventory.",
          });
        }
        return JSON.stringify({
          found: true,
          products: result.products.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            tags: p.tags,
            price: p.price,
            quantity_available: p.quantity_available,
          })),
        });
      }

      case "check_stock": {
        const result = await checkStock(
          toolInput.product_id as string,
          toolInput.quantity as number,
        );
        return JSON.stringify(result);
      }

      case "reserve_stock": {
        const result = await reserveStock(
          toolInput.product_id as string,
          toolInput.quantity as number,
        );
        return JSON.stringify(result);
      }

      case "create_order": {
        const result = await createOrder(
          ownerId,
          customerPhone,
          toolInput.items as Array<{
            product_id: string;
            quantity: number;
            unit_price: number;
          }>,
          toolInput.status as string,
          toolInput.delivery_address as string | undefined,
        );
        return JSON.stringify(result);
      }

      case "request_delivery": {
        const result = await requestDelivery(
          toolInput.order_id as string,
          toolInput.notes as string | undefined,
        );
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

/**
 * The main agent loop.
 * Receives one inbound WhatsApp message, reasons using Claude + tools,
 * and returns the final reply text to send back to the customer.
 */
export async function runAgentLoop(
  customerPhone: string,
  inboundMessage: string,
  ownerId: string,
): Promise<string> {
  // 1. Log the inbound message
  await logConversation(customerPhone, "customer", inboundMessage);

  // 2. Check if the customer is providing an address for an open order
  const openOrder = await findOpenOrder(customerPhone, ownerId);

  // 3. Load recent conversation history for context
  const history = await getConversationHistory(customerPhone, 30);

  // 4. Build OpenRouter messages array
  const messages: Anthropic.MessageParam[] = history
    .slice(0, -1) // exclude the message we just logged
    .map((msg) => ({
      role: (msg.role === "customer" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: msg.message,
    }));

  // Add the current inbound message
  messages.push({ role: "user", content: inboundMessage });

  // Inject context about any open order
  let systemPrompt = SYSTEM_PROMPT;
  if (openOrder) {
    systemPrompt += `\n\nCONTEXT: This customer has an open order (ID: ${openOrder.id}) with status "${openOrder.status}" that needs a delivery address. If they are providing an address in this message, call updateOrderAddress for order ID ${openOrder.id} instead of creating a new order.`;
  }

  // 5. Run the agent loop
  let finalReply = "";
  let continueLoop = true;
  let currentMessages = [...messages];

  while (continueLoop) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools: agentToolDefinitions,
      messages: currentMessages,
    });

    // Add assistant response to message history
    currentMessages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // Extract text reply
      const textBlock = response.content.find((b) => b.type === "text");
      finalReply = textBlock
        ? textBlock.text
        : "Your order has been processed.";
      continueLoop = false;
    } else if (response.stop_reason === "tool_use") {
      // Process all tool calls in this turn
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        // Special case: address update (not a formal tool, handled inline)
        if (block.name === "create_order" && openOrder) {
          const input = block.input as Record<string, unknown>;
          if (
            input.delivery_address &&
            openOrder.status === "awaiting_address"
          ) {
            await updateOrderAddress(
              openOrder.id,
              input.delivery_address as string,
            );
            await requestDelivery(openOrder.id);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({
                success: true,
                message:
                  "Order confirmed with delivery address. Delivery requested.",
              }),
            });
            continue;
          }
        }

        const result = await dispatchTool(
          block.name,
          block.input as Record<string, unknown>,
          customerPhone,
          ownerId,
        );

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      // Feed tool results back
      currentMessages.push({ role: "user", content: toolResults });
    } else {
      // max_tokens or other stop — extract whatever text is there
      const textBlock = response.content.find((b) => b.type === "text");
      finalReply =
        textBlock?.text ?? "Sorry, I ran into an issue. Please try again.";
      continueLoop = false;
    }
  }

  // 6. Log agent reply
  await logConversation(customerPhone, "agent", finalReply);

  return finalReply;
}
