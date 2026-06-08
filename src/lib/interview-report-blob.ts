import { get, list, put } from "@vercel/blob";
import {
  BLOB_REPORT_PREFIX,
  type InterviewReportMeta,
  normalizeRoomCode,
  reportFromStored,
  reportMarkdownPath,
  reportMetaPath,
} from "@/lib/interview-report-meta";
import type { InterviewReport } from "@/types/room";

export function isInterviewReportBlobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export async function saveInterviewReportToBlob(
  roomCode: string,
  report: InterviewReport,
  meta: InterviewReportMeta
): Promise<boolean> {
  if (!isInterviewReportBlobEnabled()) return false;
  const code = normalizeRoomCode(roomCode);
  await put(reportMarkdownPath(code), report.markdown, {
    access: "private",
    contentType: "text/markdown; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  await put(reportMetaPath(code), JSON.stringify({ ...meta, roomCode: code }), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return true;
}

export async function loadInterviewReportFromBlob(roomCode: string): Promise<InterviewReport | null> {
  if (!isInterviewReportBlobEnabled()) return null;
  try {
    const result = await get(reportMarkdownPath(roomCode), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    const markdown = await new Response(result.stream).text();
    if (!markdown.trim()) return null;

    let generatedAt = Date.now();
    try {
      const metaResult = await get(reportMetaPath(roomCode), { access: "private" });
      if (metaResult?.statusCode === 200) {
        const metaRaw = await new Response(metaResult.stream).text();
        const meta = JSON.parse(metaRaw) as InterviewReportMeta;
        if (typeof meta.generatedAt === "number") generatedAt = meta.generatedAt;
      }
    } catch {
      /* meta optional for timestamp */
    }
    return reportFromStored(markdown.trim(), generatedAt);
  } catch {
    return null;
  }
}

export async function loadInterviewReportMetaFromBlob(
  roomCode: string
): Promise<InterviewReportMeta | null> {
  if (!isInterviewReportBlobEnabled()) return null;
  try {
    const result = await get(reportMetaPath(roomCode), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    const raw = await new Response(result.stream).text();
    const meta = JSON.parse(raw) as InterviewReportMeta;
    if (!meta.roomCode || !meta.generatedAt) return null;
    return meta;
  } catch {
    return null;
  }
}

export interface InterviewReportListResult {
  items: InterviewReportMeta[];
  cursor?: string;
  hasMore: boolean;
}

/** List completed reports via meta.json blobs under interview-reports/. */
export async function listInterviewReportMetas(options?: {
  limit?: number;
  cursor?: string;
}): Promise<InterviewReportListResult> {
  if (!isInterviewReportBlobEnabled()) {
    return { items: [], hasMore: false };
  }
  const limit = options?.limit ?? 50;
  const { blobs, cursor, hasMore } = await list({
    prefix: `${BLOB_REPORT_PREFIX}/`,
    limit: Math.min(limit * 3, 1000),
    cursor: options?.cursor,
  });

  const metaBlobs = blobs.filter((b) => b.pathname.endsWith("/meta.json"));
  const items: InterviewReportMeta[] = [];

  for (const blob of metaBlobs.slice(0, limit)) {
    try {
      const res = await fetch(blob.url);
      if (!res.ok) continue;
      const meta = (await res.json()) as InterviewReportMeta;
      if (meta.roomCode && meta.generatedAt) items.push(meta);
    } catch {
      /* skip corrupt entry */
    }
  }

  items.sort((a, b) => b.generatedAt - a.generatedAt);
  return { items, cursor, hasMore };
}
