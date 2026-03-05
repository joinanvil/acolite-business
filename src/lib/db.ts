import { createClient } from "@libsql/client";
import path from "path";

const dbPath = process.env.NANOCLAW_DB_URL
  || `file:${path.join(process.cwd(), "prisma", "dev.db")}`;

export const client = createClient({
  url: dbPath,
});

let initialized = false;

export async function initDb() {
  if (initialized) return;

  // Messages table for chat history
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_nanoclaw_messages_user_id
    ON nanoclaw_messages(user_id)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_nanoclaw_messages_created_at
    ON nanoclaw_messages(user_id, created_at)
  `);

  // Sessions table for agent state
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_sessions (
      user_id TEXT PRIMARY KEY,
      session_id TEXT,
      container_id TEXT,
      last_activity TEXT NOT NULL DEFAULT (datetime('now')),
      settings TEXT DEFAULT '{}'
    )
  `);

  // Mailboxes table for email inboxes
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_mailboxes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      inbox_id TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_nanoclaw_mailboxes_user_id
    ON nanoclaw_mailboxes(user_id)
  `);

  // Payments table for Stripe revenue tracking
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_payment_id TEXT NOT NULL,
      stripe_product_id TEXT,
      stripe_price_id TEXT,
      payment_link_url TEXT,
      product_name TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'active',
      type TEXT NOT NULL DEFAULT 'one_time' CHECK(type IN ('one_time', 'subscription')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_nanoclaw_payments_user_id
    ON nanoclaw_payments(user_id)
  `);

  // Deployments table for Vercel site tracking
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_deployments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      project_name TEXT,
      vercel_project_id TEXT,
      framework TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'failed', 'deleted')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_nanoclaw_deployments_user_id
    ON nanoclaw_deployments(user_id)
  `);

  initialized = true;
}

export interface Message {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface Session {
  user_id: string;
  session_id: string | null;
  container_id: string | null;
  last_activity: string;
  settings: string;
}

export async function addMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<Message> {
  await initDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_messages (id, user_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, userId, role, content, created_at],
  });

  return { id, user_id: userId, role, content, created_at };
}

export async function getMessages(
  userId: string,
  limit: number = 50
): Promise<Message[]> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_messages
          WHERE user_id = ?
          ORDER BY created_at ASC
          LIMIT ?`,
    args: [userId, limit],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    created_at: row.created_at as string,
  }));
}

export async function getSession(userId: string): Promise<Session | null> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_sessions WHERE user_id = ?`,
    args: [userId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    user_id: row.user_id as string,
    session_id: row.session_id as string | null,
    container_id: row.container_id as string | null,
    last_activity: row.last_activity as string,
    settings: row.settings as string,
  };
}

export async function upsertSession(
  userId: string,
  sessionId?: string,
  containerId?: string
): Promise<void> {
  await initDb();
  await client.execute({
    sql: `INSERT INTO nanoclaw_sessions (user_id, session_id, container_id, last_activity)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            session_id = COALESCE(?, session_id),
            container_id = COALESCE(?, container_id),
            last_activity = datetime('now')`,
    args: [userId, sessionId ?? null, containerId ?? null, sessionId ?? null, containerId ?? null],
  });
}

export async function clearMessages(userId: string): Promise<void> {
  await initDb();
  await client.execute({
    sql: `DELETE FROM nanoclaw_messages WHERE user_id = ?`,
    args: [userId],
  });
}

// Mailboxes

export interface Mailbox {
  id: string;
  user_id: string;
  email: string;
  username: string;
  inbox_id: string;
  display_name: string | null;
  created_at: string;
}

export async function createMailbox(
  userId: string,
  email: string,
  username: string,
  inboxId: string,
  displayName?: string
): Promise<Mailbox> {
  await initDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_mailboxes (id, user_id, email, username, inbox_id, display_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, email, username, inboxId, displayName ?? null, created_at],
  });

  return {
    id,
    user_id: userId,
    email,
    username,
    inbox_id: inboxId,
    display_name: displayName ?? null,
    created_at,
  };
}

export async function getMailboxes(userId: string): Promise<Mailbox[]> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_mailboxes WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    email: row.email as string,
    username: row.username as string,
    inbox_id: row.inbox_id as string,
    display_name: row.display_name as string | null,
    created_at: row.created_at as string,
  }));
}

export async function getMailboxByInboxId(
  userId: string,
  inboxId: string
): Promise<Mailbox | null> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_mailboxes WHERE user_id = ? AND inbox_id = ?`,
    args: [userId, inboxId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    email: row.email as string,
    username: row.username as string,
    inbox_id: row.inbox_id as string,
    display_name: row.display_name as string | null,
    created_at: row.created_at as string,
  };
}

// User Settings (stored in nanoclaw_sessions.settings JSON)

export async function getUserSettings(userId: string): Promise<Record<string, string>> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT settings FROM nanoclaw_sessions WHERE user_id = ?`,
    args: [userId],
  });

  if (result.rows.length === 0) return {};
  try {
    return JSON.parse(result.rows[0].settings as string || "{}");
  } catch {
    return {};
  }
}

export async function updateUserSettings(
  userId: string,
  updates: Record<string, string | null>
): Promise<Record<string, string>> {
  await initDb();
  const current = await getUserSettings(userId);
  const merged = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  const settingsJson = JSON.stringify(merged);

  await client.execute({
    sql: `INSERT INTO nanoclaw_sessions (user_id, settings, last_activity)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET settings = ?, last_activity = datetime('now')`,
    args: [userId, settingsJson, settingsJson],
  });

  return merged;
}

export async function deleteMailbox(id: string, userId: string): Promise<boolean> {
  await initDb();
  const result = await client.execute({
    sql: `DELETE FROM nanoclaw_mailboxes WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });

  return result.rowsAffected > 0;
}

// Research Reports

export interface ResearchReport {
  id: string;
  title: string;
  preview: string;
  created_at: string;
}

export async function getResearchReports(userId: string, limit: number = 5): Promise<ResearchReport[]> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT id, content, created_at FROM nanoclaw_messages
          WHERE user_id = ? AND role = 'assistant'
          AND (content LIKE '%# Market Research%'
            OR content LIKE '%## Executive Summary%'
            OR content LIKE '%## Market Analysis%'
            OR content LIKE '%## Competitor Analysis%')
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [userId, limit],
  });

  return result.rows.map((row) => {
    const content = row.content as string;
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : "Research Report";
    const preview = content
      .replace(/^#.+$/m, "")
      .replace(/[#*_`]/g, "")
      .trim()
      .slice(0, 150);

    return {
      id: row.id as string,
      title,
      preview,
      created_at: row.created_at as string,
    };
  });
}

// Payments

export interface Payment {
  id: string;
  user_id: string;
  stripe_payment_id: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  payment_link_url: string | null;
  product_name: string | null;
  amount: number;
  currency: string;
  status: string;
  type: "one_time" | "subscription";
  created_at: string;
}

export async function createPayment(
  userId: string,
  stripePaymentId: string,
  amount: number,
  currency: string,
  opts?: {
    stripeProductId?: string;
    stripePriceId?: string;
    paymentLinkUrl?: string;
    productName?: string;
    type?: "one_time" | "subscription";
  }
): Promise<Payment> {
  await initDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_payments (id, user_id, stripe_payment_id, stripe_product_id, stripe_price_id, payment_link_url, product_name, amount, currency, type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      userId,
      stripePaymentId,
      opts?.stripeProductId ?? null,
      opts?.stripePriceId ?? null,
      opts?.paymentLinkUrl ?? null,
      opts?.productName ?? null,
      amount,
      currency,
      opts?.type ?? "one_time",
      created_at,
    ],
  });

  return {
    id,
    user_id: userId,
    stripe_payment_id: stripePaymentId,
    stripe_product_id: opts?.stripeProductId ?? null,
    stripe_price_id: opts?.stripePriceId ?? null,
    payment_link_url: opts?.paymentLinkUrl ?? null,
    product_name: opts?.productName ?? null,
    amount,
    currency,
    status: "active",
    type: opts?.type ?? "one_time",
    created_at,
  };
}

export async function getPayments(userId: string): Promise<Payment[]> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_payments WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    stripe_payment_id: row.stripe_payment_id as string,
    stripe_product_id: row.stripe_product_id as string | null,
    stripe_price_id: row.stripe_price_id as string | null,
    payment_link_url: row.payment_link_url as string | null,
    product_name: row.product_name as string | null,
    amount: row.amount as number,
    currency: row.currency as string,
    status: row.status as string,
    type: row.type as "one_time" | "subscription",
    created_at: row.created_at as string,
  }));
}

export async function deletePayment(id: string, userId: string): Promise<boolean> {
  await initDb();
  const result = await client.execute({
    sql: `DELETE FROM nanoclaw_payments WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });

  return result.rowsAffected > 0;
}

// Deployments

export interface Deployment {
  id: string;
  user_id: string;
  url: string;
  project_name: string | null;
  vercel_project_id: string | null;
  framework: string | null;
  status: "active" | "failed" | "deleted";
  created_at: string;
  updated_at: string;
}

export async function createDeployment(
  userId: string,
  url: string,
  opts?: {
    projectName?: string;
    vercelProjectId?: string;
    framework?: string;
  }
): Promise<Deployment> {
  await initDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_deployments (id, user_id, url, project_name, vercel_project_id, framework, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      userId,
      url,
      opts?.projectName ?? null,
      opts?.vercelProjectId ?? null,
      opts?.framework ?? null,
      created_at,
      created_at,
    ],
  });

  return {
    id,
    user_id: userId,
    url,
    project_name: opts?.projectName ?? null,
    vercel_project_id: opts?.vercelProjectId ?? null,
    framework: opts?.framework ?? null,
    status: "active",
    created_at,
    updated_at: created_at,
  };
}

export async function getDeployments(userId: string): Promise<Deployment[]> {
  await initDb();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_deployments WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    url: row.url as string,
    project_name: row.project_name as string | null,
    vercel_project_id: row.vercel_project_id as string | null,
    framework: row.framework as string | null,
    status: row.status as "active" | "failed" | "deleted",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

export async function upsertDeployment(
  userId: string,
  url: string,
  opts?: {
    projectName?: string;
    vercelProjectId?: string;
    framework?: string;
  }
): Promise<Deployment> {
  await initDb();
  const now = new Date().toISOString();

  const existing = await client.execute({
    sql: `SELECT id FROM nanoclaw_deployments WHERE user_id = ? AND url = ?`,
    args: [userId, url],
  });

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id as string;
    await client.execute({
      sql: `UPDATE nanoclaw_deployments
            SET project_name = COALESCE(?, project_name),
                vercel_project_id = COALESCE(?, vercel_project_id),
                framework = COALESCE(?, framework),
                status = 'active',
                updated_at = ?
            WHERE id = ?`,
      args: [
        opts?.projectName ?? null,
        opts?.vercelProjectId ?? null,
        opts?.framework ?? null,
        now,
        id,
      ],
    });

    const updated = await client.execute({
      sql: `SELECT * FROM nanoclaw_deployments WHERE id = ?`,
      args: [id],
    });

    const row = updated.rows[0];
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      url: row.url as string,
      project_name: row.project_name as string | null,
      vercel_project_id: row.vercel_project_id as string | null,
      framework: row.framework as string | null,
      status: row.status as "active" | "failed" | "deleted",
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  return createDeployment(userId, url, opts);
}

export async function deleteDeployment(id: string, userId: string): Promise<boolean> {
  await initDb();
  const result = await client.execute({
    sql: `DELETE FROM nanoclaw_deployments WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });

  return result.rowsAffected > 0;
}
