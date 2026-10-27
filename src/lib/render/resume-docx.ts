import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { RenderableResume } from "../ai/schemas";

const FONT = "Calibri";

function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return `${start ?? ""} – ${end ?? "Present"}`;
}

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT, color: "333333" })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 21, font: FONT })],
  });
}

function entryLine(left: string, right: string, bold = true): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
    children: [
      new TextRun({ text: left, bold, size: 22, font: FONT }),
      new TextRun({ text: `\t${right}`, size: 20, font: FONT, color: "555555" }),
    ],
  });
}

export async function resumeToDocx(r: RenderableResume): Promise<Buffer> {
  const contactBits = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.website].filter(Boolean);
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: r.contact.name || "Resume", bold: true, size: 36, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: contactBits.join("  |  "), size: 20, font: FONT, color: "444444" })],
    }),
  ];
  if (r.headline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: r.headline, italics: true, size: 22, font: FONT })],
      }),
    );
  }
  if (r.summary) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: r.summary, size: 21, font: FONT })] }));
  }
  if (r.work.length > 0) {
    children.push(heading("Experience"));
    for (const w of r.work) {
      children.push(entryLine(`${w.title} — ${w.company}`, dateRange(w.start, w.end)));
      if (w.location) {
        children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: w.location, size: 20, font: FONT, color: "666666" })] }));
      }
      for (const b of w.bullets) children.push(bullet(b));
    }
  }
  if (r.projects.length > 0) {
    children.push(heading("Projects"));
    for (const p of r.projects) {
      children.push(entryLine(p.name, "", true));
      if (p.description) {
        children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: p.description, size: 20, font: FONT, color: "555555" })] }));
      }
      for (const b of p.bullets) children.push(bullet(b));
    }
  }
  if (r.education.length > 0) {
    children.push(heading("Education"));
    for (const e of r.education) {
      const left = [e.school, [e.degree, e.field].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
      children.push(entryLine(left, dateRange(e.start, e.end)));
      if (e.notes) {
        children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: e.notes, size: 20, font: FONT, color: "555555" })] }));
      }
    }
  }
  if (r.skills.length > 0) {
    children.push(heading("Skills"));
    children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: r.skills.join("  •  "), size: 21, font: FONT })] }));
  }
  if (r.certifications.length > 0) {
    children.push(heading("Certifications"));
    for (const c of r.certifications) {
      children.push(bullet([c.name, c.issuer, c.date].filter(Boolean).join(" — ")));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 864, right: 864 } } },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
