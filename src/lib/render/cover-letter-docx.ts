import { Document, Packer, Paragraph, TextRun } from "docx";

const FONT = "Calibri";

function para(text: string, opts: { bold?: boolean; color?: string; size?: number; after?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: opts.after ?? 200, line: 300 },
    children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size ?? 22, font: FONT })],
  });
}

export async function coverLetterToDocx(input: {
  name: string;
  contactLine: string;
  date: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
}): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1296, right: 1296 } } },
        children: [
          para(input.name, { bold: true, size: 28, after: 40 }),
          para(input.contactLine, { color: "555555", size: 19, after: 320 }),
          para(input.date),
          para(input.greeting),
          ...input.paragraphs.map((p) => para(p)),
          para(input.closing, { after: 60 }),
          para(input.name, { after: 0 }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
