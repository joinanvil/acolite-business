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
  updateTask,
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
 * Process IPC task files from containers — handles create_task, update_task,
 * complete_task, and legacy schedule_task types.
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

          if (data.type === "create_task") {
            // Agent-created task via MCP tool
            let nextRun: Date | undefined;
            if (data.schedule_type && data.schedule_value) {
              if (data.schedule_type === "once") {
                const timeStr = data.schedule_value;
                if (!timeStr.endsWith('Z') && !timeStr.includes('+') && !timeStr.includes('-', 10)) {
                  nextRun = new Date(timeStr + 'Z');
                } else {
                  nextRun = new Date(timeStr);
                }
                const now = new Date();
                if (nextRun.getTime() < now.getTime() - 3600000) {
                  logScheduler(`Warning: Task scheduled for past time, adjusting to 1 minute from now`);
                  nextRun = new Date(now.getTime() + 60000);
                }
              } else if (data.schedule_type === "interval") {
                nextRun = new Date(Date.now() + parseInt(data.schedule_value, 10));
              } else {
                nextRun = new Date(Date.now() + 60000);
              }
            }

            const hasSchedule = !!data.schedule_type;
            const hasPrompt = !!data.prompt;

            const task = await createTask({
              user_id: userId,
              title: data.title || (data.prompt ? (data.prompt as string).slice(0, 80) : "Untitled task"),
              description: data.description || undefined,
              prompt: data.prompt || undefined,
              status: hasSchedule ? "todo" : hasPrompt ? "queued" : "todo",
              priority: data.priority || "normal",
              created_by: data.created_by || "agent",
              parent_task_id: data.parent_task_id || undefined,
              schedule_type: data.schedule_type || undefined,
              schedule_value: data.schedule_value || undefined,
              next_run: nextRun,
            });

            logScheduler(`Task created: ${task.id} "${task.title}" (status: ${task.status})`);

          } else if (data.type === "update_task") {
            // Agent updating a task
            if (!data.task_id) {
              logScheduler(`update_task missing task_id, skipping`);
            } else {
              const updates: Record<string, unknown> = {};
              if (data.status) updates.status = data.status;
              if (data.description) updates.description = data.description;
              if (data.priority) updates.priority = data.priority;
              if (data.notes) {
                updates.metadata = { notes: data.notes };
              }
              await updateTask(data.task_id, updates as Parameters<typeof updateTask>[1]);
              logScheduler(`Task updated: ${data.task_id}`);
            }

          } else if (data.type === "complete_task") {
            // Agent marking a task complete
            if (!data.task_id) {
              logScheduler(`complete_task missing task_id, skipping`);
            } else {
              await transitionTaskStatus(data.task_id, "completed", data.result || undefined);
              await addTaskLog(data.task_id, "completed", { result: data.result || undefined });
              logScheduler(`Task completed: ${data.task_id}`);
            }

          } else if (data.type === "schedule_task") {
            // Legacy IPC format (bash echo from CLAUDE.md instructions)
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
              nextRun = new Date(Date.now() + 60000);
            }

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
 * Execute a single task. Used by both the scheduler and the manual "Run Now" endpoint.
 * All tasks are executed with a [SCHEDULED TASK] prefix. Chat messages bypass
 * the task queue entirely and go directly to the container.
 */
async function executeTask(task: Task): Promise<void> {
  if (!task.prompt) {
    logScheduler(`Skipping task ${task.id}: no prompt`);
    return;
  }

  logScheduler(`Executing task: ${task.id} "${task.title}" (prompt: ${task.prompt.slice(0, 50)}...)`);

  const policyCheck = await checkPolicies(task.user_id, task);
  if (!policyCheck.allowed) {
    logScheduler(`Task ${task.id} blocked by policies: ${policyCheck.violations.join(", ")}`);
    return;
  }

  await transitionTaskStatus(task.id, "in_progress");
  await addTaskLog(task.id, "started");
  const startTime = Date.now();

  try {
    const nanoclaw = createNanoClaw(task.user_id);
    const scheduledPrompt = `[SCHEDULED TASK]\n\n${task.prompt}`;
    const response = await nanoclaw.executeForTask(scheduledPrompt);

    const durationMs = Date.now() - startTime;
    logScheduler(`Task completed: ${task.id} - response: ${response.content.slice(0, 100)}...`);

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

/**
 * Manually trigger execution of a specific task. Returns immediately;
 * execution happens in the background.
 */
export async function executeTaskNow(taskId: string): Promise<void> {
  const { getTask } = await import("./task-queue");
  const task = await getTask(taskId);
  if (!task) throw new Error("Task not found");
  if (!task.prompt) throw new Error("Task has no prompt to execute");

  if (!["todo", "queued"].includes(task.status)) {
    throw new Error(`Task cannot be executed in '${task.status}' status`);
  }

  if (task.status === "todo") {
    await transitionTaskStatus(task.id, "queued");
  }

  executeTask(task).catch((err) => {
    logScheduler(`Manual execute failed for ${taskId}: ${err}`);
  });
}

/**
 * Execute due tasks from the unified task queue
 */
async function executeDueTasks(): Promise<void> {
  try {
    await promoteScheduledTasks();

    const dueTasks = await getDueScheduledTasks();
    const immediateTasks = await getQueuedImmediateTasks();
    const allTasks = [...dueTasks, ...immediateTasks];

    if (allTasks.length > 0) {
      logScheduler(`Found ${allTasks.length} task(s) to execute`);
    }

    for (const task of allTasks) {
      // Skip if user's container is already busy (e.g. processing a chat message)
      const nanoclaw = createNanoClaw(task.user_id);
      if (nanoclaw.isBusy()) {
        logScheduler(`Deferring task ${task.id}: container busy for user ${task.user_id}`);
        continue;
      }

      await executeTask(task);
    }
  } catch (err) {
    logScheduler(`Error in executeDueTasks: ${err}`);
  }
}

/**
 * Write a tasks snapshot to each user's IPC directory so the agent's
 * MCP list_tasks tool can read current task state.
 */
async function writeTaskSnapshots(): Promise<void> {
  try {
    if (!fs.existsSync(GROUPS_DIR)) return;

    const groups = fs.readdirSync(GROUPS_DIR).filter((f) => {
      const stat = fs.statSync(path.join(GROUPS_DIR, f));
      return stat.isDirectory();
    });

    for (const userId of groups) {
      const ipcDir = path.join(GROUPS_DIR, userId, "ipc");
      if (!fs.existsSync(ipcDir)) continue;

      try {
        const tasks = await listTasks(userId, { includeCompleted: true, limit: 100 });
        const snapshotPath = path.join(ipcDir, "current_tasks.json");
        fs.writeFileSync(snapshotPath, JSON.stringify(tasks, null, 2));
      } catch (err) {
        logScheduler(`Error writing task snapshot for ${userId}: ${err}`);
      }
    }
  } catch (err) {
    logScheduler(`Error in writeTaskSnapshots: ${err}`);
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

    // Update task snapshots for agents
    await writeTaskSnapshots();
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
