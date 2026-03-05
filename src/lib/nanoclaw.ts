import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import {
  addMessage,
  getMessages,
  getSession,
  upsertSession,
  type Message,
} from "./db";

const CONTAINER_IMAGE = "nanoclaw-agent:latest";
const CONTAINER_TIMEOUT = 300000; // 5 minutes per message
const GROUPS_DIR = path.join(process.cwd(), "nanoclaw-data", "groups");
const SESSIONS_DIR = path.join(process.cwd(), "nanoclaw-data", "sessions");

interface ContainerInfo {
  process: ChildProcess;
  containerName: string;
  groupDir: string;
  ipcDir: string;
  lastActivity: number;
  pendingResponses: Map<string, (response: string) => void>;
  streamListeners: Map<string, (chunk: string) => void>;
  outputBuffer: string;
  busyCount: number;
}

const activeContainers = new Map<string, ContainerInfo>();

function ensureDirs(userId: string) {
  const groupDir = path.join(GROUPS_DIR, userId);
  const sessionDir = path.join(SESSIONS_DIR, userId, ".claude");
  const ipcDir = path.join(groupDir, "ipc");

  fs.mkdirSync(path.join(groupDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, "messages"), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, "input"), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, "data"), { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const claudeMd = path.join(groupDir, "CLAUDE.md");
  if (!fs.existsSync(claudeMd)) {
    fs.writeFileSync(
      claudeMd,
      `# NanoClaw Memory

This is your persistent memory file. You can write notes here to remember across conversations.

## Your Capabilities

### Scheduling Tasks
To schedule a task, write a JSON file to /workspace/ipc/tasks/. The scheduler picks these up every 5 seconds.

\`\`\`bash
echo '{"type":"schedule_task","prompt":"Your task prompt here","schedule_type":"once","schedule_value":"2026-03-06T09:00:00"}' > /workspace/ipc/tasks/$(date +%s)-task.json
\`\`\`

**Schedule types:**
- **once**: Run at a specific time. Use LOCAL time format without Z suffix (e.g., "2026-03-06T09:00:00")
- **interval**: Run repeatedly. Value is milliseconds (e.g., "60000" for every 1 minute, "300000" for every 5 minutes)
- **cron**: Run on a schedule (e.g., "0 9 * * *" for daily at 9am)

**IMPORTANT for "once" schedule type:**
- Get the current local time using: \`date +"%Y-%m-%dT%H:%M:%S"\`
- If user says "in X minutes", add X minutes to current local time
- If user says "tomorrow morning", use tomorrow's date at 09:00:00
- Format: "YYYY-MM-DDTHH:MM:SS" (NO Z suffix, NO timezone offset)

**The prompt field** is what will be executed when the task fires. Include everything the agent needs to do, for example:
- "Send an email to barak@acolite.ai with subject 'Hello' and body 'Hi Barak, just wanted to say hello!'"
- "Check the latest news about AI and send a summary to the user"

Example: Schedule an email for tomorrow at 9am:
\`\`\`bash
echo '{"type":"schedule_task","prompt":"Read /workspace/skills/agentmail/SKILL.md, then send an email to user@example.com with subject Hello and a friendly greeting body","schedule_type":"once","schedule_value":"2026-03-06T09:00:00"}' > /workspace/ipc/tasks/$(date +%s)-task.json
\`\`\`

Scheduled tasks appear in the user's dashboard and the user can see their status.

### Sending Messages
To send an immediate message to the user (appears in their chat):
\`\`\`bash
echo '{"type":"message","text":"Your message here"}' > /workspace/ipc/messages/$(date +%s)-msg.json
\`\`\`

### Web Search
Use the \`WebSearch\` and \`WebFetch\` tools to search the web and fetch content.

## Deploying to Vercel

IMPORTANT: When the user asks you to build, create, or generate any web project (landing page, website, app, etc.), you MUST ALWAYS deploy it to Vercel after creating the files. Never skip deployment.

1. Write the project code in /workspace/group/projects/{project-name}/
2. Deploy with: \`npx vercel deploy --prod --yes --token $VERCEL_TOKEN\`
3. ALWAYS return the live URL to the user so they can see their project

If deployment fails, debug and retry. The user expects a live link.

## Tracking Resources

IMPORTANT: After creating Stripe resources or deploying to Vercel, you MUST write a tracking file so the dashboard can display the data.

### After Stripe Operations
After creating a product, price, or payment link, write a tracking file:
\`\`\`bash
echo '{"type":"track_payment","stripe_payment_id":"pl_xxx","product_name":"Product Name","amount":4900,"currency":"usd","payment_link_url":"https://buy.stripe.com/xxx","payment_type":"one_time"}' > /workspace/ipc/data/$(date +%s)-payment.json
\`\`\`
Replace the values with the actual Stripe IDs, product name, amount in cents, and payment link URL.

### After Vercel Deployments
After a successful deployment, write a tracking file:
\`\`\`bash
echo '{"type":"track_deployment","url":"https://project.vercel.app","project_name":"project-name"}' > /workspace/ipc/data/$(date +%s)-deploy.json
\`\`\`
Replace the URL and project name with the actual deployment values.

### Saving User Settings
To save settings (like the business website URL), write a settings file:
\`\`\`bash
echo '{"type":"save_settings","settings":{"websiteUrl":"https://example.com"}}' > /workspace/ipc/data/$(date +%s)-settings.json
\`\`\`
Supported settings keys:
- **websiteUrl**: The user's business website URL

When the user tells you their website URL or asks you to set it, save it using this method.

## Available Skills

You have access to specialized skills in /workspace/skills/. When a task matches a skill's description, read the skill's SKILL.md to learn how to perform that task effectively.

Current skills:
- **market-research**: Comprehensive market research, competitor analysis, pricing research, market sizing
- **agentmail**: Create email inboxes, send and receive emails via the AgentMail API

To use a skill, read its SKILL.md file first:
\`\`\`
Read /workspace/skills/market-research/SKILL.md
\`\`\`

## User Preferences

(none yet)

## Important Context

(none yet)
`
    );
  }

  return { groupDir, sessionDir, ipcDir };
}

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  assistantName: string;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: "success" | "error";
  result?: string | null;
  error?: string;
  newSessionId?: string;
}

export interface NanoClawResponse {
  content: string;
  messageId: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMessagesAsXml(messages: Message[]): string {
  const formatted = messages.map((m) => {
    const name = m.role === "user" ? "User" : "NanoClaw";
    return `<message from="${escapeXml(name)}" timestamp="${m.created_at}">\n${escapeXml(m.content)}\n</message>`;
  });
  return formatted.join("\n\n");
}

const START_MARKER = "---NANOCLAW_OUTPUT_START---";
const END_MARKER = "---NANOCLAW_OUTPUT_END---";

function isContainerRunning(userId: string): boolean {
  const info = activeContainers.get(userId);
  if (!info) return false;

  if (info.process.killed || info.process.exitCode !== null) {
    activeContainers.delete(userId);
    return false;
  }

  return true;
}

/**
 * Check if a Docker container with this name is already running (survives server restarts).
 */
async function isDockerContainerAlive(containerName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn("docker", ["ps", "-q", "-f", `name=^${containerName}$`, "-f", "status=running"]);
    let output = "";
    check.stdout.on("data", (d) => (output += d.toString()));
    check.on("close", () => resolve(output.trim().length > 0));
    check.on("error", () => resolve(false));
  });
}

/**
 * Remove a stopped/dead container so the name can be reused.
 */
async function removeDeadContainer(containerName: string): Promise<void> {
  return new Promise((resolve) => {
    const rm = spawn("docker", ["rm", "-f", containerName]);
    rm.on("close", () => resolve());
    rm.on("error", () => resolve());
  });
}

function setupOutputHandler(userId: string, info: ContainerInfo) {
  info.process.stdout!.on("data", (chunk: Buffer) => {
    info.outputBuffer += chunk.toString();
    info.lastActivity = Date.now();

    while (true) {
      const startIdx = info.outputBuffer.indexOf(START_MARKER);
      if (startIdx === -1) break;

      const endIdx = info.outputBuffer.indexOf(END_MARKER, startIdx);
      if (endIdx === -1) break;

      const jsonStr = info.outputBuffer.slice(
        startIdx + START_MARKER.length,
        endIdx
      ).trim();

      info.outputBuffer = info.outputBuffer.slice(endIdx + END_MARKER.length);

      try {
        const output: ContainerOutput = JSON.parse(jsonStr);

        if (output.newSessionId) {
          upsertSession(userId, output.newSessionId);
        }

        if (output.result) {
          const text = output.result
            .replace(/<internal>[\s\S]*?<\/internal>/g, "")
            .trim();

          if (text) {
            // Notify stream listeners with partial content
            for (const listener of info.streamListeners.values()) {
              listener(text);
            }
            // Resolve the oldest pending response
            const [firstKey] = info.pendingResponses.keys();
            if (firstKey) {
              const resolver = info.pendingResponses.get(firstKey);
              info.pendingResponses.delete(firstKey);
              resolver?.(text);
            }
          }
        }

        if (output.status === "error" && output.error) {
          const [firstKey] = info.pendingResponses.keys();
          if (firstKey) {
            const resolver = info.pendingResponses.get(firstKey);
            info.pendingResponses.delete(firstKey);
            resolver?.(`Error: ${output.error}`);
          }
        }
      } catch {
        // Parse error, skip
      }
    }
  });

  info.process.stderr!.on("data", (data: Buffer) => {
    console.error(`[NanoClaw ${userId}]`, data.toString());
  });

  info.process.on("close", (code) => {
    console.log(`[NanoClaw] Container for user ${userId} exited with code ${code}`);
    activeContainers.delete(userId);

    for (const [, resolver] of info.pendingResponses) {
      resolver("Container exited unexpectedly");
    }
    info.pendingResponses.clear();
    info.streamListeners.clear();
  });

  info.process.on("error", (err) => {
    console.error(`[NanoClaw] Container error for user ${userId}:`, err);
    activeContainers.delete(userId);
  });
}

async function startContainer(userId: string, initialPrompt: string): Promise<ContainerInfo> {
  const { groupDir, sessionDir, ipcDir } = ensureDirs(userId);
  const session = await getSession(userId);
  const containerName = `nanoclaw-${userId.slice(0, 12)}`;

  // Only remove the container if it exists but is NOT running.
  // If it's running, we have a bug — log a warning and kill it.
  const alive = await isDockerContainerAlive(containerName);
  if (alive) {
    console.warn(`[NanoClaw] Container ${containerName} is already running but not tracked. Killing it.`);
  }
  // Remove regardless — either dead container or orphaned running one
  await removeDeadContainer(containerName);

  const containerInput: ContainerInput = {
    prompt: initialPrompt,
    sessionId: session?.session_id || undefined,
    groupFolder: userId,
    chatJid: `web:${userId}`,
    isMain: false,
    assistantName: "NanoClaw",
    secrets: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
      HUNTER_API_KEY: process.env.HUNTER_API_KEY || "",
      STRIPE_API_KEY: process.env.STRIPE_API_KEY || "",
      VERCEL_TOKEN: process.env.VERCEL_TOKEN || "",
      AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY || "",
    },
  };

  const skillsDir = path.join(process.cwd(), "skills");

  const args = [
    "run",
    "-i",
    "--name", containerName,
    "-v", `${groupDir}:/workspace/group`,
    "-v", `${ipcDir}:/workspace/ipc`,
    "-v", `${sessionDir}:/home/node/.claude`,
    "-v", `${skillsDir}:/workspace/skills:ro`,
    CONTAINER_IMAGE,
  ];

  console.log(`[NanoClaw] Starting container for user ${userId}: ${containerName}`);

  const proc = spawn("docker", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const info: ContainerInfo = {
    process: proc,
    containerName,
    groupDir,
    ipcDir,
    lastActivity: Date.now(),
    pendingResponses: new Map(),
    streamListeners: new Map(),
    outputBuffer: "",
    busyCount: 0,
  };

  setupOutputHandler(userId, info);

  proc.stdin!.write(JSON.stringify(containerInput));
  proc.stdin!.end();

  activeContainers.set(userId, info);

  return info;
}

/**
 * Send a message to an existing container via IPC (async)
 */
async function sendIpcMessage(info: ContainerInfo, message: string): Promise<void> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${timestamp}-${random}.json`;
  const filepath = path.join(info.ipcDir, "input", filename);

  const ipcMessage = { type: "message", text: message };

  await fsPromises.writeFile(filepath, JSON.stringify(ipcMessage));
  info.lastActivity = Date.now();

  console.log(`[NanoClaw] Sent IPC message: ${filename}`);
}

function waitForResponse(info: ContainerInfo, messageId: string, timeout: number): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      info.pendingResponses.delete(messageId);
      resolve("Request timed out");
    }, timeout);

    info.pendingResponses.set(messageId, (response: string) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

export class NanoClawService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async chat(userMessage: string): Promise<NanoClawResponse> {
    await addMessage(this.userId, "user", userMessage);

    const history = await getMessages(this.userId);
    const prompt = formatMessagesAsXml(history);

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let response: string;
    let info: ContainerInfo;

    if (isContainerRunning(this.userId)) {
      info = activeContainers.get(this.userId)!;
      const newMessageXml = `<message from="User" timestamp="${new Date().toISOString()}">\n${escapeXml(userMessage)}\n</message>`;
      await sendIpcMessage(info, newMessageXml);
    } else {
      info = await startContainer(this.userId, prompt);
    }

    info.busyCount++;
    try {
      response = await waitForResponse(info, messageId, CONTAINER_TIMEOUT);
    } finally {
      info.busyCount = Math.max(0, info.busyCount - 1);
    }

    const savedMessage = await addMessage(this.userId, "assistant", response);

    return {
      content: response,
      messageId: savedMessage.id,
    };
  }

  /**
   * Stream chat: yields partial content as the agent produces output,
   * then a final "done" event. Falls back to single-yield if the container
   * only emits one result block.
   */
  async *streamChat(
    userMessage: string
  ): AsyncGenerator<{ type: string; content?: string }> {
    await addMessage(this.userId, "user", userMessage);

    const history = await getMessages(this.userId);
    const prompt = formatMessagesAsXml(history);

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let info: ContainerInfo;

    if (isContainerRunning(this.userId)) {
      info = activeContainers.get(this.userId)!;
      const newMessageXml = `<message from="User" timestamp="${new Date().toISOString()}">\n${escapeXml(userMessage)}\n</message>`;
      await sendIpcMessage(info, newMessageXml);
    } else {
      info = await startContainer(this.userId, prompt);
    }

    info.busyCount++;

    try {
      // Collect chunks as they arrive via the stream listener
      const chunks: string[] = [];
      let done = false;
      let finalResolve: (() => void) | null = null;

      const streamId = messageId;

      // Listen for partial output from the container's stdout parser
      info.streamListeners.set(streamId, (text: string) => {
        chunks.push(text);
        finalResolve?.();
      });

      // Also register the pending response so we know when it's truly done
      const responsePromise = new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          info.pendingResponses.delete(messageId);
          done = true;
          resolve("Request timed out");
          finalResolve?.();
        }, CONTAINER_TIMEOUT);

        info.pendingResponses.set(messageId, (response: string) => {
          clearTimeout(timer);
          done = true;
          resolve(response);
          finalResolve?.();
        });
      });

      // Yield chunks as they arrive
      while (!done) {
        if (chunks.length > 0) {
          const chunk = chunks.shift()!;
          yield { type: "text", content: chunk };
        } else {
          // Wait for next chunk or completion
          await new Promise<void>((resolve) => {
            finalResolve = resolve;
            // Safety: if already done, resolve immediately
            if (done || chunks.length > 0) resolve();
          });
        }
      }

      // Drain remaining chunks
      while (chunks.length > 0) {
        yield { type: "text", content: chunks.shift()! };
      }

      info.streamListeners.delete(streamId);

      const response = await responsePromise;
      await addMessage(this.userId, "assistant", response);

      yield { type: "done" };
    } finally {
      info.busyCount = Math.max(0, info.busyCount - 1);
      info.streamListeners.delete(messageId);
    }
  }

  /**
   * Execute a task's prompt against the container without saving the user message
   * (it was already saved when the task was created). Returns the assistant response.
   */
  async executeForTask(prompt: string): Promise<NanoClawResponse> {
    const history = await getMessages(this.userId);
    const formattedHistory = formatMessagesAsXml(history);

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let response: string;
    let info: ContainerInfo;

    if (isContainerRunning(this.userId)) {
      info = activeContainers.get(this.userId)!;
      const messageXml = `<message from="User" timestamp="${new Date().toISOString()}">\n${escapeXml(prompt)}\n</message>`;
      await sendIpcMessage(info, messageXml);
    } else {
      info = await startContainer(this.userId, formattedHistory);
    }

    info.busyCount++;
    try {
      response = await waitForResponse(info, messageId, CONTAINER_TIMEOUT);
    } finally {
      info.busyCount = Math.max(0, info.busyCount - 1);
    }

    const savedMessage = await addMessage(this.userId, "assistant", response);

    return {
      content: response,
      messageId: savedMessage.id,
    };
  }

  async getHistory(): Promise<Message[]> {
    return getMessages(this.userId);
  }

  hasActiveContainer(): boolean {
    return isContainerRunning(this.userId);
  }

  isBusy(): boolean {
    const info = activeContainers.get(this.userId);
    return !!info && info.busyCount > 0;
  }

  async stopContainer(): Promise<void> {
    const info = activeContainers.get(this.userId);
    if (info) {
      const closePath = path.join(info.ipcDir, "input", "_close");
      await fsPromises.writeFile(closePath, "");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!info.process.killed) {
        info.process.kill("SIGTERM");
      }

      activeContainers.delete(this.userId);
    }
  }
}

export function createNanoClaw(userId: string): NanoClawService {
  return new NanoClawService(userId);
}

export async function cleanupAllContainers(): Promise<void> {
  console.log(`[NanoClaw] Cleaning up ${activeContainers.size} containers...`);

  for (const [userId, info] of activeContainers) {
    try {
      const closePath = path.join(info.ipcDir, "input", "_close");
      await fsPromises.writeFile(closePath, "");
      info.process.kill("SIGTERM");
    } catch (err) {
      console.error(`[NanoClaw] Error cleaning up container for ${userId}:`, err);
    }
  }

  activeContainers.clear();
}

process.on("SIGTERM", cleanupAllContainers);
process.on("SIGINT", cleanupAllContainers);
