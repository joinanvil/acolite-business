const AGENTMAIL_API_URL = "https://api.agentmail.to/v0";

// Raw API response format
interface AgentMailInboxRaw {
  inbox_id: string; // This is actually the email address
  client_id?: string;
  display_name?: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  pod_id: string;
}

// Normalized inbox format for our use
export interface AgentMailInbox {
  id: string;        // inbox_id (email) used as identifier
  email: string;     // Same as id for AgentMail
  username: string;  // Extracted from email
  display_name?: string;
  created_at: string;
}

function normalizeInbox(raw: AgentMailInboxRaw): AgentMailInbox {
  const email = raw.inbox_id;
  const username = email.split("@")[0];
  return {
    id: email,
    email: email,
    username: username,
    display_name: raw.display_name,
    created_at: raw.created_at,
  };
}

export interface AgentMailMessage {
  id: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string }[];
  subject: string;
  text?: string;
  html?: string;
  received_at: string;
}

export interface AgentMailRecipient {
  email: string;
  name?: string;
}

export class AgentMailClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${AGENTMAIL_API_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AgentMail API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Create a new inbox
   * @param username - The username for the inbox (becomes username@agentmail.to)
   * @param clientId - Optional client ID for idempotent creation
   */
  async createInbox(
    username: string,
    clientId?: string
  ): Promise<AgentMailInbox> {
    const body: Record<string, string> = { username };
    if (clientId) {
      body.client_id = clientId;
    }

    return this.request<AgentMailInbox>("POST", "/inboxes", body);
  }

  /**
   * List all inboxes
   */
  async listInboxes(): Promise<{ inboxes: AgentMailInbox[] }> {
    const response = await this.request<{ inboxes: AgentMailInboxRaw[] }>("GET", "/inboxes");
    return {
      inboxes: response.inboxes.map(normalizeInbox),
    };
  }

  /**
   * Get a specific inbox
   */
  async getInbox(inboxId: string): Promise<AgentMailInbox> {
    return this.request<AgentMailInbox>("GET", `/inboxes/${inboxId}`);
  }

  /**
   * Delete an inbox
   */
  async deleteInbox(inboxId: string): Promise<void> {
    await this.request<void>("DELETE", `/inboxes/${inboxId}`);
  }

  /**
   * Send an email from an inbox
   */
  async sendEmail(
    inboxId: string,
    to: AgentMailRecipient[],
    subject: string,
    text: string,
    html?: string
  ): Promise<AgentMailMessage> {
    const body: Record<string, unknown> = {
      to,
      subject,
      text,
    };

    if (html) {
      body.html = html;
    }

    return this.request<AgentMailMessage>(
      "POST",
      `/inboxes/${inboxId}/messages`,
      body
    );
  }

  /**
   * List messages in an inbox
   */
  async listMessages(
    inboxId: string
  ): Promise<{ messages: AgentMailMessage[] }> {
    return this.request<{ messages: AgentMailMessage[] }>(
      "GET",
      `/inboxes/${inboxId}/messages`
    );
  }

  /**
   * Get a specific message
   */
  async getMessage(
    inboxId: string,
    messageId: string
  ): Promise<AgentMailMessage> {
    return this.request<AgentMailMessage>(
      "GET",
      `/inboxes/${inboxId}/messages/${messageId}`
    );
  }
}

/**
 * Create an AgentMail client using the API key from environment
 */
export function createAgentMailClient(): AgentMailClient | null {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new AgentMailClient(apiKey);
}
