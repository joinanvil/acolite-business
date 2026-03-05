"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Globe, ExternalLink, Loader2 } from "lucide-react";

interface Deployment {
  uid: string;
  name: string;
  url: string;
  created: number;
}

interface DeploymentsData {
  configured: boolean;
  deployments?: Deployment[];
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DeploymentsCard() {
  const [data, setData] = useState<DeploymentsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deployments")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" />
          Websites
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.configured ? (
          <p className="text-sm text-muted-foreground">
            Add VERCEL_TOKEN to see deployments.
          </p>
        ) : !data.deployments?.length ? (
          <p className="text-sm text-muted-foreground">
            No deployments yet. Ask your assistant to build a website.
          </p>
        ) : (
          <div className="space-y-3">
            {data.deployments.map((d) => (
              <a
                key={d.uid}
                href={`https://${d.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between group hover:bg-muted/50 -mx-2 px-2 py-1.5 rounded-md transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.url}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(d.created)}
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
