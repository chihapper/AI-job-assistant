import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { RenderableResume } from "../ai/schemas";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 40, paddingHorizontal: 48, fontSize: 10.5, fontFamily: "Helvetica", color: "#111" },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center" },
  contact: { fontSize: 9, color: "#444", textAlign: "center", marginTop: 3 },
  headline: { fontSize: 10.5, fontFamily: "Helvetica-Oblique", textAlign: "center", marginTop: 4 },
  heading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#333",
    marginTop: 12,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  entryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 1 },
  entryTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  entryMeta: { fontSize: 9, color: "#555" },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  body: { marginBottom: 2 },
});

function range(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return `${start ?? ""} – ${end ?? "Present"}`;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function ResumeDoc({ r }: { r: RenderableResume }) {
  const contactBits = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.website].filter(Boolean);
  return (
    <Document title={`${r.contact.name} — Resume`} author={r.contact.name}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{r.contact.name || "Resume"}</Text>
        {contactBits.length > 0 && <Text style={styles.contact}>{contactBits.join("  |  ")}</Text>}
        {r.headline ? <Text style={styles.headline}>{r.headline}</Text> : null}

        {r.summary ? (
          <View>
            <Text style={styles.heading}>Summary</Text>
            <Text style={styles.body}>{r.summary}</Text>
          </View>
        ) : null}

        {r.work.length > 0 && (
          <View>
            <Text style={styles.heading}>Experience</Text>
            {r.work.map((w, i) => (
              <View key={i} wrap={false}>
                <View style={styles.entryRow}>
                  <Text style={styles.entryTitle}>
                    {w.title} — {w.company}
                  </Text>
                  <Text style={styles.entryMeta}>{range(w.start, w.end)}</Text>
                </View>
                {w.location ? <Text style={styles.entryMeta}>{w.location}</Text> : null}
                {w.bullets.map((b, j) => (
                  <Bullet key={j} text={b} />
                ))}
              </View>
            ))}
          </View>
        )}

        {r.projects.length > 0 && (
          <View>
            <Text style={styles.heading}>Projects</Text>
            {r.projects.map((p, i) => (
              <View key={i} wrap={false}>
                <View style={styles.entryRow}>
                  <Text style={styles.entryTitle}>{p.name}</Text>
                </View>
                {p.description ? <Text style={styles.entryMeta}>{p.description}</Text> : null}
                {p.bullets.map((b, j) => (
                  <Bullet key={j} text={b} />
                ))}
              </View>
            ))}
          </View>
        )}

        {r.education.length > 0 && (
          <View>
            <Text style={styles.heading}>Education</Text>
            {r.education.map((e, i) => (
              <View key={i} style={styles.entryRow}>
                <Text style={styles.entryTitle}>
                  {[e.school, [e.degree, e.field].filter(Boolean).join(", ")].filter(Boolean).join(" — ")}
                </Text>
                <Text style={styles.entryMeta}>{range(e.start, e.end)}</Text>
              </View>
            ))}
          </View>
        )}

        {r.skills.length > 0 && (
          <View>
            <Text style={styles.heading}>Skills</Text>
            <Text style={styles.body}>{r.skills.join("  •  ")}</Text>
          </View>
        )}

        {r.certifications.length > 0 && (
          <View>
            <Text style={styles.heading}>Certifications</Text>
            {r.certifications.map((c, i) => (
              <Bullet key={i} text={[c.name, c.issuer, c.date].filter(Boolean).join(" — ")} />
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function resumeToPdf(r: RenderableResume): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<ResumeDoc r={r} />));
}

const letterStyles = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 64, fontSize: 11, fontFamily: "Helvetica", color: "#111", lineHeight: 1.45 },
  name: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 9.5, color: "#444", marginBottom: 18 },
  para: { marginBottom: 10 },
});

export async function coverLetterToPdf(input: {
  name: string;
  contactLine: string;
  date: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
}): Promise<Buffer> {
  const doc = (
    <Document title={`${input.name} — Cover letter`} author={input.name}>
      <Page size="LETTER" style={letterStyles.page}>
        <Text style={letterStyles.name}>{input.name}</Text>
        <Text style={letterStyles.meta}>{input.contactLine}</Text>
        <Text style={letterStyles.para}>{input.date}</Text>
        <Text style={letterStyles.para}>{input.greeting}</Text>
        {input.paragraphs.map((p, i) => (
          <Text key={i} style={letterStyles.para}>
            {p}
          </Text>
        ))}
        <Text style={letterStyles.para}>{input.closing}</Text>
        <Text>{input.name}</Text>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
