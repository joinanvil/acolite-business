"use client";

import { useTaskDetail } from "@/hooks/use-task-detail";
import { TaskStatusBadge } from "./task-status-badge";
import { TaskPriorityBadge } from "./task-priority-badge";
import { TaskResultViewer } from "./task-result-viewer";
import { SubtaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Trash2, XCircle } from "lucide-react";
import { useState } from "react";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

export function TaskDetail({
  taskId,
  onSelectTask,
  onRefreshList,
}: {
  taskId: string;
  onSelectTask: (id: string) => void;
  onRefreshList: () => void;
}) {
  const { task, subtasks, logs, isLoading, error } = useTaskDetail(taskId);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/execute`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Execute failed:", data.error);
      }
      onRefreshList();
    } catch (err) {
      console.error("Execute error:", err);
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
    onRefreshList();
  };

  const handleDelete = async () => {
    await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
      credentials: "include",
    });
    onSelectTask("");
    onRefreshList();
  };

  if (isLoading && !task) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        {error || "Task not found"}
      </div>
    );
  }

  const canExecute = ["todo", "queued"].includes(task.status) && !!task.prompt;
  const canCancel = ["todo", "queued", "in_progress"].includes(task.status);
  const canDelete = ["completed", "cancelled", "failed"].includes(task.status);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold">{task.title}</h2>
            <div className="flex gap-1 shrink-0">
              {canExecute && (
                <Button variant="default" size="sm" onClick={handleExecute} disabled={isExecuting}>
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Run Now
                </Button>
              )}
              {canCancel && (
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            <span className="text-xs text-gray-500">by {task.created_by}</span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">Created</span>
            <p>{formatDate(task.created_at)}</p>
          </div>
          <div>
            <span className="text-gray-500">Updated</span>
            <p>{formatDate(task.updated_at)}</p>
          </div>
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
          {task.next_run && (
            <div>
              <span className="text-gray-500">Next Run</span>
              <p>{formatDate(task.next_run)}</p>
            </div>
          )}
          {task.run_count > 0 && (
            <div>
              <span className="text-gray-500">Run Count</span>
              <p>{task.run_count}</p>
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
            </div>
          </>
        )}

        {/* Prompt */}
        {task.prompt && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Prompt</h4>
              <pre className="bg-gray-50 border rounded-md p-3 text-sm whitespace-pre-wrap">{task.prompt}</pre>
            </div>
          </>
        )}

        {/* Result */}
        {task.last_result && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Result</h4>
              <TaskResultViewer result={task.last_result} />
            </div>
          </>
        )}

        {/* Error */}
        {task.error && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-red-600 mb-1">Error</h4>
              <pre className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 whitespace-pre-wrap">
                {task.error}
              </pre>
            </div>
          </>
        )}

        {/* Subtasks */}
        {subtasks.length > 0 && (
          <>
            <Separator />
            <SubtaskList subtasks={subtasks} onSelect={onSelectTask} />
          </>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Execution Logs</h4>
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <span className={`font-medium ${
                      log.status === "completed" ? "text-green-600" :
                      log.status === "failed" ? "text-red-600" : "text-blue-600"
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-gray-400">{formatDate(log.created_at)}</span>
                    {log.duration_ms != null && (
                      <span className="text-gray-400">({(log.duration_ms / 1000).toFixed(1)}s)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
