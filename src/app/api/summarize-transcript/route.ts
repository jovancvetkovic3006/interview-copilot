import { NextRequest, NextResponse } from "next/server";
import { summarizeTranscript, type TranscriptLine } from "@/lib/summarize-transcript";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, role, difficulty, topics, candidateName } = body as {
      transcript?: TranscriptLine[];
      role?: string;
      difficulty?: string;
      topics?: string[];
      candidateName?: string;
    };

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json({ error: "transcript array is required" }, { status: 400 });
    }

    const summary = await summarizeTranscript({
      transcript,
      role,
      difficulty,
      topics,
      candidateName,
    });
    if (!summary) {
      return NextResponse.json({ error: "Empty model response" }, { status: 500 });
    }
    return NextResponse.json({ summary });
  } catch (error: unknown) {
    console.error("summarize-transcript error:", error);
    let message = "Failed to summarize transcript";
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
