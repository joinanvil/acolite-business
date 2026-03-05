"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Trash2,
  Bot,
  User,
  Loader2,
  Circle,
  MessageCircle,
  X,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasActiveContainer, setHasActiveContainer] = useState(false);
  const [hasPendingTask, setHasPendingTask] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/chat");
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        setMessages(newMessages);
        setHasActiveContainer(data.hasActiveContainer || false);

        const busy = data.isBusy || false;
        setHasPendingTask(busy);

        // If the agent finished (not busy) and we have a new assistant message, stop loading
        if (!busy && newMessages.length > 0) {
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === "assistant") {
            setIsLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Poll faster when there's a pending task (waiting for response)
  useEffect(() => {
    const interval = setInterval(
      loadHistory,
      hasPendingTask || isLoading ? 2000 : hasActiveContainer ? 5000 : 10000,
    );
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadHistory();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadHistory, hasActiveContainer, hasPendingTask, isLoading]);

  useEffect(() => {
    if (scrollRef.current && messages.length > prevMessageCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const userMessage = input.trim();
      setInput("");
      setIsLoading(true);

      // Optimistically add user message
      const tempUserMessage: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: userMessage,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage }),
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        await response.json();
        setHasPendingTask(true);
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "Sorry, I encountered an error. Please make sure you have set your ANTHROPIC_API_KEY in the .env file.",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
      } finally {
        inputRef.current?.focus();
      }
    },
    [input, isLoading],
  );

  const handleClear = async () => {
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      setMessages([]);
      setHasActiveContainer(false);
      setHasPendingTask(false);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-lg border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium">NanoClaw Assistant</span>
          <div className="flex items-center gap-1 text-xs">
            <Circle
              className={`h-2 w-2 ${hasActiveContainer ? "fill-green-500 text-green-500" : "fill-gray-300 text-gray-300"}`}
            />
            <span className="text-gray-500">
              {hasPendingTask
                ? "Working..."
                : hasActiveContainer
                  ? "Connected"
                  : "Idle"}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={messages.length === 0 || isLoading}
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div ref={scrollRef} className="space-y-4">
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-gray-500">
              <Bot className="h-12 w-12 mb-4 text-gray-300" />
              <p className="text-lg font-medium">Welcome to NanoClaw</p>
              <p className="text-sm">Your personal AI assistant</p>
              <p className="text-sm mt-2">Send a message to get started</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-gray-100">
                    <Bot className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-gray-100 text-gray-500 text-sm flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-white" : "bg-gray-100"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-gray-600" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser ? "bg-primary text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm prose-gray max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-headings:my-2 prose-a:text-blue-600">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-20 right-6 w-[420px] h-[600px] z-50 shadow-2xl rounded-xl overflow-hidden border border-gray-200">
          <Chat />
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg hover:bg-gray-800 transition-colors"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  );
}
