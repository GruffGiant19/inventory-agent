import OpenAI from "openai";
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

const nvidia = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
});

const NVIDIA_MODEL = process.env.OPENROUTER_MODEL!;
const MAX_TOOL_ITERATIONS = 8;

const SYSTEM_PROMPT = `You are an AI order-taking agent for a small packaging import business that sells food and cake packaging goods (boxes, containers, trays, cups, etc.) via WhatsApp.

Your job is to:
1. Understand what product(s) the customer wants and in what quantity.
2. Search the inventory to find matching products.
3. If multiple close matches exist, ask a single clear clarifying question before proceeding.
4. Check and atomically reserve stock to prevent overselling.
5. Create a structured order and reply with a clear confirmation (product name, quantity, unit price, total).
6. If the customer hasn't provided a delivery address, ask for it after confirming the order.
7. If the customer has an open order awaiting an address and this message provides one, call provide_delivery_address — do not call create_order again.

Rules:
- Be warm, concise, and professional. This is a WhatsApp conversation.
- Never guess or fabricate availability — always check stock first.
- Never reserve stock twice for the same item in one conversation turn.
- If an item is out of stock, say so honestly and offer to notify when restocked.
- Currency is GHS (Ghana Cedis). Format prices as e.g. "GHS 12.50".
- Always confirm the exact product name, not just the customer's informal description.
- You MUST call search_inventory before answering any question about product availability. 
- Never answer from memory or assumption — always check the tool first, even if you think you know the answer.`;

async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  customerPhone: string,
  ownerId: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "search_inventory": {
        const result = await searchInventory(args.description as string);
        const output = JSON.stringify(
          result.products.length
            ? { found: true, products: result.products }
            : { found: false, message: "No matching products found." },
        );
        console.log("[Agent] search_inventory result:", output);
        return output;
      }
      case "check_stock":
        return JSON.stringify(
          await checkStock(args.product_id as string, args.quantity as number),
        );
      case "reserve_stock":
        return JSON.stringify(
          await reserveStock(
            args.product_id as string,
            args.quantity as number,
          ),
        );
      case "create_order": {
        const result = await createOrder(
          ownerId,
          customerPhone,
          args.items as Array<{
            product_id: string;
            quantity: number;
            unit_price: number;
          }>,
          args.status as string,
          args.delivery_address as string | undefined,
        );
        return JSON.stringify(result);
      }
      case "provide_delivery_address": {
        await updateOrderAddress(
          args.order_id as string,
          args.delivery_address as string,
        );
        await requestDelivery(args.order_id as string);
        return JSON.stringify({
          success: true,
          message: "Address saved, delivery requested.",
        });
      }
      case "request_delivery":
        return JSON.stringify(
          await requestDelivery(
            args.order_id as string,
            args.notes as string | undefined,
          ),
        );
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

export async function runAgentLoop(
  customerPhone: string,
  inboundMessage: string,
  ownerId: string,
): Promise<string> {
  await logConversation(customerPhone, "customer", inboundMessage);

  const openOrder = await findOpenOrder(customerPhone, ownerId);
  const history = await getConversationHistory(customerPhone, 30);

  let systemPrompt = SYSTEM_PROMPT;
  if (openOrder) {
    systemPrompt += `\n\nCONTEXT: Open order ${openOrder.id} (status: ${openOrder.status}) is awaiting a delivery address. If this message provides one, call provide_delivery_address.`;
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(0, -1).map((msg) => ({
      role: (msg.role === "customer" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: msg.message,
    })),
    { role: "user", content: inboundMessage },
  ];

  let finalReply = "";

  try {
    let iterations = 0;
    let continueLoop = true;

    while (continueLoop) {
      iterations++;
      if (iterations > MAX_TOOL_ITERATIONS) {
        finalReply =
          "Sorry, I'm having trouble processing that. Could you try rephrasing, or a team member will follow up shortly.";
        break;
      }

      const response = await nvidia.chat.completions.create({
        model: NVIDIA_MODEL,
        messages,
        tools: agentToolDefinitions,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      const message = choice.message;

      console.log("[Agent] finish_reason:", choice.finish_reason);
      console.log(
        "[Agent] tool_calls:",
        JSON.stringify(message.tool_calls, null, 2),
      );

      if (choice.finish_reason === "tool_calls" && message.tool_calls) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await dispatchTool(
            toolCall.function.name,
            args,
            customerPhone,
            ownerId,
          );
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      } else {
        finalReply =
          message.content ?? "Sorry, I ran into an issue. Please try again.";
        continueLoop = false;
      }
    }
  } catch (err) {
    console.error("[Agent Loop Error]", err);
    finalReply =
      "Sorry, I'm experiencing a technical issue right now — please try again in a moment, or a team member will follow up.";
  }

  await logConversation(customerPhone, "agent", finalReply);
  return finalReply;
}
