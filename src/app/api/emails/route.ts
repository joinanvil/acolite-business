import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createAgentMailClient } from "@/lib/agentmail";
import { getMailboxes } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = createAgentMailClient();
    if (!client) {
      return NextResponse.json({ configured: false });
    }

    const mailboxes = await getMailboxes(session.user.id);

    // Fetch recent messages for each mailbox (limit to 3 mailboxes to avoid rate limits)
    const emailResults = await Promise.all(
      mailboxes.slice(0, 3).map(async (mailbox) => {
        try {
          const { messages } = await client.listMessages(mailbox.inbox_id);
          return {
            mailboxEmail: mailbox.email,
            mailboxName: mailbox.display_name,
            messages: messages.slice(0, 3).map((msg) => ({
              id: msg.id,
              from: msg.from,
              subject: msg.subject,
              received_at: msg.received_at,
            })),
          };
        } catch {
          return {
            mailboxEmail: mailbox.email,
            mailboxName: mailbox.display_name,
            messages: [],
          };
        }
      })
    );

    return NextResponse.json({ configured: true, emails: emailResults });
  } catch (error) {
    console.error("GET /api/emails error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
