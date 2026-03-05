"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DeploymentsCard } from "@/components/dashboard/deployments-card";
import { TasksCard } from "@/components/dashboard/tasks-card";
import { EmailCard } from "@/components/dashboard/email-card";
import { RevenueCard } from "@/components/dashboard/revenue-card";
import { ResearchCard } from "@/components/dashboard/research-card";
import { ChatDrawer } from "@/components/dashboard/chat-drawer";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  // TODO: restore auth redirect once .env is configured
  // useEffect(() => {
  //   if (!isPending && !session) {
  //     router.push("/login");
  //   }
  // }, [session, isPending, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const userName = session?.user?.name ?? "User";

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-semibold text-xl">Acolite</span>
          <div className="flex items-center gap-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src={session?.user?.image || ""} />
              <AvatarFallback>
                {userName[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600">{userName}</span>
            <Button variant="ghost" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {userName.split(" ")[0]}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DeploymentsCard />
          <TasksCard />
          <EmailCard />
          <RevenueCard />
          <ResearchCard />
        </div>
      </main>

      <ChatDrawer />
    </div>
  );
}
