import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listTasks, createTask, type TaskStatus, type TaskPriority, type TeamAgent, VALID_TEAMS } from "@/lib/task-queue";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const status = params.get("status") as TaskStatus | null;
    const priority = params.get("priority") as TaskPriority | null;
    const assigned_to = params.get("assigned_to") as TeamAgent | null;
    const parentTaskId = params.get("parent_task_id");
    const includeCompleted = params.get("include_completed") === "true";
    const limit = parseInt(params.get("limit") || "50", 10);
    const offset = parseInt(params.get("offset") || "0", 10);

    const tasks = await listTasks(session.user.id, {
      status: status || undefined,
      priority: priority || undefined,
      assigned_to: assigned_to || undefined,
      parentTaskId: parentTaskId === "root" ? null : parentTaskId || undefined,
      includeCompleted,
      limit,
      offset,
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!body.title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    let nextRun: Date | undefined;
    if (body.schedule_type && body.schedule_value) {
      if (body.schedule_type === "once") {
        nextRun = new Date(body.schedule_value);
      } else if (body.schedule_type === "interval") {
        nextRun = new Date(Date.now() + parseInt(body.schedule_value, 10));
      } else {
        nextRun = new Date(Date.now() + 60000);
      }
    }

    // Validate assigned_to if provided
    const assignedTo = body.assigned_to as TeamAgent | undefined;
    if (assignedTo && !VALID_TEAMS.includes(assignedTo)) {
      return NextResponse.json({ error: `Invalid team: ${assignedTo}. Valid: ${VALID_TEAMS.join(", ")}` }, { status: 400 });
    }

    const task = await createTask({
      user_id: session.user.id,
      title: body.title,
      prompt: body.prompt,
      description: body.description,
      priority: body.priority || "normal",
      created_by: "human",
      assigned_to: assignedTo,
      parent_task_id: body.parent_task_id,
      schedule_type: body.schedule_type,
      schedule_value: body.schedule_value,
      next_run: nextRun,
      status: body.prompt ? "queued" : "todo",
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
