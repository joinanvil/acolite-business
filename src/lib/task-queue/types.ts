export type TaskStatus = "todo" | "queued" | "in_progress" | "completed" | "cancelled" | "failed";
export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type TaskCreatedBy = "human" | "agent" | "trigger";
export type TaskScheduleType = "once" | "interval" | "cron";
export type TeamAgent = "general-manager" | "engineering" | "product" | "marketing";

export const VALID_TEAMS: TeamAgent[] = ["general-manager", "engineering", "product", "marketing"];

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  prompt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: TaskCreatedBy;
  assigned_to: TeamAgent | null;
  parent_task_id: string | null;
  depth: number;
  trigger_id: string | null;
  schedule_type: TaskScheduleType | null;
  schedule_value: string | null;
  next_run: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_result: string | null;
  error: string | null;
  run_count: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  user_id: string;
  title: string;
  prompt?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  created_by?: TaskCreatedBy;
  assigned_to?: TeamAgent;
  parent_task_id?: string;
  trigger_id?: string;
  schedule_type?: TaskScheduleType;
  schedule_value?: string;
  next_run?: Date;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  prompt?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: TeamAgent | null;
  schedule_type?: TaskScheduleType;
  schedule_value?: string;
  next_run?: Date | null;
  last_result?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Task Policies

export type PolicyType = "max_concurrent" | "rate_limit" | "time_window" | "spend_cap" | "custom";

export interface TaskPolicy {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  policy_type: PolicyType;
  config: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePolicyInput {
  user_id: string;
  name: string;
  policy_type: PolicyType;
  config: Record<string, unknown>;
  description?: string;
}

export interface MaxConcurrentConfig {
  max: number;
}

export interface RateLimitConfig {
  max_tasks: number;
  window_seconds: number;
}

export interface TimeWindowConfig {
  allowed_hours: { start: number; end: number };
  timezone: string;
  days: number[];
}

export interface SpendCapConfig {
  max_cents: number;
  per: "task" | "day" | "month";
}

// Task Triggers

export type TriggerEventType =
  | "email_received"
  | "payment_failed"
  | "payment_succeeded"
  | "webhook"
  | "task_completed"
  | "custom";

export interface TaskTrigger {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  event_type: TriggerEventType;
  event_filter: string;
  task_title: string;
  task_prompt: string;
  task_priority: TaskPriority;
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTriggerInput {
  user_id: string;
  name: string;
  event_type: TriggerEventType;
  event_filter: Record<string, unknown>;
  task_title: string;
  task_prompt: string;
  task_priority?: TaskPriority;
  description?: string;
}

export interface TriggerEvent {
  type: TriggerEventType;
  payload: Record<string, unknown>;
  timestamp: string;
  user_id: string;
}

// Task Logs

export interface TaskLog {
  id: string;
  task_id: string;
  status: "started" | "completed" | "failed";
  result: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

// Policy check result
export interface PolicyCheckResult {
  allowed: boolean;
  violations: string[];
}
