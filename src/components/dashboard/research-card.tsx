"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";

interface Report {
  id: string;
  title: string;
  preview: string;
  created_at: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ResearchCard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/research")
      .then((r) => r.json())
      .then((data) => setReports(data.reports || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />
          Market Research
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No research reports yet. Ask your assistant to do market research.
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{report.title}</p>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatDate(report.created_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {report.preview}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
