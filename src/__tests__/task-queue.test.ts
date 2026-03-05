import { describe, it, expect, beforeAll, beforeEach } from "vitest";

process.env.NANOCLAW_DB_URL = "file::memory:";

import {
  initTaskQueue,
  _resetForTests,
  createTask,
  getTask,
  listTasks,
  getSubtasks,
  updateTask,
  transitionTaskStatus,
  deleteTask,
  getQueuedImmediateTasks,
  getQueuedTasksForTeam,
  getDueScheduledTasks,
  promoteScheduledTasks,
  createPolicy,
  listPolicies,
  deletePolicy,
  checkPolicies,
  createTrigger,
  listTriggers,
  deleteTrigger,
  fireEvent,
  addTaskLog,
  getTaskLogs,
  type Task,
  type TeamAgent,
  VALID_TEAMS,
} from "@/lib/task-queue";

const USER_ID = "test-user-1";

beforeAll(async () => {
  await initTaskQueue();
});

beforeEach(async () => {
  await _resetForTests();
});

// ============================================================
// TASK CRUD
// ============================================================

describe("Task CRUD", () => {
  it("creates a task with default values", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Test task" });
    expect(task.id).toMatch(/^task-/);
    expect(task.user_id).toBe(USER_ID);
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("normal");
    expect(task.created_by).toBe("human");
    expect(task.assigned_to).toBeNull();
    expect(task.parent_task_id).toBeNull();
    expect(task.depth).toBe(0);
    expect(task.run_count).toBe(0);
  });

  it("creates a task with all optional fields", async () => {
    const nextRun = new Date(Date.now() + 60_000);
    const task = await createTask({
      user_id: USER_ID,
      title: "Full task",
      description: "A detailed description",
      prompt: "Do the thing",
      status: "queued",
      priority: "high",
      created_by: "agent",
      assigned_to: "engineering",
      schedule_type: "once",
      schedule_value: nextRun.toISOString(),
      next_run: nextRun,
      metadata: { source: "test" },
    });

    expect(task.description).toBe("A detailed description");
    expect(task.prompt).toBe("Do the thing");
    expect(task.status).toBe("queued");
    expect(task.priority).toBe("high");
    expect(task.created_by).toBe("agent");
    expect(task.assigned_to).toBe("engineering");
    expect(task.schedule_type).toBe("once");
    expect(task.next_run).toBe(nextRun.toISOString());
    expect(JSON.parse(task.metadata)).toEqual({ source: "test" });
  });

  it("retrieves a task by ID", async () => {
    const created = await createTask({ user_id: USER_ID, title: "Retrieve me" });
    const fetched = await getTask(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe("Retrieve me");
  });

  it("returns null for nonexistent task", async () => {
    const result = await getTask("nonexistent-id");
    expect(result).toBeNull();
  });

  it("updates task fields", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Original" });
    await updateTask(task.id, {
      title: "Updated",
      description: "New desc",
      priority: "urgent",
      assigned_to: "marketing",
    });

    const updated = await getTask(task.id);
    expect(updated!.title).toBe("Updated");
    expect(updated!.description).toBe("New desc");
    expect(updated!.priority).toBe("urgent");
    expect(updated!.assigned_to).toBe("marketing");
    expect(updated!.updated_at).toBeTruthy();
  });

  it("sets assigned_to to null", async () => {
    const task = await createTask({
      user_id: USER_ID,
      title: "Assigned",
      assigned_to: "engineering",
    });
    expect(task.assigned_to).toBe("engineering");

    await updateTask(task.id, { assigned_to: null });
    const updated = await getTask(task.id);
    expect(updated!.assigned_to).toBeNull();
  });

  it("deletes a task", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Delete me" });
    await deleteTask(task.id);
    const result = await getTask(task.id);
    expect(result).toBeNull();
  });
});

// ============================================================
// TEAM ASSIGNMENT
// ============================================================

describe("Team assignment", () => {
  it("validates VALID_TEAMS constant", () => {
    expect(VALID_TEAMS).toEqual(["general-manager", "engineering", "product", "marketing"]);
  });

  it("creates tasks assigned to each valid team", async () => {
    for (const team of VALID_TEAMS) {
      const task = await createTask({
        user_id: USER_ID,
        title: `Task for ${team}`,
        assigned_to: team,
      });
      expect(task.assigned_to).toBe(team);
    }
  });

  it("filters tasks by assigned_to", async () => {
    await createTask({ user_id: USER_ID, title: "Eng task", assigned_to: "engineering" });
    await createTask({ user_id: USER_ID, title: "Mkt task", assigned_to: "marketing" });
    await createTask({ user_id: USER_ID, title: "Unassigned" });

    const engTasks = await listTasks(USER_ID, { assigned_to: "engineering" });
    expect(engTasks).toHaveLength(1);
    expect(engTasks[0].title).toBe("Eng task");

    const mktTasks = await listTasks(USER_ID, { assigned_to: "marketing" });
    expect(mktTasks).toHaveLength(1);
    expect(mktTasks[0].title).toBe("Mkt task");

    const unassigned = await listTasks(USER_ID, { assigned_to: null });
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].title).toBe("Unassigned");
  });

  it("getQueuedTasksForTeam returns only queued tasks for a team", async () => {
    await createTask({ user_id: USER_ID, title: "Eng queued", assigned_to: "engineering", status: "queued", prompt: "do work" });
    await createTask({ user_id: USER_ID, title: "Eng todo", assigned_to: "engineering", status: "todo", prompt: "plan" });
    await createTask({ user_id: USER_ID, title: "Mkt queued", assigned_to: "marketing", status: "queued", prompt: "post" });
    await createTask({ user_id: USER_ID, title: "Unassigned queued", status: "queued", prompt: "something" });

    const engQueued = await getQueuedTasksForTeam("engineering");
    expect(engQueued).toHaveLength(1);
    expect(engQueued[0].title).toBe("Eng queued");

    const mktQueued = await getQueuedTasksForTeam("marketing");
    expect(mktQueued).toHaveLength(1);
    expect(mktQueued[0].title).toBe("Mkt queued");

    const unassignedQueued = await getQueuedTasksForTeam(null);
    expect(unassignedQueued).toHaveLength(1);
    expect(unassignedQueued[0].title).toBe("Unassigned queued");
  });

  it("reassigns a task from one team to another", async () => {
    const task = await createTask({
      user_id: USER_ID,
      title: "Reassign me",
      assigned_to: "product",
    });
    expect(task.assigned_to).toBe("product");

    await updateTask(task.id, { assigned_to: "engineering" });
    const updated = await getTask(task.id);
    expect(updated!.assigned_to).toBe("engineering");
  });
});

// ============================================================
// LISTING & FILTERING
// ============================================================

describe("Task listing and filtering", () => {
  beforeEach(async () => {
    await createTask({ user_id: USER_ID, title: "Urgent", priority: "urgent" });
    await createTask({ user_id: USER_ID, title: "High", priority: "high" });
    await createTask({ user_id: USER_ID, title: "Normal", priority: "normal" });
    await createTask({ user_id: USER_ID, title: "Low", priority: "low" });
  });

  it("lists tasks ordered by priority", async () => {
    const tasks = await listTasks(USER_ID);
    expect(tasks.map((t) => t.priority)).toEqual(["urgent", "high", "normal", "low"]);
  });

  it("filters by priority", async () => {
    const urgent = await listTasks(USER_ID, { priority: "urgent" });
    expect(urgent).toHaveLength(1);
    expect(urgent[0].title).toBe("Urgent");
  });

  it("filters by single status", async () => {
    await createTask({ user_id: USER_ID, title: "Queued", status: "queued" });
    const queued = await listTasks(USER_ID, { status: "queued" });
    expect(queued).toHaveLength(1);
    expect(queued[0].title).toBe("Queued");
  });

  it("filters by multiple statuses", async () => {
    await createTask({ user_id: USER_ID, title: "Queued", status: "queued" });
    const tasks = await listTasks(USER_ID, { status: ["todo", "queued"] });
    expect(tasks).toHaveLength(5);
  });

  it("excludes completed tasks by default", async () => {
    await transitionTaskStatus((await listTasks(USER_ID))[0].id, "completed");
    const tasks = await listTasks(USER_ID);
    expect(tasks).toHaveLength(3);
  });

  it("includes completed tasks when requested", async () => {
    const all = await listTasks(USER_ID);
    await transitionTaskStatus(all[0].id, "completed");
    const withCompleted = await listTasks(USER_ID, { includeCompleted: true });
    expect(withCompleted).toHaveLength(4);
  });

  it("respects limit and offset", async () => {
    const page1 = await listTasks(USER_ID, { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = await listTasks(USER_ID, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);

    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("isolates tasks by user_id", async () => {
    await createTask({ user_id: "other-user", title: "Other user task" });
    const myTasks = await listTasks(USER_ID);
    expect(myTasks.every((t) => t.user_id === USER_ID)).toBe(true);
  });
});

// ============================================================
// STATUS TRANSITIONS
// ============================================================

describe("Status transitions", () => {
  it("transitions todo → queued → in_progress → completed", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Flow" });
    expect(task.status).toBe("todo");

    await transitionTaskStatus(task.id, "queued");
    let t = await getTask(task.id);
    expect(t!.status).toBe("queued");

    await transitionTaskStatus(task.id, "in_progress");
    t = await getTask(task.id);
    expect(t!.status).toBe("in_progress");
    expect(t!.started_at).not.toBeNull();

    await transitionTaskStatus(task.id, "completed", "All done");
    t = await getTask(task.id);
    expect(t!.status).toBe("completed");
    expect(t!.completed_at).not.toBeNull();
    expect(t!.last_result).toBe("All done");
    expect(t!.run_count).toBe(1);
  });

  it("records error on failure", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Fail" });
    await transitionTaskStatus(task.id, "in_progress");
    await transitionTaskStatus(task.id, "failed", undefined, "Boom");

    const t = await getTask(task.id);
    expect(t!.status).toBe("failed");
    expect(t!.error).toBe("Boom");
    expect(t!.run_count).toBe(1);
  });

  it("cancels a task", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Cancel me" });
    await transitionTaskStatus(task.id, "cancelled");
    const t = await getTask(task.id);
    expect(t!.status).toBe("cancelled");
    expect(t!.completed_at).not.toBeNull();
  });
});

// ============================================================
// SUBTASKS & PARENT COMPLETION
// ============================================================

describe("Subtasks and parent auto-completion", () => {
  it("creates subtasks with correct depth", async () => {
    const parent = await createTask({ user_id: USER_ID, title: "Parent" });
    const child = await createTask({
      user_id: USER_ID,
      title: "Child",
      parent_task_id: parent.id,
    });
    const grandchild = await createTask({
      user_id: USER_ID,
      title: "Grandchild",
      parent_task_id: child.id,
    });

    expect(parent.depth).toBe(0);
    expect(child.depth).toBe(1);
    expect(grandchild.depth).toBe(2);
  });

  it("lists subtasks of a parent", async () => {
    const parent = await createTask({ user_id: USER_ID, title: "Parent" });
    await createTask({ user_id: USER_ID, title: "Sub 1", parent_task_id: parent.id });
    await createTask({ user_id: USER_ID, title: "Sub 2", parent_task_id: parent.id });

    const subs = await getSubtasks(parent.id);
    expect(subs).toHaveLength(2);
    expect(subs.map((s) => s.title).sort()).toEqual(["Sub 1", "Sub 2"]);
  });

  it("filters root-only tasks", async () => {
    const parent = await createTask({ user_id: USER_ID, title: "Root" });
    await createTask({ user_id: USER_ID, title: "Child", parent_task_id: parent.id });

    const roots = await listTasks(USER_ID, { parentTaskId: null });
    expect(roots).toHaveLength(1);
    expect(roots[0].title).toBe("Root");
  });

  it("auto-completes parent when all subtasks complete", async () => {
    const parent = await createTask({ user_id: USER_ID, title: "Parent", status: "in_progress" });
    const sub1 = await createTask({ user_id: USER_ID, title: "Sub 1", parent_task_id: parent.id });
    const sub2 = await createTask({ user_id: USER_ID, title: "Sub 2", parent_task_id: parent.id });

    await transitionTaskStatus(sub1.id, "completed", "Result 1");
    let p = await getTask(parent.id);
    expect(p!.status).toBe("in_progress");

    await transitionTaskStatus(sub2.id, "completed", "Result 2");
    p = await getTask(parent.id);
    expect(p!.status).toBe("completed");
    expect(p!.last_result).toContain("Sub 1");
    expect(p!.last_result).toContain("Sub 2");
  });

  it("marks parent as failed when any subtask fails", async () => {
    const parent = await createTask({ user_id: USER_ID, title: "Parent", status: "in_progress" });
    const sub1 = await createTask({ user_id: USER_ID, title: "Sub 1", parent_task_id: parent.id });
    const sub2 = await createTask({ user_id: USER_ID, title: "Sub 2", parent_task_id: parent.id });

    await transitionTaskStatus(sub1.id, "completed", "OK");
    await transitionTaskStatus(sub2.id, "failed", undefined, "Oops");

    const p = await getTask(parent.id);
    expect(p!.status).toBe("failed");
    expect(p!.error).toBe("One or more subtasks failed");
  });

  it("does not auto-complete parent when cancelled subtask remains with pending", async () => {
    const parent = await createTask({ user_id: USER_ID, title: "Parent", status: "in_progress" });
    const sub1 = await createTask({ user_id: USER_ID, title: "Sub 1", parent_task_id: parent.id });
    const sub2 = await createTask({ user_id: USER_ID, title: "Sub 2", parent_task_id: parent.id });

    await transitionTaskStatus(sub1.id, "cancelled");
    const p = await getTask(parent.id);
    expect(p!.status).toBe("in_progress");
  });
});

// ============================================================
// SCHEDULING
// ============================================================

describe("Scheduling", () => {
  it("promotes scheduled tasks when due", async () => {
    const past = new Date(Date.now() - 60_000);
    await createTask({
      user_id: USER_ID,
      title: "Due task",
      prompt: "run me",
      status: "todo",
      schedule_type: "once",
      schedule_value: past.toISOString(),
      next_run: past,
    });

    await promoteScheduledTasks();
    const tasks = await listTasks(USER_ID, { status: "queued" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Due task");
  });

  it("does not promote future tasks", async () => {
    const future = new Date(Date.now() + 3_600_000);
    await createTask({
      user_id: USER_ID,
      title: "Future task",
      prompt: "later",
      status: "todo",
      schedule_type: "once",
      schedule_value: future.toISOString(),
      next_run: future,
    });

    await promoteScheduledTasks();
    const tasks = await listTasks(USER_ID, { status: "queued" });
    expect(tasks).toHaveLength(0);
  });

  it("getDueScheduledTasks returns queued tasks past their next_run", async () => {
    const past = new Date(Date.now() - 5_000);
    await createTask({
      user_id: USER_ID,
      title: "Due scheduled",
      prompt: "go",
      status: "queued",
      schedule_type: "interval",
      schedule_value: "60000",
      next_run: past,
    });

    const due = await getDueScheduledTasks();
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe("Due scheduled");
  });

  it("reschedules interval tasks after completion", async () => {
    const task = await createTask({
      user_id: USER_ID,
      title: "Recurring",
      prompt: "repeat",
      status: "in_progress",
      schedule_type: "interval",
      schedule_value: "60000",
    });

    await transitionTaskStatus(task.id, "completed", "Done once");
    const t = await getTask(task.id);
    expect(t!.status).toBe("queued");
    expect(t!.next_run).not.toBeNull();
    expect(t!.completed_at).toBeNull();
  });

  it("getQueuedImmediateTasks returns only non-scheduled queued tasks", async () => {
    await createTask({ user_id: USER_ID, title: "Immediate", status: "queued", prompt: "now" });
    await createTask({
      user_id: USER_ID,
      title: "Scheduled",
      status: "queued",
      prompt: "later",
      next_run: new Date(Date.now() + 60_000),
    });

    const immediate = await getQueuedImmediateTasks();
    expect(immediate).toHaveLength(1);
    expect(immediate[0].title).toBe("Immediate");
  });
});

// ============================================================
// POLICIES
// ============================================================

describe("Policies", () => {
  it("creates and lists policies", async () => {
    const policy = await createPolicy({
      user_id: USER_ID,
      name: "Max 3 concurrent",
      policy_type: "max_concurrent",
      config: { max: 3 },
    });

    expect(policy.id).toBeTruthy();
    expect(policy.name).toBe("Max 3 concurrent");
    expect(policy.policy_type).toBe("max_concurrent");
    expect(JSON.parse(policy.config)).toEqual({ max: 3 });
    expect(policy.enabled).toBe(true);

    const policies = await listPolicies(USER_ID);
    expect(policies).toHaveLength(1);
  });

  it("deletes a policy", async () => {
    const policy = await createPolicy({
      user_id: USER_ID,
      name: "Temp",
      policy_type: "rate_limit",
      config: { max_tasks: 10, window_seconds: 3600 },
    });

    await deletePolicy(policy.id);
    const policies = await listPolicies(USER_ID);
    expect(policies).toHaveLength(0);
  });

  it("enforces max_concurrent policy", async () => {
    await createPolicy({
      user_id: USER_ID,
      name: "Max 1",
      policy_type: "max_concurrent",
      config: { max: 1 },
    });

    const task1 = await createTask({ user_id: USER_ID, title: "Running", status: "in_progress" });
    const task2 = await createTask({ user_id: USER_ID, title: "Waiting" });

    const check = await checkPolicies(USER_ID, task2);
    expect(check.allowed).toBe(false);
    expect(check.violations).toHaveLength(1);
    expect(check.violations[0]).toContain("max concurrent");
  });

  it("allows task when under max_concurrent limit", async () => {
    await createPolicy({
      user_id: USER_ID,
      name: "Max 2",
      policy_type: "max_concurrent",
      config: { max: 2 },
    });

    await createTask({ user_id: USER_ID, title: "Running", status: "in_progress" });
    const task2 = await createTask({ user_id: USER_ID, title: "Another" });

    const check = await checkPolicies(USER_ID, task2);
    expect(check.allowed).toBe(true);
    expect(check.violations).toHaveLength(0);
  });

  it("enforces rate_limit policy", async () => {
    await createPolicy({
      user_id: USER_ID,
      name: "Rate limit",
      policy_type: "rate_limit",
      config: { max_tasks: 1, window_seconds: 3600 },
    });

    const task1 = await createTask({ user_id: USER_ID, title: "Started" });
    await transitionTaskStatus(task1.id, "in_progress");

    const task2 = await createTask({ user_id: USER_ID, title: "Another" });
    const check = await checkPolicies(USER_ID, task2);
    expect(check.allowed).toBe(false);
    expect(check.violations[0]).toContain("rate limit");
  });
});

// ============================================================
// TRIGGERS
// ============================================================

describe("Triggers", () => {
  it("creates and lists triggers", async () => {
    const trigger = await createTrigger({
      user_id: USER_ID,
      name: "On payment failed",
      event_type: "payment_failed",
      event_filter: { amount: { $gt: 1000 } },
      task_title: "Investigate payment failure",
      task_prompt: "Look into the failed payment for {{customer}}",
    });

    expect(trigger.id).toBeTruthy();
    expect(trigger.event_type).toBe("payment_failed");
    expect(trigger.fire_count).toBe(0);

    const triggers = await listTriggers(USER_ID);
    expect(triggers).toHaveLength(1);
  });

  it("deletes a trigger", async () => {
    const trigger = await createTrigger({
      user_id: USER_ID,
      name: "Temp",
      event_type: "webhook",
      event_filter: {},
      task_title: "Temp",
      task_prompt: "temp",
    });

    await deleteTrigger(trigger.id);
    const triggers = await listTriggers(USER_ID);
    expect(triggers).toHaveLength(0);
  });

  it("fires a trigger and creates a task", async () => {
    await createTrigger({
      user_id: USER_ID,
      name: "On email",
      event_type: "email_received",
      event_filter: {},
      task_title: "Reply to {{sender}}",
      task_prompt: "Draft a reply to {{sender}} about {{subject}}",
      task_priority: "high",
    });

    const tasks = await fireEvent({
      type: "email_received",
      payload: { sender: "alice@example.com", subject: "Partnership" },
      timestamp: new Date().toISOString(),
      user_id: USER_ID,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Reply to alice@example.com");
    expect(tasks[0].prompt).toBe("Draft a reply to alice@example.com about Partnership");
    expect(tasks[0].priority).toBe("high");
    expect(tasks[0].status).toBe("queued");
    expect(tasks[0].created_by).toBe("trigger");
  });

  it("respects event_filter with $gt operator", async () => {
    await createTrigger({
      user_id: USER_ID,
      name: "Big payment fails",
      event_type: "payment_failed",
      event_filter: { amount: { $gt: 5000 } },
      task_title: "Alert: big payment failed",
      task_prompt: "Investigate",
    });

    const small = await fireEvent({
      type: "payment_failed",
      payload: { amount: 1000 },
      timestamp: new Date().toISOString(),
      user_id: USER_ID,
    });
    expect(small).toHaveLength(0);

    const big = await fireEvent({
      type: "payment_failed",
      payload: { amount: 10000 },
      timestamp: new Date().toISOString(),
      user_id: USER_ID,
    });
    expect(big).toHaveLength(1);
  });

  it("respects event_filter with $pattern operator", async () => {
    await createTrigger({
      user_id: USER_ID,
      name: "VIP emails",
      event_type: "email_received",
      event_filter: { sender: { $pattern: "@vip\\.com$" } },
      task_title: "VIP email from {{sender}}",
      task_prompt: "Handle VIP",
    });

    const noMatch = await fireEvent({
      type: "email_received",
      payload: { sender: "random@gmail.com" },
      timestamp: new Date().toISOString(),
      user_id: USER_ID,
    });
    expect(noMatch).toHaveLength(0);

    const match = await fireEvent({
      type: "email_received",
      payload: { sender: "ceo@vip.com" },
      timestamp: new Date().toISOString(),
      user_id: USER_ID,
    });
    expect(match).toHaveLength(1);
  });

  it("does not fire triggers for other users", async () => {
    await createTrigger({
      user_id: USER_ID,
      name: "My trigger",
      event_type: "webhook",
      event_filter: {},
      task_title: "Handle",
      task_prompt: "Do it",
    });

    const tasks = await fireEvent({
      type: "webhook",
      payload: {},
      timestamp: new Date().toISOString(),
      user_id: "other-user",
    });
    expect(tasks).toHaveLength(0);
  });

  it("increments fire_count on trigger", async () => {
    const trigger = await createTrigger({
      user_id: USER_ID,
      name: "Counter",
      event_type: "custom",
      event_filter: {},
      task_title: "Custom",
      task_prompt: "Go",
    });

    await fireEvent({ type: "custom", payload: {}, timestamp: new Date().toISOString(), user_id: USER_ID });
    await fireEvent({ type: "custom", payload: {}, timestamp: new Date().toISOString(), user_id: USER_ID });

    const triggers = await listTriggers(USER_ID);
    const updated = triggers.find((t) => t.id === trigger.id);
    expect(updated!.fire_count).toBe(2);
    expect(updated!.last_fired_at).not.toBeNull();
  });
});

// ============================================================
// TASK LOGS
// ============================================================

describe("Task logs", () => {
  it("adds and retrieves logs for a task", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Logged" });

    const log1 = await addTaskLog(task.id, "started");
    const log2 = await addTaskLog(task.id, "completed", { result: "Success", duration_ms: 1500 });

    expect(log1.status).toBe("started");
    expect(log2.result).toBe("Success");
    expect(log2.duration_ms).toBe(1500);

    const logs = await getTaskLogs(task.id);
    expect(logs).toHaveLength(2);
    expect(logs[0].created_at >= logs[1].created_at || logs[0].status === "completed").toBe(true);
  });

  it("records error in log", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Error" });
    const log = await addTaskLog(task.id, "failed", { error: "Timeout", duration_ms: 30000 });
    expect(log.error).toBe("Timeout");
    expect(log.duration_ms).toBe(30000);
  });

  it("respects log limit", async () => {
    const task = await createTask({ user_id: USER_ID, title: "Many logs" });
    for (let i = 0; i < 5; i++) {
      await addTaskLog(task.id, "started");
    }

    const limited = await getTaskLogs(task.id, 3);
    expect(limited).toHaveLength(3);
  });
});

// ============================================================
// TEAM QUEUE PRIORITY ORDERING
// ============================================================

describe("Team queue priority ordering", () => {
  it("returns team-queued tasks ordered by priority then created_at", async () => {
    await createTask({ user_id: USER_ID, title: "Low prio", assigned_to: "engineering", status: "queued", prompt: "lo", priority: "low" });
    await createTask({ user_id: USER_ID, title: "Urgent", assigned_to: "engineering", status: "queued", prompt: "hi", priority: "urgent" });
    await createTask({ user_id: USER_ID, title: "Normal", assigned_to: "engineering", status: "queued", prompt: "mid", priority: "normal" });

    const tasks = await getQueuedTasksForTeam("engineering");
    expect(tasks.map((t) => t.title)).toEqual(["Urgent", "Normal", "Low prio"]);
  });
});

// ============================================================
// END-TO-END: GM → Team Agent delegation flow
// ============================================================

describe("End-to-end: GM delegation flow", () => {
  it("simulates GM creating and assigning tasks to teams", async () => {
    const gmTask = await createTask({
      user_id: USER_ID,
      title: "Launch product X",
      description: "Coordinate all teams to launch product X",
      created_by: "human",
      assigned_to: "general-manager",
      status: "in_progress",
    });

    const engTask = await createTask({
      user_id: USER_ID,
      title: "Build landing page for X",
      prompt: "Create a responsive landing page for product X with Stripe checkout",
      created_by: "agent",
      assigned_to: "engineering",
      parent_task_id: gmTask.id,
      status: "queued",
      priority: "high",
    });

    const mktTask = await createTask({
      user_id: USER_ID,
      title: "Draft launch announcement",
      prompt: "Write a Twitter thread and LinkedIn post announcing product X",
      created_by: "agent",
      assigned_to: "marketing",
      parent_task_id: gmTask.id,
      status: "queued",
    });

    const productTask = await createTask({
      user_id: USER_ID,
      title: "Competitor analysis for X",
      prompt: "Research top 5 competitors for product X and create a comparison",
      created_by: "agent",
      assigned_to: "product",
      parent_task_id: gmTask.id,
      status: "queued",
    });

    const subs = await getSubtasks(gmTask.id);
    expect(subs).toHaveLength(3);
    expect(subs.every((s) => s.depth === 1)).toBe(true);

    const engQueue = await getQueuedTasksForTeam("engineering");
    expect(engQueue).toHaveLength(1);
    expect(engQueue[0].id).toBe(engTask.id);

    const mktQueue = await getQueuedTasksForTeam("marketing");
    expect(mktQueue).toHaveLength(1);

    await transitionTaskStatus(engTask.id, "in_progress");
    await transitionTaskStatus(engTask.id, "completed", "Landing page deployed at https://x.example.com");

    await transitionTaskStatus(mktTask.id, "in_progress");
    await transitionTaskStatus(mktTask.id, "completed", "Thread posted: https://twitter.com/...");

    await transitionTaskStatus(productTask.id, "in_progress");
    await transitionTaskStatus(productTask.id, "completed", "Report generated");

    const gm = await getTask(gmTask.id);
    expect(gm!.status).toBe("completed");
    expect(gm!.last_result).toContain("Landing page deployed");
    expect(gm!.last_result).toContain("Thread posted");
    expect(gm!.last_result).toContain("Report generated");

    const logs = await getTaskLogs(engTask.id);
    expect(logs).toHaveLength(0);
    await addTaskLog(engTask.id, "completed", { result: "Deployed", duration_ms: 120000 });
    const engLogs = await getTaskLogs(engTask.id);
    expect(engLogs).toHaveLength(1);
  });
});
