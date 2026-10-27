import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export class FetchPostingError extends Error {
  constructor(
    message: string,
    public hint: string,
  ) {
    super(message);
    this.name = "FetchPostingError";
  }
}

export interface FetchedPosting {
  text: string;
  finalUrl: string;
  via: "greenhouse" | "lever" | "ashby" | "jsonld" | "readability" | "plain";
}

const PASTE_HINT = "Paste the posting text or upload a PDF of it instead.";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchPostingError("That does not look like a valid URL.", PASTE_HINT);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchPostingError("Only http and https links are supported.", PASTE_HINT);
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "::1"
  ) {
    throw new FetchPostingError("Private or local addresses cannot be fetched.", PASTE_HINT);
  }
  return url;
}

async function fetchWithLimits(url: string, accept: string): Promise<{ body: string; contentType: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept, "accept-language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FetchPostingError(`The site answered with HTTP ${res.status}.`, `${PASTE_HINT} Many job boards block automated fetches.`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) {
      throw new FetchPostingError("The page is too large to process.", PASTE_HINT);
    }
    return { body: buf.toString("utf8"), contentType, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof FetchPostingError) throw err;
    const msg = err instanceof Error && err.name === "AbortError" ? "The site took too long to respond." : "The site could not be reached.";
    throw new FetchPostingError(msg, PASTE_HINT);
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToText(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;
  doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  // Keep block structure as line breaks so lists survive.
  doc.querySelectorAll("li").forEach((el) => el.insertAdjacentText("afterbegin", "• "));
  doc.querySelectorAll("p, div, li, br, h1, h2, h3, h4, h5, h6, tr, section, article").forEach((el) => {
    el.insertAdjacentText("beforeend", "\n");
  });
  return (doc.body.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(s: string): string {
  return new JSDOM(`<body>${s}</body>`).window.document.body.textContent ?? s;
}

async function fetchGreenhouse(board: string, jobId: string): Promise<FetchedPosting> {
  const api = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`;
  const { body } = await fetchWithLimits(api, "application/json");
  const job = JSON.parse(body) as {
    title?: string;
    content?: string;
    location?: { name?: string };
    company_name?: string;
    absolute_url?: string;
    updated_at?: string;
  };
  const text = [
    job.title ?? "",
    `Company: ${job.company_name ?? board}`,
    job.location?.name ? `Location: ${job.location.name}` : "",
    job.absolute_url ? `Apply: ${job.absolute_url}` : "",
    "",
    htmlToText(decodeEntities(job.content ?? "")),
  ]
    .filter((l, i) => l || i === 4)
    .join("\n");
  return { text, finalUrl: job.absolute_url ?? api, via: "greenhouse" };
}

async function fetchLever(company: string, id: string): Promise<FetchedPosting> {
  const api = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${encodeURIComponent(id)}`;
  const { body } = await fetchWithLimits(api, "application/json");
  const job = JSON.parse(body) as {
    text?: string;
    categories?: { location?: string; team?: string; commitment?: string };
    descriptionPlain?: string;
    lists?: Array<{ text: string; content: string }>;
    additionalPlain?: string;
    hostedUrl?: string;
  };
  const text = [
    job.text ?? "",
    `Company: ${company}`,
    job.categories?.location ? `Location: ${job.categories.location}` : "",
    job.categories?.team ? `Team: ${job.categories.team}` : "",
    job.categories?.commitment ? `Commitment: ${job.categories.commitment}` : "",
    "",
    job.descriptionPlain ?? "",
    ...(job.lists ?? []).flatMap((l) => [``, l.text, htmlToText(l.content)]),
    "",
    job.additionalPlain ?? "",
  ].join("\n");
  return { text, finalUrl: job.hostedUrl ?? api, via: "lever" };
}

async function fetchAshby(org: string, id: string): Promise<FetchedPosting> {
  const api = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`;
  const { body } = await fetchWithLimits(api, "application/json");
  const data = JSON.parse(body) as {
    jobs?: Array<{
      id: string;
      title: string;
      location?: string;
      descriptionPlain?: string;
      employmentType?: string;
      isRemote?: boolean;
      jobUrl?: string;
      compensation?: { compensationTierSummary?: string };
    }>;
  };
  const job = data.jobs?.find((j) => j.id === id);
  if (!job) throw new FetchPostingError("This Ashby posting was not found on the public board.", PASTE_HINT);
  const text = [
    job.title,
    `Company: ${org}`,
    job.location ? `Location: ${job.location}` : "",
    job.isRemote ? "Remote: yes" : "",
    job.employmentType ? `Employment type: ${job.employmentType}` : "",
    job.compensation?.compensationTierSummary ? `Compensation: ${job.compensation.compensationTierSummary}` : "",
    "",
    job.descriptionPlain ?? "",
  ].join("\n");
  return { text, finalUrl: job.jobUrl ?? api, via: "ashby" };
}

function extractJsonLdJobPosting(doc: Document): string | null {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const parsed = JSON.parse(script.textContent ?? "") as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        const obj = c as Record<string, unknown>;
        const graph = Array.isArray(obj?.["@graph"]) ? (obj["@graph"] as Record<string, unknown>[]) : [obj];
        for (const node of graph) {
          const type = node?.["@type"];
          const isJob = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
          if (!isJob) continue;
          const org = node.hiringOrganization as { name?: string } | undefined;
          const loc = node.jobLocation as { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } } | Array<{ address?: { addressLocality?: string } }> | undefined;
          const addr = Array.isArray(loc) ? loc[0]?.address : loc?.address;
          const salary = node.baseSalary as { value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string }; currency?: string } | undefined;
          const lines = [
            String(node.title ?? ""),
            org?.name ? `Company: ${org.name}` : "",
            addr ? `Location: ${[addr.addressLocality, (addr as { addressRegion?: string }).addressRegion, (addr as { addressCountry?: string }).addressCountry].filter(Boolean).join(", ")}` : "",
            node.jobLocationType ? `Location type: ${String(node.jobLocationType)}` : "",
            node.employmentType ? `Employment type: ${String(node.employmentType)}` : "",
            salary?.value
              ? `Compensation: ${salary.value.minValue ?? salary.value.value ?? ""}${salary.value.maxValue ? `–${salary.value.maxValue}` : ""} ${salary.currency ?? ""} ${salary.value.unitText ?? ""}`.trim()
              : "",
            node.datePosted ? `Posted: ${String(node.datePosted)}` : "",
            node.validThrough ? `Closes: ${String(node.validThrough)}` : "",
            "",
            htmlToText(String(node.description ?? "")),
          ];
          const text = lines.filter((l, i) => l || i === 9).join("\n");
          if (text.length > 200) return text;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

export async function fetchPostingFromUrl(raw: string): Promise<FetchedPosting> {
  const url = assertPublicHttpUrl(raw.trim());
  const href = url.href;

  const gh = href.match(/^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i);
  if (gh) return fetchGreenhouse(gh[1], gh[2]);
  const lv = href.match(/^https?:\/\/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]{36})/i);
  if (lv) return fetchLever(lv[1], lv[2]);
  const ab = href.match(/^https?:\/\/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]{36})/i);
  if (ab) return fetchAshby(ab[1], ab[2]);

  const { body, contentType, finalUrl } = await fetchWithLimits(href, "text/html,application/xhtml+xml,*/*;q=0.8");
  if (contentType.includes("application/json")) {
    return { text: body.slice(0, 100_000), finalUrl, via: "plain" };
  }
  if (!contentType.includes("html") && !/<html/i.test(body.slice(0, 2000))) {
    return { text: body.slice(0, 100_000), finalUrl, via: "plain" };
  }

  const dom = new JSDOM(body, { url: finalUrl });
  const doc = dom.window.document;
  const jsonLd = extractJsonLdJobPosting(doc);
  if (jsonLd) return { text: jsonLd, finalUrl, via: "jsonld" };

  const article = new Readability(doc).parse();
  const title = doc.querySelector("title")?.textContent?.trim() ?? "";
  const readable = article?.content ? htmlToText(article.content) : "";
  const text = readable.length >= 300 ? `${article?.title || title}\n\n${readable}` : htmlToText(body);
  if (text.replace(/\s+/g, " ").length < 300) {
    throw new FetchPostingError(
      "The page loaded but contained almost no readable text (it probably renders with JavaScript or requires sign-in).",
      PASTE_HINT,
    );
  }
  return { text: text.slice(0, 100_000), finalUrl, via: readable.length >= 300 ? "readability" : "plain" };
}
