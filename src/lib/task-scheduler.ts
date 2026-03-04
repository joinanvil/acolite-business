import fs from "fs";
import path from "path";
import { createNanoClaw } from "./nanoclaw";
import { addMessage } from "./db";

const GROUPS_DIR = path.join(process.cwd(), "nanoclaw-data", "groups");
const POLL_INTERVAL = 5000; // 5 seconds

interface ScheduledTask {
  id: string;
  userId: string;
  prompt: string;
  scheduleType: "once" | "cron" | "interval";
  scheduleValue: string;
  nextRun: Date;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
}

// In-memory task store (could be moved to database)
const tasks = new Map<string, ScheduledTask>();

// Track if scheduler is running
let isRunning = false;
let pollTimeout: NodeJS.Timeout | null = null;

/**
 * Process IPC task files from containers
 */
async function processIpcTasks(): Promise<void> {
  try {
    // Find all group directories
    if (!fs.existsSync(GROUPS_DIR)) return;

    const groups = fs.readdirSync(GROUPS_DIR);

    for (const userId of groups) {
      const tasksDir = path.join(GROUPS_DIR, userId, "ipc", "tasks");
      if (!fs.existsSync(tasksDir)) continue;

      const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        const filePath = path.join(tasksDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

          if (data.type === "schedule_task") {
            const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            let nextRun: Date;
            if (data.schedule_type === "once") {
              nextRun = new Date(data.schedule_value);
            } else {
              // For now, only support "once" - could add cron/interval later
              nextRun = new Date(Date.now() + 60000); // Default 1 minute
            }

            const task: ScheduledTask = {
              id: taskId,
              userId,
              prompt: data.prompt,
              scheduleType: data.schedule_type || "once",
              scheduleValue: data.schedule_value,
              nextRun,
              status: "pending",
              createdAt: new Date(),
            };

            tasks.set(taskId, task);
            console.log(`[Scheduler] Task scheduled: ${taskId} for ${nextRun.toISOString()}`);
          }

          // Delete processed file
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`[Scheduler] Error processing task file ${file}:`, err);
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
    console.error("[Scheduler] Error processing IPC tasks:", err);
  }
}

/**
 * Execute due tasks
 */
async function executeDueTasks(): Promise<void> {
  const now = new Date();

  for (const [taskId, task] of tasks) {
    if (task.status !== "pending") continue;
    if (task.nextRun > now) continue;

    console.log(`[Scheduler] Executing task: ${taskId}`);
    task.status = "running";

    try {
      // Create NanoClaw instance for the user
      const nanoclaw = createNanoClaw(task.userId);

      // Execute the task prompt
      const response = await nanoclaw.chat(task.prompt);

      // Save the response as a message from the assistant
      await addMessage(task.userId, "assistant", `[Scheduled Task] ${response.content}`);

      task.status = "completed";
      console.log(`[Scheduler] Task completed: ${taskId}`);

      // Remove completed one-time tasks
      if (task.scheduleType === "once") {
        tasks.delete(taskId);
      }
    } catch (err) {
      console.error(`[Scheduler] Task failed: ${taskId}`, err);
      task.status = "failed";
    }
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

    // Execute due tasks
    await executeDueTasks();
  } catch (err) {
    console.error("[Scheduler] Error in scheduler loop:", err);
  }

  // Schedule next iteration
  pollTimeout = setTimeout(schedulerLoop, POLL_INTERVAL);
}

/**
 * Start the task scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    console.log("[Scheduler] Already running");
    return;
  }

  console.log("[Scheduler] Starting task scheduler...");
  isRunning = true;
  schedulerLoop();
}

/**
 * Stop the task scheduler
 */
export function stopScheduler(): void {
  console.log("[Scheduler] Stopping task scheduler...");
  isRunning = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

/**
 * Get all scheduled tasks for a user
 */
export function getUserTasks(userId: string): ScheduledTask[] {
  return Array.from(tasks.values()).filter((t) => t.userId === userId);
}

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (task && task.status === "pending") {
    tasks.delete(taskId);
    return true;
  }
  return false;
}
