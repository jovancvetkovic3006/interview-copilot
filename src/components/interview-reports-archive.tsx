"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, Loader2, ExternalLink } from "lucide-react";
import type { InterviewReportMeta } from "@/lib/interview-report-meta";
import { downloadInterviewMarkdown } from "@/lib/interview-report-storage";
import { downloadInterviewPdf } from "@/lib/interview-pdf";

export function InterviewReportsArchive() {
  const [items, setItems] = useState<InterviewReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/interview-reports?limit=100");
        const data = (await res.json()) as {
          items?: InterviewReportMeta[];
          enabled?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Failed to load reports");
          setItems([]);
          return;
        }
        setEnabled(data.enabled !== false);
        setItems(data.items ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadReport = useCallback(async (meta: InterviewReportMeta, format: "md" | "pdf") => {
    setDownloading(`${meta.roomCode}-${format}`);
    try {
      const res = await fetch(`/api/interview-reports/${meta.roomCode}`);
      if (!res.ok) throw new Error("Report not found");
      const data = (await res.json()) as { markdown?: string };
      if (!data.markdown?.trim()) throw new Error("Empty report");
      if (format === "md") {
        downloadInterviewMarkdown(data.markdown, meta.roomCode);
      } else {
        downloadInterviewPdf(data.markdown, meta.roomCode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 p-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/interview"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>

        <Card data-testid="interview-reports-archive">
          <CardHeader>
            <CardTitle>Interview reports</CardTitle>
            <CardDescription>
              Archived summaries from completed interviews. Access is open for now — authentication
              will be added later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            )}
            {!loading && !enabled && (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Blob storage is not configured on this deployment. Set{" "}
                <code className="text-xs">BLOB_READ_WRITE_TOKEN</code> on Vercel to enable the
                archive.
              </p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {!loading && enabled && items.length === 0 && (
              <p className="text-sm text-zinc-500">No archived reports yet.</p>
            )}
            {items.map((item) => (
              <div
                key={item.roomCode}
                data-testid={`report-archive-${item.roomCode}`}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.candidateName}</p>
                  <p className="text-xs text-zinc-500 truncate">{item.role}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {item.roomCode}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {item.difficulty}
                    </Badge>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(item.generatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Link
                    href={`/interview/${item.roomCode}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={downloading === `${item.roomCode}-md`}
                    onClick={() => void downloadReport(item, "md")}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    .md
                  </Button>
                  <Button
                    size="sm"
                    data-testid={`download-report-pdf-${item.roomCode}`}
                    disabled={downloading === `${item.roomCode}-pdf`}
                    onClick={() => void downloadReport(item, "pdf")}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
