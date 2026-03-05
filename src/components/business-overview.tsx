"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign, Globe, Mail } from "lucide-react";

interface Payment {
  id: string;
  product_name: string | null;
  amount: number;
  currency: string;
  payment_link_url: string | null;
  type: string;
}

interface Deployment {
  id: string;
  url: string;
  project_name: string | null;
}

interface Mailbox {
  id: string;
  email: string;
  display_name: string | null;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function BusinessOverview() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [currency, setCurrency] = useState("usd");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/payments").then((r) => r.json()),
      fetch("/api/deployments").then((r) => r.json()),
      fetch("/api/mailboxes").then((r) => r.json()),
    ])
      .then(([paymentsData, deploymentsData, mailboxesData]) => {
        setPayments(paymentsData.payments || []);
        setTotalRevenue(paymentsData.totalRevenue || 0);
        setCurrency(paymentsData.currency || "usd");
        setDeployments(deploymentsData.deployments || []);
        setMailboxes(mailboxesData.mailboxes || []);
      })
      .catch((err) => {
        console.error("Failed to load business data:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-20" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const primaryDeployment = deployments[0];
  const primaryMailbox = mailboxes[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Revenue Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-medium text-gray-500">
              Revenue
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {formatCurrency(totalRevenue, currency)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {payments.length > 0
              ? `${payments.length} payment link${payments.length !== 1 ? "s" : ""} active`
              : "No payment links yet"}
          </p>
        </CardContent>
      </Card>

      {/* Website Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-medium text-gray-500">
              Website
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {primaryDeployment ? (
            <>
              <a
                href={primaryDeployment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:underline break-all"
              >
                {primaryDeployment.url.replace(/^https?:\/\//, "")}
              </a>
              <p className="text-xs text-gray-500 mt-1">
                {primaryDeployment.project_name || "Deployed"}
                {deployments.length > 1 &&
                  ` + ${deployments.length - 1} more`}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">No website deployed yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Ask NanoClaw to build one
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mailbox Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm font-medium text-gray-500">
              Mailbox
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {primaryMailbox ? (
            <>
              <p className="text-sm font-medium break-all">
                {primaryMailbox.email}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {mailboxes.length} inbox{mailboxes.length !== 1 ? "es" : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">No email inboxes yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Create one in the sidebar
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
