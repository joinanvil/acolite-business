import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createStripeClient } from "@/lib/stripe";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripe = createStripeClient();
    if (!stripe) {
      return NextResponse.json({ configured: false });
    }

    const [balance, charges] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 5 }),
    ]);

    const available = balance.available[0];

    return NextResponse.json({
      configured: true,
      balance: {
        available: available?.amount ?? 0,
        pending: balance.pending[0]?.amount ?? 0,
        currency: available?.currency ?? "usd",
      },
      recentCharges: charges.data.map((charge) => ({
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        description: charge.description,
        created: charge.created,
      })),
    });
  } catch (error) {
    console.error("GET /api/stripe error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
