import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createNanoClaw } from "@/lib/nanoclaw";
import { getMessages, clearMessages, addMessage } from "@/lib/db";
import { getPendingMessages } from "@/lib/task-scheduler";

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
    const isBusy = nanoclaw.isBusy();

    const pendingMessages = getPendingMessages(session.user.id);

    return NextResponse.json({
      messages,
      hasActiveContainer,
      isBusy,
      pendingMessages,
    });
  } catch (error) {
    console.error("GET /api/chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    if (action === "clear") {
      await clearMessages(session.user.id);
      await nanoclaw.stopContainer();
      return NextResponse.json({ success: true });
    }

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

    // Save user message immediately so the UI can display it
    await addMessage(session.user.id, "user", message);

    // Execute directly against the container in the background.
    // No task is created — chat messages are just conversations.
    // The agent can explicitly create tasks via its create_task MCP tool.
    nanoclaw.executeForTask(message).catch(async (err) => {
      console.error("Chat execution error:", err);
      await addMessage(
        session.user.id,
        "assistant",
        "Sorry, I encountered an error processing your message.",
      );
    });

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
