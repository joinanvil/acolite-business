import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createMailbox,
  getMailboxes,
  deleteMailbox,
  getMailboxByInboxId,
} from "@/lib/db";
import { createAgentMailClient } from "@/lib/agentmail";

// Get mailboxes for the user (syncs from AgentMail API)
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get mailboxes from our DB
    let mailboxes = await getMailboxes(session.user.id);

    // Also fetch from AgentMail API and sync any missing inboxes
    const client = createAgentMailClient();
    if (client) {
      try {
        const { inboxes } = await client.listInboxes();

        // Find inboxes not in our DB and add them
        const existingInboxIds = new Set(mailboxes.map(m => m.inbox_id));

        for (const inbox of inboxes) {
          if (!existingInboxIds.has(inbox.id)) {
            // This inbox exists in AgentMail but not our DB - add it
            const newMailbox = await createMailbox(
              session.user.id,
              inbox.email,
              inbox.username,
              inbox.id
            );
            mailboxes = [newMailbox, ...mailboxes];
          }
        }
      } catch (error) {
        // Log but don't fail if AgentMail sync fails
        console.error("Failed to sync from AgentMail:", error);
      }
    }

    return NextResponse.json({ mailboxes });
  } catch (error) {
    console.error("GET /api/mailboxes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Create a new mailbox
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { username, displayName } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "username is required" },
        { status: 400 }
      );
    }

    // Validate username format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { error: "Invalid username format. Use only letters, numbers, hyphens, and underscores." },
        { status: 400 }
      );
    }

    const client = createAgentMailClient();
    if (!client) {
      return NextResponse.json(
        { error: "AgentMail API key not configured" },
        { status: 503 }
      );
    }

    // Create inbox via AgentMail API with client_id for idempotency
    const clientId = `${session.user.id}-${username}`;

    try {
      const inbox = await client.createInbox(username, clientId);

      // Check if we already have this inbox in our DB
      const existing = await getMailboxByInboxId(session.user.id, inbox.id);
      if (existing) {
        return NextResponse.json({ mailbox: existing });
      }

      // Store in our database
      const mailbox = await createMailbox(
        session.user.id,
        inbox.email,
        inbox.username,
        inbox.id,
        displayName
      );

      return NextResponse.json({ mailbox }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message.includes("409")) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("POST /api/mailboxes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Delete a mailbox
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, inboxId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Delete from AgentMail API if inbox_id provided
    if (inboxId) {
      const client = createAgentMailClient();
      if (client) {
        try {
          await client.deleteInbox(inboxId);
        } catch (error) {
          // Log but don't fail if AgentMail deletion fails
          console.error("Failed to delete inbox from AgentMail:", error);
        }
      }
    }

    // Delete from our database
    const success = await deleteMailbox(id, session.user.id);

    return NextResponse.json({ success });
  } catch (error) {
    console.error("DELETE /api/mailboxes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
