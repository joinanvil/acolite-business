"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { DollarSign, Loader2 } from "lucide-react";

interface Charge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  created: number;
}

interface StripeData {
  configured: boolean;
  balance?: {
    available: number;
    pending: number;
    currency: string;
  };
  recentCharges?: Charge[];
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RevenueCard() {
  const [data, setData] = useState<StripeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stripe")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="h-4 w-4" />
          Revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.configured ? (
          <p className="text-sm text-muted-foreground">
            Add STRIPE_API_KEY to see revenue.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Balance */}
            <div>
              <p className="text-3xl font-bold">
                {formatCurrency(
                  data.balance?.available ?? 0,
                  data.balance?.currency ?? "usd"
                )}
              </p>
              <div className="flex gap-4 mt-1">
                <span className="text-xs text-muted-foreground">
                  Available
                </span>
                {(data.balance?.pending ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(
                      data.balance!.pending,
                      data.balance!.currency
                    )}{" "}
                    pending
                  </span>
                )}
              </div>
            </div>

            {/* Recent charges */}
            {data.recentCharges && data.recentCharges.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recent
                </p>
                {data.recentCharges.map((charge) => (
                  <div
                    key={charge.id}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm truncate mr-2">
                      {charge.description || "Payment"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium">
                        {formatCurrency(charge.amount, charge.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(charge.created)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
