"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/use-tasks";
import { FloatingChat } from "@/components/chat";
import { Mailboxes } from "@/components/mailboxes";
import { Input } from "@/components/ui/input";
import {
  Bot,
  Plus,
  ChevronDown,
  Sparkles,
  FileText,
  Calendar,
  Repeat,
  Globe,
  ExternalLink,
  Check,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";

function timeAgo(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { tasks } = useTasks({ parentTaskId: null });
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteInput, setWebsiteInput] = useState("");

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  // Load settings
  useEffect(() => {
    if (session?.user) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => {
          if (data.settings?.websiteUrl) {
            setWebsiteUrl(data.settings.websiteUrl);
          }
        })
        .catch(() => {});
    }
  }, [session]);

  const saveWebsite = useCallback(async () => {
    const url = websiteInput.trim();
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl: url || null }),
    });
    setWebsiteUrl(url);
    setEditingWebsite(false);
  }, [websiteInput]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  const activeTasks = tasks.filter(
    (t) => t.status === "in_progress" || t.status === "queued"
  );
  const recentTasks = tasks.slice(0, 6);
  const lastActivity = tasks.length > 0 ? tasks[0] : null;

  return (
    <div className="min-h-screen bg-white">
      {/* Top Nav */}
      <nav className="border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-xl tracking-tight">Acolite</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => setShowCreateTask(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="text-sm">
                  Menu
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  {session.user.name}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Main Content - 3 Column Grid */}
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1: Agent + Business */}
          <div className="space-y-8">
            {/* Agent Status */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                NanoClaw
              </h2>
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 border-2 border-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                  <Bot className="h-8 w-8" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm font-medium">
                      {activeTasks.length > 0 ? "Working" : "Idle"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {lastActivity
                      ? `${lastActivity.title} — ${lastActivity.status === "completed" ? "task completed" : lastActivity.status}`
                      : "No recent activity"}
                  </p>
                </div>
              </div>
            </section>

            {/* Business */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                Business
              </h2>

              {/* Website URL */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </span>
                  {!editingWebsite && (
                    <button
                      onClick={() => {
                        setWebsiteInput(websiteUrl);
                        setEditingWebsite(true);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingWebsite ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={websiteInput}
                      onChange={(e) => setWebsiteInput(e.target.value)}
                      placeholder="https://example.com"
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveWebsite();
                        if (e.key === "Escape") setEditingWebsite(false);
                      }}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={saveWebsite}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : websiteUrl ? (
                  <a
                    href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {websiteUrl.replace(/^https?:\/\//, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <button
                    onClick={() => {
                      setWebsiteInput("");
                      setEditingWebsite(true);
                    }}
                    className="text-sm text-gray-400 hover:text-gray-600"
                  >
                    Add website URL
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Revenue:</span>
                  <span className="font-medium">$0.00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Balance:</span>
                  <span className="font-medium">$0.00</span>
                </div>
              </div>
            </section>
          </div>

          {/* Column 2: Tasks + Documents */}
          <div className="space-y-8">
            {/* Tasks */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                Tasks
              </h2>
              <div className="space-y-3">
                {recentTasks.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">
                    No tasks yet. Create one to get started.
                  </p>
                ) : (
                  recentTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-gray-900 text-white rounded-lg p-4"
                    >
                      <h3 className="font-medium text-sm leading-snug">
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="text-xs text-gray-300 mt-1.5 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                          {task.status === "in_progress"
                            ? "Running"
                            : task.status === "queued"
                              ? "Queued"
                              : task.status === "completed"
                                ? "Done"
                                : task.status}
                        </span>
                        {task.schedule_type &&
                          task.schedule_type != null && (
                            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded flex items-center gap-1">
                              {task.schedule_type === "interval" ||
                              task.schedule_type === "cron" ? (
                                <Repeat className="h-3 w-3" />
                              ) : (
                                <Calendar className="h-3 w-3" />
                              )}
                              {task.schedule_type}
                            </span>
                          )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {tasks.length > 6 && (
                <p className="text-sm text-gray-500 mt-3 cursor-pointer hover:text-gray-700">
                  View all {tasks.length} tasks →
                </p>
              )}
            </section>

            {/* Documents */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                Documents
              </h2>
              {tasks
                .filter(
                  (t) =>
                    t.status === "completed" &&
                    t.last_result &&
                    t.last_result.length > 50
                )
                .slice(0, 3)
                .map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{task.title}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {timeAgo(task.updated_at || task.created_at)}
                    </span>
                  </div>
                ))}
              {tasks.filter(
                (t) =>
                  t.status === "completed" && t.last_result && t.last_result.length > 50
              ).length === 0 && (
                <p className="text-sm text-gray-400 py-2">
                  No documents yet.
                </p>
              )}
            </section>
          </div>

          {/* Column 3: Email */}
          <div>
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                Email
              </h2>
              <Mailboxes />
            </section>
          </div>
        </div>
      </main>

      {/* Floating Chat */}
      <FloatingChat />

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        onCreated={() => {}}
      />
    </div>
  );
}
