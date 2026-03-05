import fs from "fs";
import path from "path";
import { createNanoClaw } from "./nanoclaw";
import {
  addMessage,
  createPayment,
  upsertDeployment,
  updateUserSettings,
} from "./db";
import {
  createTask,
  promoteScheduledTasks,
  getDueScheduledTasks,
  getQueuedImmediateTasks,
  transitionTaskStatus,
  checkPolicies,
  addTaskLog,
  listTasks,
} from "./task-queue";
import type { Task } from "./task-queue";

const GROUPS_DIR = path.join(process.cwd(), "nanoclaw-data", "groups");
const POLL_INTERVAL = 5000; // 5 seconds

function logScheduler(message: string): void {
  console.log(`[Scheduler ${new Date().toISOString()}] ${message}`);
}

// Store for IPC messages that need to be delivered to users
const pendingMessages = new Map<string, { text: string; timestamp: string }[]>();

// Track if scheduler is running
let isRunning = false;
let pollTimeout: NodeJS.Timeout | null = null;

/**
 * Get and clear pending messages for a user
 */
export function getPendingMessages(userId: string): { text: string; timestamp: string }[] {
  const messages = pendingMessages.get(userId) || [];
  pendingMessages.delete(userId);
  return messages;
}

/**
 * Get tasks for a user (from unified task queue)
 */
export async function getUserTasks(userId: string): Promise<Task[]> {
  return listTasks(userId, { status: ["todo", "queued", "in_progress"] });
}

/**
 * Cancel a task
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  try {
    await transitionTaskStatus(taskId, "cancelled");
    return true;
  } catch {
    return false;
  }
}

/**
 * Process IPC message files from containers (send_message calls)
 */
async function processIpcMessages(): Promise<void> {
  try {
    if (!fs.existsSync(GROUPS_DIR)) return;

    const groups = fs.readdirSync(GROUPS_DIR).filter((f) => {
      const stat = fs.statSync(path.join(GROUPS_DIR, f));
      return stat.isDirectory();
    });

    for (const userId of groups) {
      const messagesDir = path.join(GROUPS_DIR, userId, "ipc", "messages");
      if (!fs.existsSync(messagesDir)) continue;

      const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        const filePath = path.join(messagesDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);

          if (data.type === "message" && data.text) {
            logScheduler(`IPC message from ${userId}: ${data.text.slice(0, 50)}...`);

            // Store the message for delivery
            const userMessages = pendingMessages.get(userId) || [];
            userMessages.push({
              text: data.text,
              timestamp: data.timestamp || new Date().toISOString(),
            });
            pendingMessages.set(userId, userMessages);

            // Also save to database
            await addMessage(userId, "assistant", data.text);
          }

          // Delete processed file
          fs.unlinkSync(filePath);
        } catch (err) {
          logScheduler(`Error processing message file ${file}: ${err}`);
          try {
            fs.unlinkSync(filePath);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch (err) {
    logScheduler(`Error in processIpcMessages: ${err}`);
  }
}

/**
 * Process IPC task files from containers — creates tasks in the unified task queue
 */
async function processIpcTasks(): Promise<void> {
  try {
    if (!fs.existsSync(GROUPS_DIR)) return;

    const groups = fs.readdirSync(GROUPS_DIR).filter((f) => {
      const stat = fs.statSync(path.join(GROUPS_DIR, f));
      return stat.isDirectory();
    });

    for (const userId of groups) {
      const tasksDir = path.join(GROUPS_DIR, userId, "ipc", "tasks");
      if (!fs.existsSync(tasksDir)) continue;

      const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json"));

      if (files.length > 0) {
        logScheduler(`Found ${files.length} task file(s) in ${userId}`);
      }

      for (const file of files) {
        const filePath = path.join(tasksDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          logScheduler(`Processing task file: ${file} - ${content.slice(0, 200)}`);

          const data = JSON.parse(content);

          if (data.type === "schedule_task") {
            let nextRun: Date | undefined;
            const scheduleType = data.schedule_type || "once";

            if (scheduleType === "once") {
              const timeStr = data.schedule_value;
              if (!timeStr.endsWith('Z') && !timeStr.includes('+') && !timeStr.includes('-', 10)) {
                nextRun = new Date(timeStr + 'Z');
              } else {
                nextRun = new Date(timeStr);
              }

              logScheduler(`Parsed time: input="${timeStr}" -> nextRun=${nextRun.toISOString()}`);

              const now = new Date();
              if (nextRun.getTime() < now.getTime() - 3600000) {
                logScheduler(`Warning: Task scheduled for past time, adjusting to 1 minute from now`);
                nextRun = new Date(now.getTime() + 60000);
              }
            } else if (scheduleType === "interval") {
              const intervalMs = parseInt(data.schedule_value, 10);
              nextRun = new Date(Date.now() + intervalMs);
            } else {
              // For cron, run in 1 minute as a fallback
              nextRun = new Date(Date.now() + 60000);
            }

            // Create task in unified task queue
            const prompt = data.prompt as string;
            const task = await createTask({
              user_id: userId,
              title: prompt.slice(0, 80),
              prompt,
              status: nextRun ? "todo" : "queued",
              created_by: "agent",
              schedule_type: scheduleType,
              schedule_value: data.schedule_value,
              next_run: nextRun,
            });

            logScheduler(
              `Task created: ${task.id} for ${nextRun?.toISOString() ?? "immediate"} (prompt: ${prompt.slice(0, 50)}...)`
            );
          } else {
            logScheduler(`Unknown task type: ${data.type}`);
          }

          fs.unlinkSync(filePath);
          logScheduler(`Deleted processed file: ${file}`);
        } catch (err) {
          logScheduler(`Error processing task file ${file}: ${err}`);
          try {
            fs.unlinkSync(filePath);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch (err) {
    logScheduler(`Error in processIpcTasks: ${err}`);
  }
}

/**
 * Process IPC data files from containers (resource tracking events)
 */
async function processIpcData(): Promise<void> {
  try {
    if (!fs.existsSync(GROUPS_DIR)) return;

    const groups = fs.readdirSync(GROUPS_DIR).filter((f) => {
      const stat = fs.statSync(path.join(GROUPS_DIR, f));
      return stat.isDirectory();
    });

    for (const userId of groups) {
      const dataDir = path.join(GROUPS_DIR, userId, "ipc", "data");
      if (!fs.existsSync(dataDir)) continue;

      const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);

          if (data.type === "track_payment") {
            logScheduler(`Tracking payment for ${userId}: ${data.product_name || data.stripe_payment_id}`);
            await createPayment(
              userId,
              data.stripe_payment_id || `unknown-${Date.now()}`,
              data.amount || 0,
              data.currency || "usd",
              {
                stripeProductId: data.stripe_product_id,
                stripePriceId: data.stripe_price_id,
                paymentLinkUrl: data.payment_link_url,
                productName: data.product_name,
                type: data.payment_type === "subscription" ? "subscription" : "one_time",
              }
            );
          } else if (data.type === "track_deployment") {
            logScheduler(`Tracking deployment for ${userId}: ${data.url}`);
            await upsertDeployment(userId, data.url, {
              projectName: data.project_name,
              vercelProjectId: data.vercel_project_id,
              framework: data.framework,
            });
          } else if (data.type === "save_settings") {
            logScheduler(`Saving settings for ${userId}: ${JSON.stringify(data.settings)}`);
            if (data.settings && typeof data.settings === "object") {
              await updateUserSettings(userId, data.settings);
            }
          } else {
            logScheduler(`Unknown data type: ${data.type}`);
          }

          fs.unlinkSync(filePath);
        } catch (err) {
          logScheduler(`Error processing data file ${file}: ${err}`);
          try {
            fs.unlinkSync(filePath);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch (err) {
    logScheduler(`Error in processIpcData: ${err}`);
  }
}

/**
 * Execute due tasks from the unified task queue
 */
async function executeDueTasks(): Promise<void> {
  try {
    // Promote scheduled tasks whose time has come (todo → queued)
    await promoteScheduledTasks();

    // Get tasks ready to execute
    const dueTasks = await getDueScheduledTasks();
    const immediateTasks = await getQueuedImmediateTasks();
    const allTasks = [...dueTasks, ...immediateTasks];

    if (allTasks.length > 0) {
      logScheduler(`Found ${allTasks.length} task(s) to execute`);
    }

    for (const task of allTasks) {
      if (!task.prompt) {
        logScheduler(`Skipping task ${task.id}: no prompt`);
        continue;
      }

      logScheduler(`Executing task: ${task.id} "${task.title}" (prompt: ${task.prompt.slice(0, 50)}...)`);

      // Check policies before executing
      const policyCheck = await checkPolicies(task.user_id, task);
      if (!policyCheck.allowed) {
        logScheduler(`Task ${task.id} blocked by policies: ${policyCheck.violations.join(", ")}`);
        continue;
      }

      // Mark as in_progress
      await transitionTaskStatus(task.id, "in_progress");
      await addTaskLog(task.id, "started");
      const startTime = Date.now();

      try {
        // Create NanoClaw instance for the user
        const nanoclaw = createNanoClaw(task.user_id);

        // Execute the task prompt
        const scheduledPrompt = `[SCHEDULED TASK]\n\n${task.prompt}`;
        const response = await nanoclaw.chat(scheduledPrompt);

        // Save the response as a message from the assistant
        await addMessage(task.user_id, "assistant", `[Scheduled] ${response.content}`);

        const durationMs = Date.now() - startTime;
        logScheduler(`Task completed: ${task.id} - response: ${response.content.slice(0, 100)}...`);

        // transitionTaskStatus handles interval rescheduling internally
        await transitionTaskStatus(task.id, "completed", response.content);
        await addTaskLog(task.id, "completed", { result: response.content, duration_ms: durationMs });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorStr = String(err);
        logScheduler(`Task failed: ${task.id} - ${errorStr}`);
        await transitionTaskStatus(task.id, "failed", undefined, errorStr);
        await addTaskLog(task.id, "failed", { error: errorStr, duration_ms: durationMs });
      }
    }
  } catch (err) {
    logScheduler(`Error in executeDueTasks: ${err}`);
  }
}

/**
 * Main scheduler loop
 */
async function schedulerLoop(): Promise<void> {
  if (!isRunning) return;

  try {
    // Process new IPC task files
    await processIpcTasks();

    // Process IPC message files (send_message calls)
    await processIpcMessages();

    // Process IPC data files (resource tracking)
    await processIpcData();

    // Execute due tasks
    await executeDueTasks();
  } catch (err) {
    logScheduler(`Error in scheduler loop: ${err}`);
  }

  // Schedule next iteration
  pollTimeout = setTimeout(schedulerLoop, POLL_INTERVAL);
}

/**
 * Start the task scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    logScheduler("Already running");
    return;
  }

  logScheduler("Starting task scheduler...");
  logScheduler(`Groups directory: ${GROUPS_DIR}`);
  logScheduler(`Poll interval: ${POLL_INTERVAL}ms`);

  // Ensure groups directory exists
  if (!fs.existsSync(GROUPS_DIR)) {
    fs.mkdirSync(GROUPS_DIR, { recursive: true });
    logScheduler("Created groups directory");
  }

  isRunning = true;
  schedulerLoop();
}

/**
 * Stop the task scheduler
 */
export function stopScheduler(): void {
  logScheduler("Stopping task scheduler...");
  isRunning = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}
