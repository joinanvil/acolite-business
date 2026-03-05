import { client, initDb } from "../db";
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskPolicy,
  CreatePolicyInput,
  TaskTrigger,
  CreateTriggerInput,
  TriggerEvent,
  TaskLog,
  PolicyCheckResult,
} from "./types";

let initialized = false;

export async function _resetForTests(): Promise<void> {
  initialized = false;
  await client.execute(`DELETE FROM nanoclaw_task_logs`);
  await client.execute(`DELETE FROM nanoclaw_tasks`);
  await client.execute(`DELETE FROM nanoclaw_task_policies`);
  await client.execute(`DELETE FROM nanoclaw_task_triggers`);
}

export async function initTaskQueue(): Promise<void> {
  if (initialized) return;
  await initDb();

  // Old scheduled_tasks table removed — now using nanoclaw_tasks

  // Tasks
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_tasks (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      prompt          TEXT,
      status          TEXT NOT NULL DEFAULT 'todo'
                      CHECK(status IN ('todo','queued','in_progress','completed','cancelled','failed')),
      priority        TEXT NOT NULL DEFAULT 'normal'
                      CHECK(priority IN ('urgent','high','normal','low')),
      created_by      TEXT NOT NULL DEFAULT 'human'
                      CHECK(created_by IN ('human','agent','trigger')),
      assigned_to     TEXT CHECK(assigned_to IN ('general-manager','engineering','product','marketing')),
      parent_task_id  TEXT,
      depth           INTEGER NOT NULL DEFAULT 0,
      trigger_id      TEXT,
      schedule_type   TEXT CHECK(schedule_type IN ('once','interval','cron')),
      schedule_value  TEXT,
      next_run        TEXT,
      started_at      TEXT,
      completed_at    TEXT,
      last_result     TEXT,
      error           TEXT,
      run_count       INTEGER NOT NULL DEFAULT 0,
      metadata        TEXT DEFAULT '{}',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_task_id) REFERENCES nanoclaw_tasks(id) ON DELETE CASCADE
    )
  `);

  // Add assigned_to column if missing (migration for existing databases)
  try {
    await client.execute(`ALTER TABLE nanoclaw_tasks ADD COLUMN assigned_to TEXT CHECK(assigned_to IN ('general-manager','engineering','product','marketing'))`);
  } catch {
    // Column already exists
  }

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON nanoclaw_tasks(user_id, status)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_due ON nanoclaw_tasks(status, next_run)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_parent ON nanoclaw_tasks(parent_task_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_updated ON nanoclaw_tasks(user_id, updated_at)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON nanoclaw_tasks(assigned_to, status)`);

  // Policies
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_task_policies (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT,
      policy_type     TEXT NOT NULL
                      CHECK(policy_type IN ('max_concurrent','rate_limit','time_window','spend_cap','custom')),
      config          TEXT NOT NULL DEFAULT '{}',
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_policies_user ON nanoclaw_task_policies(user_id, enabled)`);

  // Triggers
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_task_triggers (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT,
      event_type      TEXT NOT NULL
                      CHECK(event_type IN ('email_received','payment_failed','payment_succeeded',
                                           'webhook','task_completed','custom')),
      event_filter    TEXT NOT NULL DEFAULT '{}',
      task_title      TEXT NOT NULL,
      task_prompt     TEXT NOT NULL,
      task_priority   TEXT NOT NULL DEFAULT 'normal',
      enabled         INTEGER NOT NULL DEFAULT 1,
      last_fired_at   TEXT,
      fire_count      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_triggers_user ON nanoclaw_task_triggers(user_id, enabled)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_triggers_event ON nanoclaw_task_triggers(event_type, enabled)`);

  // Task Logs
  await client.execute(`
    CREATE TABLE IF NOT EXISTS nanoclaw_task_logs (
      id              TEXT PRIMARY KEY,
      task_id         TEXT NOT NULL,
      status          TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
      result          TEXT,
      error           TEXT,
      duration_ms     INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES nanoclaw_tasks(id) ON DELETE CASCADE
    )
  `);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_task_logs_task ON nanoclaw_task_logs(task_id, created_at)`);

  initialized = true;
}

// ============================================================
// Row mapping helpers
// ============================================================

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    description: row.description as string | null,
    prompt: row.prompt as string | null,
    status: row.status as TaskStatus,
    priority: row.priority as Task["priority"],
    created_by: row.created_by as Task["created_by"],
    assigned_to: (row.assigned_to as Task["assigned_to"]) ?? null,
    parent_task_id: row.parent_task_id as string | null,
    depth: row.depth as number,
    trigger_id: row.trigger_id as string | null,
    schedule_type: row.schedule_type as Task["schedule_type"],
    schedule_value: row.schedule_value as string | null,
    next_run: row.next_run as string | null,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
    last_result: row.last_result as string | null,
    error: row.error as string | null,
    run_count: row.run_count as number,
    metadata: row.metadata as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// ============================================================
// TASKS
// ============================================================

export async function createTask(input: CreateTaskInput): Promise<Task> {
  await initTaskQueue();
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  let depth = 0;
  if (input.parent_task_id) {
    const parent = await getTask(input.parent_task_id);
    if (parent) depth = parent.depth + 1;
  }

  const task: Task = {
    id,
    user_id: input.user_id,
    title: input.title,
    description: input.description ?? null,
    prompt: input.prompt ?? null,
    status: input.status ?? "todo",
    priority: input.priority ?? "normal",
    created_by: input.created_by ?? "human",
    assigned_to: input.assigned_to ?? null,
    parent_task_id: input.parent_task_id ?? null,
    depth,
    trigger_id: input.trigger_id ?? null,
    schedule_type: input.schedule_type ?? null,
    schedule_value: input.schedule_value ?? null,
    next_run: input.next_run?.toISOString() ?? null,
    started_at: null,
    completed_at: null,
    last_result: null,
    error: null,
    run_count: 0,
    metadata: JSON.stringify(input.metadata ?? {}),
    created_at: now,
    updated_at: now,
  };

  await client.execute({
    sql: `INSERT INTO nanoclaw_tasks
          (id, user_id, title, description, prompt, status, priority,
           created_by, assigned_to, parent_task_id, depth, trigger_id,
           schedule_type, schedule_value, next_run,
           metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      task.id, task.user_id, task.title, task.description, task.prompt,
      task.status, task.priority, task.created_by, task.assigned_to,
      task.parent_task_id, task.depth, task.trigger_id,
      task.schedule_type, task.schedule_value, task.next_run,
      task.metadata, task.created_at, task.updated_at,
    ],
  });

  return task;
}

export async function getTask(taskId: string): Promise<Task | null> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_tasks WHERE id = ?`,
    args: [taskId],
  });
  if (result.rows.length === 0) return null;
  return rowToTask(result.rows[0] as unknown as Record<string, unknown>);
}

export async function listTasks(
  userId: string,
  opts?: {
    status?: TaskStatus | TaskStatus[];
    priority?: Task["priority"];
    assigned_to?: Task["assigned_to"];
    parentTaskId?: string | null; // null = root only, undefined = all
    includeCompleted?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<Task[]> {
  await initTaskQueue();

  const conditions: string[] = ["user_id = ?"];
  const args: (string | number | null)[] = [userId];

  if (opts?.status) {
    if (Array.isArray(opts.status)) {
      conditions.push(`status IN (${opts.status.map(() => "?").join(",")})`);
      args.push(...opts.status);
    } else {
      conditions.push("status = ?");
      args.push(opts.status);
    }
  } else if (!opts?.includeCompleted) {
    conditions.push("status NOT IN ('completed','cancelled','failed')");
  }

  if (opts?.priority) {
    conditions.push("priority = ?");
    args.push(opts.priority);
  }

  if (opts?.assigned_to !== undefined) {
    if (opts.assigned_to === null) {
      conditions.push("assigned_to IS NULL");
    } else {
      conditions.push("assigned_to = ?");
      args.push(opts.assigned_to);
    }
  }

  if (opts?.parentTaskId === null) {
    conditions.push("parent_task_id IS NULL");
  } else if (opts?.parentTaskId !== undefined) {
    conditions.push("parent_task_id = ?");
    args.push(opts.parentTaskId);
  }

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_tasks
          WHERE ${conditions.join(" AND ")}
          ORDER BY
            CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
            created_at ASC
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function getSubtasks(parentTaskId: string): Promise<Task[]> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_tasks WHERE parent_task_id = ? ORDER BY created_at ASC`,
    args: [parentTaskId],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<void> {
  await initTaskQueue();

  const sets: string[] = ["updated_at = ?"];
  const args: (string | number | null)[] = [new Date().toISOString()];

  if (updates.title !== undefined) { sets.push("title = ?"); args.push(updates.title); }
  if (updates.description !== undefined) { sets.push("description = ?"); args.push(updates.description); }
  if (updates.prompt !== undefined) { sets.push("prompt = ?"); args.push(updates.prompt); }
  if (updates.priority !== undefined) { sets.push("priority = ?"); args.push(updates.priority); }
  if (updates.assigned_to !== undefined) { sets.push("assigned_to = ?"); args.push(updates.assigned_to); }
  if (updates.schedule_type !== undefined) { sets.push("schedule_type = ?"); args.push(updates.schedule_type); }
  if (updates.schedule_value !== undefined) { sets.push("schedule_value = ?"); args.push(updates.schedule_value); }
  if (updates.last_result !== undefined) { sets.push("last_result = ?"); args.push(updates.last_result); }
  if (updates.error !== undefined) { sets.push("error = ?"); args.push(updates.error); }
  if (updates.metadata !== undefined) { sets.push("metadata = ?"); args.push(JSON.stringify(updates.metadata)); }

  if (updates.next_run !== undefined) {
    sets.push("next_run = ?");
    args.push(updates.next_run?.toISOString() ?? null);
  }

  if (updates.status !== undefined) {
    sets.push("status = ?");
    args.push(updates.status);

    if (updates.status === "in_progress") {
      sets.push("started_at = ?");
      args.push(new Date().toISOString());
    }
    if (updates.status === "completed" || updates.status === "failed" || updates.status === "cancelled") {
      sets.push("completed_at = ?");
      args.push(new Date().toISOString());
    }
  }

  args.push(taskId);

  await client.execute({
    sql: `UPDATE nanoclaw_tasks SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function transitionTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
  result?: string,
  error?: string,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;

  const updates: UpdateTaskInput = { status: newStatus };
  if (result !== undefined) updates.last_result = result;
  if (error !== undefined) updates.error = error;

  await updateTask(taskId, updates);

  // Increment run_count when completing/failing
  if (newStatus === "completed" || newStatus === "failed") {
    await client.execute({
      sql: `UPDATE nanoclaw_tasks SET run_count = run_count + 1 WHERE id = ?`,
      args: [taskId],
    });
  }

  // For recurring interval tasks: reschedule on completion
  if (newStatus === "completed" && task.schedule_type === "interval" && task.schedule_value) {
    const intervalMs = parseInt(task.schedule_value, 10);
    const nextRun = new Date(Date.now() + intervalMs);
    await updateTask(taskId, {
      status: "queued",
      next_run: nextRun,
    });
    // Clear completed_at since it's re-queued
    await client.execute({
      sql: `UPDATE nanoclaw_tasks SET completed_at = NULL WHERE id = ?`,
      args: [taskId],
    });
  }

  // Check parent auto-completion for subtasks
  if (task.parent_task_id) {
    await checkParentCompletion(task.parent_task_id);
  }
}

export async function checkParentCompletion(parentTaskId: string): Promise<void> {
  const parent = await getTask(parentTaskId);
  if (!parent || parent.status === "completed" || parent.status === "cancelled") return;

  const subtasks = await getSubtasks(parentTaskId);
  if (subtasks.length === 0) return;

  const allTerminal = subtasks.every(
    (s) => s.status === "completed" || s.status === "cancelled" || s.status === "failed",
  );

  if (!allTerminal) return;

  const anyFailed = subtasks.some((s) => s.status === "failed");
  const results = subtasks
    .filter((s) => s.last_result)
    .map((s) => `[${s.title}]: ${s.last_result}`)
    .join("\n");

  await transitionTaskStatus(
    parentTaskId,
    anyFailed ? "failed" : "completed",
    results || "All subtasks completed.",
    anyFailed ? "One or more subtasks failed" : undefined,
  );
}

export async function getDueScheduledTasks(): Promise<Task[]> {
  await initTaskQueue();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_tasks
          WHERE status = 'queued' AND next_run IS NOT NULL AND next_run <= ?
          ORDER BY
            CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
            next_run ASC`,
    args: [now],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function getQueuedImmediateTasks(): Promise<Task[]> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_tasks
          WHERE status = 'queued' AND next_run IS NULL AND prompt IS NOT NULL
          ORDER BY
            CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
            created_at ASC
          LIMIT 10`,
    args: [],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function getQueuedTasksForTeam(team: Task["assigned_to"]): Promise<Task[]> {
  await initTaskQueue();
  if (team === null) {
    const result = await client.execute({
      sql: `SELECT * FROM nanoclaw_tasks
            WHERE status = 'queued' AND assigned_to IS NULL AND prompt IS NOT NULL AND next_run IS NULL
            ORDER BY
              CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
              created_at ASC
            LIMIT 10`,
      args: [],
    });
    return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
  }
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_tasks
          WHERE status = 'queued' AND assigned_to = ? AND prompt IS NOT NULL AND next_run IS NULL
          ORDER BY
            CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
            created_at ASC
          LIMIT 10`,
    args: [team],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function promoteScheduledTasks(): Promise<void> {
  await initTaskQueue();
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE nanoclaw_tasks
          SET status = 'queued', updated_at = ?
          WHERE status = 'todo'
            AND next_run IS NOT NULL
            AND next_run <= ?
            AND prompt IS NOT NULL`,
    args: [now, now],
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await initTaskQueue();
  await client.execute({
    sql: `DELETE FROM nanoclaw_tasks WHERE id = ?`,
    args: [taskId],
  });
}

// ============================================================
// POLICIES
// ============================================================

export async function createPolicy(input: CreatePolicyInput): Promise<TaskPolicy> {
  await initTaskQueue();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_task_policies (id, user_id, name, description, policy_type, config, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.user_id, input.name, input.description ?? null, input.policy_type, JSON.stringify(input.config), now, now],
  });

  return {
    id,
    user_id: input.user_id,
    name: input.name,
    description: input.description ?? null,
    policy_type: input.policy_type,
    config: JSON.stringify(input.config),
    enabled: true,
    created_at: now,
    updated_at: now,
  };
}

export async function listPolicies(userId: string): Promise<TaskPolicy[]> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_task_policies WHERE user_id = ? AND enabled = 1 ORDER BY created_at DESC`,
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    description: row.description as string | null,
    policy_type: row.policy_type as TaskPolicy["policy_type"],
    config: row.config as string,
    enabled: Boolean(row.enabled),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

export async function deletePolicy(policyId: string): Promise<void> {
  await initTaskQueue();
  await client.execute({
    sql: `DELETE FROM nanoclaw_task_policies WHERE id = ?`,
    args: [policyId],
  });
}

export async function checkPolicies(userId: string, task: Task): Promise<PolicyCheckResult> {
  const policies = await listPolicies(userId);
  const violations: string[] = [];

  for (const policy of policies) {
    const config = JSON.parse(policy.config);

    switch (policy.policy_type) {
      case "max_concurrent": {
        const result = await client.execute({
          sql: `SELECT COUNT(*) as cnt FROM nanoclaw_tasks WHERE user_id = ? AND status = 'in_progress'`,
          args: [userId],
        });
        const running = (result.rows[0] as unknown as Record<string, number>).cnt;
        if (running >= config.max) {
          violations.push(`${policy.name}: max concurrent tasks (${config.max}) reached`);
        }
        break;
      }
      case "rate_limit": {
        const windowStart = new Date(Date.now() - config.window_seconds * 1000).toISOString();
        const result = await client.execute({
          sql: `SELECT COUNT(*) as cnt FROM nanoclaw_tasks WHERE user_id = ? AND started_at > ?`,
          args: [userId, windowStart],
        });
        const count = (result.rows[0] as unknown as Record<string, number>).cnt;
        if (count >= config.max_tasks) {
          violations.push(`${policy.name}: rate limit (${config.max_tasks}/${config.window_seconds}s) exceeded`);
        }
        break;
      }
      case "time_window": {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: config.timezone || "UTC",
          hour: "numeric",
          hour12: false,
        });
        const hour = parseInt(formatter.format(now), 10);
        const dayFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: config.timezone || "UTC",
          weekday: "short",
        });
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const day = dayMap[dayFormatter.format(now)] ?? 0;

        if (config.allowed_hours) {
          if (hour < config.allowed_hours.start || hour >= config.allowed_hours.end) {
            violations.push(`${policy.name}: outside allowed hours (${config.allowed_hours.start}-${config.allowed_hours.end})`);
          }
        }
        if (config.days && !config.days.includes(day)) {
          violations.push(`${policy.name}: not an allowed day`);
        }
        break;
      }
    }
  }

  return { allowed: violations.length === 0, violations };
}

// ============================================================
// TRIGGERS
// ============================================================

export async function createTrigger(input: CreateTriggerInput): Promise<TaskTrigger> {
  await initTaskQueue();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_task_triggers
          (id, user_id, name, description, event_type, event_filter, task_title, task_prompt, task_priority, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, input.user_id, input.name, input.description ?? null,
      input.event_type, JSON.stringify(input.event_filter),
      input.task_title, input.task_prompt, input.task_priority ?? "normal",
      now, now,
    ],
  });

  return {
    id,
    user_id: input.user_id,
    name: input.name,
    description: input.description ?? null,
    event_type: input.event_type,
    event_filter: JSON.stringify(input.event_filter),
    task_title: input.task_title,
    task_prompt: input.task_prompt,
    task_priority: input.task_priority ?? "normal",
    enabled: true,
    last_fired_at: null,
    fire_count: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function listTriggers(userId: string): Promise<TaskTrigger[]> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_task_triggers WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    description: row.description as string | null,
    event_type: row.event_type as TaskTrigger["event_type"],
    event_filter: row.event_filter as string,
    task_title: row.task_title as string,
    task_prompt: row.task_prompt as string,
    task_priority: row.task_priority as TaskTrigger["task_priority"],
    enabled: Boolean(row.enabled),
    last_fired_at: row.last_fired_at as string | null,
    fire_count: row.fire_count as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

export async function deleteTrigger(triggerId: string): Promise<void> {
  await initTaskQueue();
  await client.execute({
    sql: `DELETE FROM nanoclaw_task_triggers WHERE id = ?`,
    args: [triggerId],
  });
}

function interpolateTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    const parts = key.split(".");
    let value: unknown = payload;
    for (const part of parts) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[part];
      } else {
        return `{{${key}}}`;
      }
    }
    return String(value ?? `{{${key}}}`);
  });
}

function matchesFilter(payload: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = payload[key];
    if (typeof expected === "object" && expected !== null) {
      const exp = expected as Record<string, unknown>;
      if ("$pattern" in exp) {
        if (!actual || !new RegExp(exp.$pattern as string).test(String(actual))) return false;
      } else if ("$gt" in exp) {
        if (typeof actual !== "number" || actual <= (exp.$gt as number)) return false;
      } else if ("$lt" in exp) {
        if (typeof actual !== "number" || actual >= (exp.$lt as number)) return false;
      }
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}

export async function fireEvent(event: TriggerEvent): Promise<Task[]> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_task_triggers WHERE event_type = ? AND enabled = 1`,
    args: [event.type],
  });

  const createdTasks: Task[] = [];

  for (const row of result.rows) {
    const trigger = {
      id: row.id as string,
      user_id: row.user_id as string,
      event_filter: row.event_filter as string,
      task_title: row.task_title as string,
      task_prompt: row.task_prompt as string,
      task_priority: row.task_priority as Task["priority"],
    };

    // Only fire triggers belonging to the event's user
    if (trigger.user_id !== event.user_id) continue;

    const filter = JSON.parse(trigger.event_filter);
    if (!matchesFilter(event.payload, filter)) continue;

    const title = interpolateTemplate(trigger.task_title, event.payload);
    const prompt = interpolateTemplate(trigger.task_prompt, event.payload);

    const task = await createTask({
      user_id: trigger.user_id,
      title,
      prompt,
      priority: trigger.task_priority,
      created_by: "trigger",
      trigger_id: trigger.id,
      status: "queued",
    });

    createdTasks.push(task);

    await client.execute({
      sql: `UPDATE nanoclaw_task_triggers SET last_fired_at = ?, fire_count = fire_count + 1 WHERE id = ?`,
      args: [new Date().toISOString(), trigger.id],
    });
  }

  return createdTasks;
}

// ============================================================
// TASK LOGS
// ============================================================

export async function addTaskLog(
  taskId: string,
  status: "started" | "completed" | "failed",
  opts?: { result?: string; error?: string; duration_ms?: number },
): Promise<TaskLog> {
  await initTaskQueue();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO nanoclaw_task_logs (id, task_id, status, result, error, duration_ms, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, taskId, status, opts?.result ?? null, opts?.error ?? null, opts?.duration_ms ?? null, now],
  });

  return {
    id,
    task_id: taskId,
    status,
    result: opts?.result ?? null,
    error: opts?.error ?? null,
    duration_ms: opts?.duration_ms ?? null,
    created_at: now,
  };
}

export async function getTaskLogs(taskId: string, limit = 50): Promise<TaskLog[]> {
  await initTaskQueue();
  const result = await client.execute({
    sql: `SELECT * FROM nanoclaw_task_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT ?`,
    args: [taskId, limit],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    task_id: row.task_id as string,
    status: row.status as TaskLog["status"],
    result: row.result as string | null,
    error: row.error as string | null,
    duration_ms: row.duration_ms as number | null,
    created_at: row.created_at as string,
  }));
}
