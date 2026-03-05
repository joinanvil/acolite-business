import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getTask, getSubtasks, getTaskLogs, updateTask, transitionTaskStatus, deleteTask, VALID_TEAMS, type TeamAgent } from "@/lib/task-queue";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const task = await getTask(id);
    if (!task || task.user_id !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [subtasks, logs] = await Promise.all([getSubtasks(id), getTaskLogs(id)]);
    return NextResponse.json({ task, subtasks, logs });
  } catch (error) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const task = await getTask(id);
    if (!task || task.user_id !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();

    if (body.status === "cancelled") {
      await transitionTaskStatus(id, "cancelled");
    } else {
      const assignedTo = body.assigned_to as TeamAgent | undefined;
      if (assignedTo && !VALID_TEAMS.includes(assignedTo)) {
        return NextResponse.json({ error: `Invalid team: ${assignedTo}` }, { status: 400 });
      }
      await updateTask(id, {
        title: body.title,
        description: body.description,
        priority: body.priority,
        assigned_to: assignedTo,
      });
    }

    const updated = await getTask(id);
    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("PATCH /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const task = await getTask(id);
    if (!task || task.user_id !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
