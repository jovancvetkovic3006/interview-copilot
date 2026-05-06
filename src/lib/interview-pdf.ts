import { jsPDF } from "jspdf";

/** Strip common markdown markers for a readable plain-text PDF. */
function markdownToPlain(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
    .trim();
}

export function downloadInterviewPdf(markdown: string, roomCode: string) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  const lineHeight = 14;
  const plain = markdownToPlain(markdown);
  const lines = doc.splitTextToSize(plain, maxW);

  doc.setFontSize(11);
  let y = margin;
  for (let i = 0; i < lines.length; i++) {
    if (y + lineHeight > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines[i] as string, margin, y);
    y += lineHeight;
  }

  const safe = roomCode.replace(/[^\w-]/g, "_");
  doc.save(`interview-summary-${safe}.pdf`);
}
