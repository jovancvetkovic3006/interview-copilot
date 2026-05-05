import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return NextResponse.json({ text: data.text, fileName: file.name });
    }

    if (
      file.type === "text/plain" ||
      file.type === "text/markdown" ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md")
    ) {
      const text = buffer.toString("utf-8");
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
