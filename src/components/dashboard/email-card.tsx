"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Mail, Loader2 } from "lucide-react";

interface EmailMessage {
  id: string;
  from: { email: string; name?: string };
  subject: string;
  received_at: string;
}

interface MailboxEmails {
  mailboxEmail: string;
  mailboxName: string | null;
  messages: EmailMessage[];
}

interface EmailData {
  configured: boolean;
  emails?: MailboxEmails[];
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function EmailCard() {
  const [data, setData] = useState<EmailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/emails")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Flatten all messages across mailboxes for a unified view
  const allMessages =
    data?.emails
      ?.flatMap((mailbox) =>
        mailbox.messages.map((msg) => ({
          ...msg,
          mailboxEmail: mailbox.mailboxEmail,
        }))
      )
      .sort(
        (a, b) =>
          new Date(b.received_at).getTime() -
          new Date(a.received_at).getTime()
      )
      .slice(0, 5) ?? [];

  const mailboxCount = data?.emails?.length ?? 0;
  const totalMessages = data?.emails?.reduce(
    (sum, m) => sum + m.messages.length,
    0
  ) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4" />
          Email
          {mailboxCount > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              {mailboxCount} inbox{mailboxCount !== 1 ? "es" : ""} &middot;{" "}
              {totalMessages} message{totalMessages !== 1 ? "s" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.configured ? (
          <p className="text-sm text-muted-foreground">
            Add AGENTMAIL_API_KEY to see emails.
          </p>
        ) : allMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No emails yet. Ask your assistant to set up an inbox.
          </p>
        ) : (
          <div className="space-y-3">
            {allMessages.map((msg) => (
              <div key={msg.id} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">
                    {msg.from.name || msg.from.email}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {timeAgo(msg.received_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {msg.subject}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
