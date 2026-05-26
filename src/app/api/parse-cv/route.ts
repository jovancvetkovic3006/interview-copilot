import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MIN_USEFUL_TEXT_CHARS = 50;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Please upload a PDF under 8 MB." },
        { status: 413 }
      );
    }

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      // Import the inner module path, NOT `pdf-parse`. The package's index.js has a debug
      // block that runs when `!module.parent`, which is the case under Next.js bundling, and
      // it tries to open `./test/data/05-versions-space.pdf` — producing the ENOENT we hit.
      // Importing the inner file skips that block entirely.
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const data = await pdfParse(buffer);
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (text.length < MIN_USEFUL_TEXT_CHARS) {
        return NextResponse.json(
          {
            error:
              "Could not extract enough text from this PDF. It may be image-based (scanned). Try a text-based PDF or upload a .txt/.md file.",
          },
          { status: 422 }
        );
      }
      return NextResponse.json({ text, fileName: file.name });
    }

    if (
      file.type === "text/plain" ||
      file.type === "text/markdown" ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md")
    ) {
      const text = buffer.toString("utf-8").trim();
      if (text.length < MIN_USEFUL_TEXT_CHARS) {
        return NextResponse.json(
          { error: "File is too short to be useful (need at least ~50 characters)." },
          { status: 422 }
        );
      }
      return NextResponse.json({ text, fileName: file.name });
    }

    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF or text file." },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("CV parse error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to parse file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
