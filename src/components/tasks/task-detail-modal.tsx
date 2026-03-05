"use client";

import { useState } from "react";
import { useTaskDetail } from "@/hooks/use-task-detail";
import { TaskStatusBadge } from "./task-status-badge";
import { TaskPriorityBadge } from "./task-priority-badge";
import { TaskResultViewer } from "./task-result-viewer";
import { SubtaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Play,
  Loader2,
  Check,
  XCircle,
} from "lucide-react";
import type { TeamAgent, TaskPriority } from "@/lib/task-queue/types";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

const TEAM_LABELS: Record<string, string> = {
  "general-manager": "General Manager",
  engineering: "Engineering",
  product: "Product",
  marketing: "Marketing",
};

export function TaskDetailModal({
  taskId,
  onClose,
  onDeleted,
}: {
  taskId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { task, subtasks, logs, isLoading, refetch } = useTaskDetail(taskId);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("normal");
  const [editTeam, setEditTeam] = useState<TeamAgent | "">("");
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditPriority(task.priority);
    setEditTeam(task.assigned_to || "");
    setIsEditing(true);
  };

  const saveEdits = async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          priority: editPriority,
          assigned_to: editTeam || undefined,
        }),
      });
      setIsEditing(false);
      refetch();
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await fetch(`/api/tasks/${taskId}/execute`, {
        method: "POST",
        credentials: "include",
      });
      refetch();
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancel = async () => {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "cancelled" }),
    });
    refetch();
  };

  const handleDelete = async () => {
    await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
      credentials: "include",
    });
    onDeleted();
  };

  if (isLoading && !task) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!task) return null;

  const canExecute = ["todo", "queued"].includes(task.status) && !!task.prompt;
  const canCancel = ["todo", "queued", "in_progress"].includes(task.status);
  const isTerminal = ["completed", "cancelled", "failed"].includes(task.status);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={onClose}
          className="text-sm border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
        >
          Close
        </button>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {isEditing ? (
            <div className="space-y-4">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-2xl font-bold border-gray-300"
                placeholder="Task title"
              />

              <div className="flex gap-3">
                <select
                  value={editTeam}
                  onChange={(e) => setEditTeam(e.target.value as TeamAgent | "")}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5"
                >
                  <option value="">No team</option>
                  <option value="general-manager">General Manager</option>
                  <option value="engineering">Engineering</option>
                  <option value="product">Product</option>
                  <option value="marketing">Marketing</option>
                </select>

                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={12}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-y"
                placeholder="Task description (supports markdown)"
              />

              <div className="flex gap-2">
                <Button onClick={saveEdits} disabled={isSaving} size="sm">
                  {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{task.title}</h1>

              {task.assigned_to && (
                <p className="text-sm text-gray-500 mt-1">
                  {TEAM_LABELS[task.assigned_to] || task.assigned_to}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3">
                <TaskStatusBadge status={task.status} />
                {task.priority !== "normal" && (
                  <TaskPriorityBadge priority={task.priority} />
                )}
                <span className="text-xs text-gray-400">
                  Created {formatDate(task.created_at)}
                </span>
              </div>

              {task.description && (
                <>
                  <Separator className="my-6" />
                  <div className="prose prose-sm prose-gray max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-3 prose-headings:my-3 prose-a:text-blue-600">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {task.description}
                    </ReactMarkdown>
                  </div>
                </>
              )}

              {task.prompt && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Prompt</h3>
                    <pre className="bg-gray-50 border rounded-lg p-4 text-sm whitespace-pre-wrap">
                      {task.prompt}
                    </pre>
                  </div>
                </>
              )}

              {task.last_result && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Result</h3>
                    <TaskResultViewer result={task.last_result} />
                  </div>
                </>
              )}

              {task.error && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="text-sm font-medium text-red-600 mb-2">Error</h3>
                    <pre className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 whitespace-pre-wrap">
                      {task.error}
                    </pre>
                  </div>
                </>
              )}

              {subtasks.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <SubtaskList subtasks={subtasks} onSelect={() => {}} />
                </>
              )}

              {/* Info grid */}
              {(task.started_at || task.completed_at || task.schedule_type || task.run_count > 0) && (
                <>
                  <Separator className="my-6" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {task.started_at && (
                      <div>
                        <span className="text-gray-500">Started</span>
                        <p>{formatDate(task.started_at)}</p>
                      </div>
                    )}
                    {task.completed_at && (
                      <div>
                        <span className="text-gray-500">Completed</span>
                        <p>{formatDate(task.completed_at)}</p>
                      </div>
                    )}
                    {task.schedule_type && (
                      <div>
                        <span className="text-gray-500">Schedule</span>
                        <p>{task.schedule_type}: {task.schedule_value}</p>
                      </div>
                    )}
                    {task.run_count > 0 && (
                      <div>
                        <span className="text-gray-500">Run Count</span>
                        <p>{task.run_count}</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {logs.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Execution Logs</h3>
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-center gap-3 text-xs">
                          <span
                            className={`font-medium ${
                              log.status === "completed"
                                ? "text-green-600"
                                : log.status === "failed"
                                  ? "text-red-600"
                                  : "text-blue-600"
                            }`}
                          >
                            {log.status}
                          </span>
                          <span className="text-gray-400">
                            {formatDate(log.created_at)}
                          </span>
                          {log.duration_ms != null && (
                            <span className="text-gray-400">
                              ({(log.duration_ms / 1000).toFixed(1)}s)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {!isEditing && (
        <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Delete
            </button>
            {!isTerminal && (
              <button
                onClick={startEditing}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Edit
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </button>
            )}
          </div>
          <div>
            {canExecute && (
              <Button onClick={handleExecute} disabled={isExecuting} size="sm">
                {isExecuting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                Run Now
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
