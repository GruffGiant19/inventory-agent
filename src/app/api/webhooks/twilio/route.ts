import { NextRequest, NextResponse } from "next/server";
import { runAgentLoop } from "@/lib/agent/loop";

// The owner's user ID — set this after you create your Supabase account
const OWNER_ID = process.env.SUPABASE_OWNER_ID ?? "";

export async function POST(request: NextRequest) {
  try {
    // Lazy-init Twilio client so build-time placeholder values don't throw
    const twilio = (await import("twilio")).default;
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    // Parse form-encoded Twilio payload
    const formData = await request.formData();
    const from = formData.get("From") as string; // e.g. whatsapp:+233501234567
    const body = formData.get("Body") as string;

    if (!from || !body) {
      return new NextResponse("Missing From or Body", { status: 400 });
    }

    // Run agent loop async — return empty TwiML immediately,
    // then send reply via Twilio REST API once agent finishes
    runAgentLoop(from, body.trim(), OWNER_ID)
      .then(async (replyText) => {
        await twilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_NUMBER!,
          to: from,
          body: replyText,
        });
      })
      .catch((err) => {
        console.error("[Agent Loop Error]", err);
      });

    // Return empty TwiML immediately so Twilio doesn't timeout
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (err) {
    console.error("[Twilio Webhook Error]", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
