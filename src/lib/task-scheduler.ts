import fs from "fs";
import path from "path";
import { createNanoClaw } from "./nanoclaw";
import {
  addMessage,
  createScheduledTask,
  getDueTasks,
  getScheduledTasksForUser,
  updateTaskStatus,
  deleteScheduledTask,
  type ScheduledTask,
} from "./db";

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
 * Get scheduled tasks for a user (delegates to db)
 */
export async function getUserTasks(userId: string): Promise<ScheduledTask[]> {
  return getScheduledTasksForUser(userId);
}

/**
 * Cancel a task
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  try {
    await deleteScheduledTask(taskId);
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
 * Process IPC task files from containers
 */
async function processIpcTasks(): Promise<void> {
  try {
    // Find all group directories
    if (!fs.existsSync(GROUPS_DIR)) {
      return;
    }

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
            let nextRun: Date;
            if (data.schedule_type === "once") {
              // Parse local time - schedule_value is in local time without Z suffix
              // e.g., "2026-03-04T18:33:17" means 6:33 PM local time
              const localTimeStr = data.schedule_value;

              // If it doesn't have a timezone, treat as local time
              if (!localTimeStr.endsWith('Z') && !localTimeStr.includes('+') && !localTimeStr.includes('-', 10)) {
                // Parse as local time by creating a date object
                // JavaScript's Date constructor treats strings without timezone as local
                nextRun = new Date(localTimeStr);
              } else {
                nextRun = new Date(localTimeStr);
              }

              logScheduler(`Parsed time: input="${localTimeStr}" -> nextRun=${nextRun.toISOString()} (local: ${nextRun.toString()})`);
            } else if (data.schedule_type === "interval") {
              const intervalMs = parseInt(data.schedule_value, 10);
              nextRun = new Date(Date.now() + intervalMs);
            } else {
              // For cron, run in 1 minute as a fallback
              nextRun = new Date(Date.now() + 60000);
            }

            // Create task in database
            const task = await createScheduledTask(
              userId,
              data.prompt,
              data.schedule_type || "once",
              data.schedule_value,
              nextRun
            );

            logScheduler(
              `Task created: ${task.id} for ${nextRun.toISOString()} (prompt: ${data.prompt.slice(0, 50)}...)`
            );
          } else {
            logScheduler(`Unknown task type: ${data.type}`);
          }

          // Delete processed file
          fs.unlinkSync(filePath);
          logScheduler(`Deleted processed file: ${file}`);
        } catch (err) {
          logScheduler(`Error processing task file ${file}: ${err}`);
          // Move to failed directory or delete
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
 * Execute due tasks
 */
async function executeDueTasks(): Promise<void> {
  try {
    const dueTasks = await getDueTasks();

    if (dueTasks.length > 0) {
      logScheduler(`Found ${dueTasks.length} due task(s)`);
    }

    for (const task of dueTasks) {
      logScheduler(`Executing task: ${task.id} (prompt: ${task.prompt.slice(0, 50)}...)`);

      // Mark as running
      await updateTaskStatus(task.id, "running");

      try {
        // Create NanoClaw instance for the user
        const nanoclaw = createNanoClaw(task.user_id);

        // Execute the task prompt as a scheduled task
        const scheduledPrompt = `[SCHEDULED TASK]\n\n${task.prompt}`;
        const response = await nanoclaw.chat(scheduledPrompt);

        // Save the response as a message from the assistant
        await addMessage(task.user_id, "assistant", `[Scheduled] ${response.content}`);

        logScheduler(`Task completed: ${task.id} - response: ${response.content.slice(0, 100)}...`);

        // Handle based on schedule type
        if (task.schedule_type === "once") {
          await updateTaskStatus(task.id, "completed", response.content);
          logScheduler(`One-time task completed: ${task.id}`);
        } else if (task.schedule_type === "interval") {
          // Reschedule for next interval
          const intervalMs = parseInt(task.schedule_value, 10);
          const nextRun = new Date(Date.now() + intervalMs);
          await updateTaskStatus(task.id, "pending", response.content, nextRun);
          logScheduler(`Rescheduled interval task: ${task.id} for ${nextRun.toISOString()}`);
        } else {
          // For cron, mark as completed (would need cron parser for proper rescheduling)
          await updateTaskStatus(task.id, "completed", response.content);
        }
      } catch (err) {
        logScheduler(`Task failed: ${task.id} - ${err}`);
        await updateTaskStatus(task.id, "failed", String(err));
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
