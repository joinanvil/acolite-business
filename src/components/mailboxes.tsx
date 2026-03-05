"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  X,
} from "lucide-react";

interface Mailbox {
  id: string;
  email: string;
  username: string;
  inbox_id: string;
  display_name: string | null;
  created_at: string;
}

export function Mailboxes() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadMailboxes();
  }, []);

  const loadMailboxes = async () => {
    try {
      const response = await fetch("/api/mailboxes");
      if (response.ok) {
        const data = await response.json();
        setMailboxes(data.mailboxes || []);
      }
    } catch (error) {
      console.error("Failed to load mailboxes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim()) return;

    setIsCreating(true);
    setCreateError("");

    try {
      const response = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createUsername.trim().toLowerCase(),
          displayName: createDisplayName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setCreateError(data.error || "Failed to create mailbox");
        return;
      }

      const data = await response.json();
      setMailboxes((prev) => [data.mailbox, ...prev]);
      setShowCreate(false);
      setCreateUsername("");
      setCreateDisplayName("");
    } catch (error) {
      console.error("Failed to create mailbox:", error);
      setCreateError("Failed to create mailbox");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (mailbox: Mailbox) => {
    if (!confirm(`Delete ${mailbox.email}? This cannot be undone.`)) return;

    try {
      const response = await fetch("/api/mailboxes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mailbox.id,
          inboxId: mailbox.inbox_id,
        }),
      });

      if (response.ok) {
        setMailboxes((prev) => prev.filter((m) => m.id !== mailbox.id));
      }
    } catch (error) {
      console.error("Failed to delete mailbox:", error);
    }
  };

  const handleCopy = async (email: string, id: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium">Email Inboxes</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          disabled={isCreating}
        >
          {showCreate ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="space-y-3">
            <div>
              <Label htmlFor="username" className="text-xs">
                Email Username
              </Label>
              <div className="flex items-center mt-1">
                <Input
                  id="username"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="myinbox"
                  className="text-sm"
                  disabled={isCreating}
                />
                <span className="text-sm text-gray-500 ml-2 whitespace-nowrap">
                  @agentmail.to
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="displayName" className="text-xs">
                Display Name (optional)
              </Label>
              <Input
                id="displayName"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
                placeholder="Support Inbox"
                className="text-sm mt-1"
                disabled={isCreating}
              />
            </div>
            {createError && (
              <p className="text-xs text-red-500">{createError}</p>
            )}
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={!createUsername.trim() || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Inbox"
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Mailbox List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : mailboxes.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          No email inboxes yet.
          <br />
          Create one or ask NanoClaw to set one up.
        </p>
      ) : (
        <div className="space-y-2">
          {mailboxes.map((mailbox) => (
            <div
              key={mailbox.id}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 group"
            >
              <div className="flex-1 min-w-0">
                {mailbox.display_name && (
                  <p className="text-sm font-medium truncate">
                    {mailbox.display_name}
                  </p>
                )}
                <p className="text-sm text-gray-600 truncate">{mailbox.email}</p>
                <p className="text-xs text-gray-400">
                  Created {formatDate(mailbox.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(mailbox.email, mailbox.id)}
                  className="h-8 w-8 p-0"
                >
                  {copiedId === mailbox.id ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(mailbox)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
