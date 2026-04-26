import type { CheerioAPI } from "cheerio";
import type { CheckResult, FetchedPage } from "../types";
import { pageHeader, type PromptContext } from "../prompts";

const VAGUE_TERMS = [
  "powerful",
  "modern",
  "best-in-class",
  "world-class",
  "next-generation",
  "future-ready",
  "cutting-edge",
  "revolutionary",
  "seamless",
  "robust",
];

export function metadataChecks(
  page: FetchedPage,
  $: CheerioAPI,
  ctx: PromptContext
): CheckResult[] {
  const results: CheckResult[] = [];
  const title = $("title").first().text().trim();
  const metaDesc = $("meta[name='description']").attr("content")?.trim() ?? "";
  const h1s = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h1 = h1s[0] ?? "";

  let titleStatus: CheckResult["status"] = "pass";
  let titleMessage = `Title (${title.length} chars): "${title}"`;
  if (!title) {
    titleStatus = "fail";
    titleMessage = "No <title> tag found.";
  } else if (title.length > 65) {
    titleStatus = "warn";
    titleMessage = `Title is ${title.length} characters — likely truncated in SERPs (target ≤60).`;
  } else if (title.length < 15) {
    titleStatus = "warn";
    titleMessage = `Title is only ${title.length} characters — too short to communicate entity + intent.`;
  } else if (VAGUE_TERMS.some((t) => title.toLowerCase().includes(t))) {
    titleStatus = "warn";
    titleMessage = `Title contains vague marketing language: "${title}". Lead with the entity + category instead.`;
  }
  results.push({
    id: "metadata.title",
    phase: "Metadata",
    title: "Title Tag",
    status: titleStatus,
    message: titleMessage,
    fix:
      titleStatus === "pass"
        ? undefined
        : "Lead with the entity + category, ≤60 characters. Pattern: \"[Product]: [Category] for [Audience] | [Brand]\".",
    prompt:
      titleStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Rewrite the page <title> for AI search retrieval.

Constraints:
- ≤60 characters total
- Lead with the entity (product/topic name), then the category, then the audience
- No vague adjectives (powerful, modern, future-ready, best-in-class)
- No clickbait
- Pattern: "[Entity]: [Category] for [Audience] | [Brand]"

Return 3 candidate titles, one per line, each labeled "Option 1/2/3:" with character count in brackets at the end.`,
  });

  let descStatus: CheckResult["status"] = "pass";
  let descMessage = `Meta description (${metaDesc.length} chars): "${metaDesc}"`;
  if (!metaDesc) {
    descStatus = "fail";
    descMessage = "No meta description found.";
  } else if (metaDesc.length > 160) {
    descStatus = "warn";
    descMessage = `Meta description is ${metaDesc.length} characters — will be truncated (target ≤150).`;
  } else if (metaDesc.length < 50) {
    descStatus = "warn";
    descMessage = `Meta description is only ${metaDesc.length} characters — too short to set retrieval context.`;
  }
  results.push({
    id: "metadata.description",
    phase: "Metadata",
    title: "Meta Description",
    status: descStatus,
    message: descMessage,
    fix:
      descStatus === "pass"
        ? undefined
        : "Write a 50–150 char description that opens with the entity and states the page's job. Avoid adjectives in classification slots.",
    prompt:
      descStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Write a meta description for this page.

Constraints:
- 50–150 characters
- Open with the entity name, not an adjective
- State the page's specific job (definition, comparison, how-to, product overview)
- No "powerful" / "modern" / "discover the best"
- One sentence, no marketing fluff

Return only the meta description text. Append the character count in brackets at the end, e.g. [142].`,
  });

  let h1Status: CheckResult["status"] = "pass";
  let h1Message = `Single H1: "${h1}"`;
  if (!h1) {
    h1Status = "fail";
    h1Message = "No <h1> found.";
  } else if (h1s.length > 1) {
    h1Status = "warn";
    h1Message = `${h1s.length} H1 tags found — should have exactly one.`;
  } else if (
    title &&
    !sharesKeyTokens(h1, title)
  ) {
    h1Status = "warn";
    h1Message = `H1 ("${h1}") doesn't share key tokens with the title ("${title}"). Retrieval systems will be uncertain about the page's job.`;
  }
  results.push({
    id: "metadata.h1",
    phase: "Metadata",
    title: "H1 Heading",
    status: h1Status,
    message: h1Message,
    fix:
      h1Status === "pass"
        ? undefined
        : "Use exactly one H1 that mirrors the title's entity + intent. Don't lead with adjectives like 'modern' or 'future-ready'.",
    prompt:
      h1Status === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Rewrite the page <h1>.

Constraints:
- Mirror the entity + intent from the <title> tag
- Lead with the entity name, not a marketing adjective
- Match the page's primary job-to-be-done
- Conversational but specific (e.g. "Headless CMS: Definition, Architecture, and Use Cases" not "Content Creation Made Future-Ready")

Return 3 candidate H1s, one per line, each labeled "Option 1/2/3:".`,
  });

  const url = new URL(page.finalUrl);
  const slug = url.pathname.replace(/\/$/, "").split("/").pop() ?? "";
  const stopWords = ["a", "the", "and", "of", "for", "to", "in", "on", "with"];
  const slugTokens = slug.toLowerCase().split(/[-_]/).filter(Boolean);
  const stopHits = slugTokens.filter((t) => stopWords.includes(t));
  let urlStatus: CheckResult["status"] = "pass";
  let urlMessage = `Slug: "${slug || "/"}"`;
  if (slug.match(/[A-Z]/)) {
    urlStatus = "warn";
    urlMessage = `Slug contains uppercase characters: "${slug}". Prefer lowercase for consistency.`;
  } else if (slug.match(/[?&=]/) || /\d{6,}/.test(slug)) {
    urlStatus = "warn";
    urlMessage = `Slug looks like a query string or random ID: "${slug}". Use a clean, entity-based slug.`;
  } else if (stopHits.length > 0) {
    urlStatus = "warn";
    urlMessage = `Slug contains stop words (${stopHits.join(", ")}): "${slug}".`;
  }
  results.push({
    id: "metadata.url",
    phase: "Metadata",
    title: "URL Slug",
    status: urlStatus,
    message: urlMessage,
    fix:
      urlStatus === "pass"
        ? undefined
        : "Use a clean, entity-based slug (e.g., /headless-cms-guide). Avoid IDs, query strings, dates, and stop words.",
    prompt:
      urlStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Current slug: "${slug}"

Task: Suggest a clean URL slug for this page.

Constraints:
- Lowercase, hyphen-separated
- Entity-first (e.g. /headless-cms-guide, not /guide-to-headless-cms)
- No stop words (a, the, and, of, for, to)
- No IDs, query params, dates
- ≤5 words

Return 3 candidate slugs, one per line, each labeled "Option 1/2/3:" (no leading slash).`,
  });

  const og = ["og:title", "og:description", "og:image"].map((p) => ({
    p,
    v: $(`meta[property='${p}']`).attr("content"),
  }));
  const missingOg = og.filter((o) => !o.v).map((o) => o.p);
  results.push({
    id: "metadata.opengraph",
    phase: "Metadata",
    title: "Open Graph Tags",
    status: missingOg.length === 0 ? "pass" : "warn",
    message:
      missingOg.length === 0
        ? "og:title, og:description, and og:image are all present."
        : `Missing OG tags: ${missingOg.join(", ")}.`,
    fix:
      missingOg.length === 0
        ? undefined
        : "Add og:title, og:description, and og:image so social shares preview correctly and reinforce entity signals.",
    prompt:
      missingOg.length === 0
        ? undefined
        : `${pageHeader(ctx)}
Missing Open Graph tags: ${missingOg.join(", ")}

Task: Generate the missing Open Graph meta tags for this page.

Constraints:
- og:title ≤60 chars, mirrors the page <title>
- og:description ≤200 chars, mirrors the meta description
- og:image: suggest the dimensions (1200×630) and what the image should depict — describe the asset to create

Return ready-to-paste HTML <meta> tags for the missing values, plus a one-line description of the og:image asset to design.`,
  });

  return results;
}

function sharesKeyTokens(a: string, b: string): boolean {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  const at = tokens(a);
  const bt = tokens(b);
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared++;
  return shared >= 1;
}
