"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chat } from "@/components/chat";
import { Mailboxes } from "@/components/mailboxes";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-semibold text-xl">Acolite</span>
          <div className="flex items-center gap-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src={session.user.image || ""} />
              <AvatarFallback>
                {session.user.name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600">{session.user.name}</span>
            <Button variant="ghost" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {session.user.name?.split(" ")[0] || "User"}! Chat
            with your personal NanoClaw assistant below.
          </p>
        </div>

        {/* Chat Interface */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Chat />
          </div>

          <div className="space-y-4">
            <Mailboxes />

            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-medium mb-2">About Your Assistant</h3>
              <p className="text-sm text-gray-600">
                NanoClaw is your personal AI assistant. Each user gets their own
                dedicated assistant that remembers your conversation history.
              </p>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-medium mb-2">What can NanoClaw help with?</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>- Business questions and advice</li>
                <li>- Task planning and organization</li>
                <li>- Writing and communication</li>
                <li>- Data analysis and insights</li>
                <li>- General productivity assistance</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-medium mb-2">Tips</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>- Be specific with your questions</li>
                <li>- Provide context when needed</li>
                <li>- Use Clear to start a fresh conversation</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
