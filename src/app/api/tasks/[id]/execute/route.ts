import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getTask } from "@/lib/task-queue";
import { executeTaskNow } from "@/lib/task-scheduler";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const task = await getTask(id);
    if (!task || task.user_id !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!task.prompt) {
      return NextResponse.json({ error: "Task has no prompt to execute" }, { status: 400 });
    }

    if (!["todo", "queued"].includes(task.status)) {
      return NextResponse.json({ error: `Cannot execute task in '${task.status}' status` }, { status: 400 });
    }

    await executeTaskNow(id);

    return NextResponse.json({ success: true, message: "Task execution started" });
  } catch (error) {
    console.error("POST /api/tasks/[id]/execute error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
