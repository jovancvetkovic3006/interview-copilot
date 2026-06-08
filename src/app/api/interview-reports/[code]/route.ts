import { NextResponse } from "next/server";
import {
  isInterviewReportBlobEnabled,
  loadInterviewReportFromBlob,
  loadInterviewReportMetaFromBlob,
} from "@/lib/interview-report-blob";
import { normalizeRoomCode } from "@/lib/interview-report-meta";

type RouteContext = { params: Promise<{ code: string }> };

/** Fetch one archived report by room code. Open for now — auth later. */
export async function GET(_req: Request, context: RouteContext) {
  const { code } = await context.params;
  const roomCode = normalizeRoomCode(code);
  if (!roomCode) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }
  if (!isInterviewReportBlobEnabled()) {
    return NextResponse.json({ error: "Report archive not configured" }, { status: 503 });
  }

  const metaOnly = new URL(_req.url).searchParams.get("meta") === "1";
  if (metaOnly) {
    const meta = await loadInterviewReportMetaFromBlob(roomCode);
    if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(meta);
  }

  const report = await loadInterviewReportFromBlob(roomCode);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const meta = await loadInterviewReportMetaFromBlob(roomCode);
  return NextResponse.json({ ...report, meta });
}
