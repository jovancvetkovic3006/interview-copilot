import { NextRequest, NextResponse } from "next/server";
import {
  isInterviewReportBlobEnabled,
  listInterviewReportMetas,
} from "@/lib/interview-report-blob";

/** List archived interview reports (metadata only). Open for now — auth later. */
export async function GET(req: NextRequest) {
  if (!isInterviewReportBlobEnabled()) {
    return NextResponse.json({ items: [], hasMore: false, enabled: false });
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50") || 50, 100);
  const cursor = searchParams.get("cursor") ?? undefined;
  const result = await listInterviewReportMetas({ limit, cursor });
  return NextResponse.json({ ...result, enabled: true });
}
