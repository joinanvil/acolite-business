import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createNanoClaw } from "@/lib/nanoclaw";
import { getMessages, clearMessages } from "@/lib/db";

// Get chat history and container status
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await getMessages(session.user.id);
    const nanoclaw = createNanoClaw(session.user.id);
    const hasActiveContainer = nanoclaw.hasActiveContainer();

    return NextResponse.json({ messages, hasActiveContainer });
  } catch (error) {
    console.error("GET /api/chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Send a message and stream the response
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, action } = body;

    const nanoclaw = createNanoClaw(session.user.id);

    // Handle clear action
    if (action === "clear") {
      await clearMessages(session.user.id);
      await nanoclaw.stopContainer(); // Also stop container when clearing
      return NextResponse.json({ success: true });
    }

    // Handle stop container action
    if (action === "stop") {
      await nanoclaw.stopContainer();
      return NextResponse.json({ success: true });
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Stream the response
    const stream = await nanoclaw.streamChat(message);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            const data = JSON.stringify(event) + "\n";
            controller.enqueue(encoder.encode(`data: ${data}\n`));
          }
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
