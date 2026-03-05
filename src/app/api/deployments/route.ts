import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      return NextResponse.json({ configured: false });
    }

    const response = await fetch(
      "https://api.vercel.com/v6/deployments?limit=10&state=READY",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      console.error("Vercel API error:", response.status);
      return NextResponse.json({ configured: true, deployments: [] });
    }

    const data = await response.json();

    return NextResponse.json({
      configured: true,
      deployments: (data.deployments ?? []).map(
        (d: { uid: string; name: string; url: string; created: number }) => ({
          uid: d.uid,
          name: d.name,
          url: d.url,
          created: d.created,
        })
      ),
    });
  } catch (error) {
    console.error("GET /api/deployments error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
