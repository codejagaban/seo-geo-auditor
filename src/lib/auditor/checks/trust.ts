import type { CheerioAPI } from "cheerio";
import type { CheckResult, FetchedPage } from "../types";
import { pageHeader, type PromptContext } from "../prompts";

interface SchemaNode {
  "@type"?: string | string[];
  [key: string]: unknown;
}

const TRUSTED_TLDS = [".gov", ".edu", ".mil"];
const TRUSTED_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "schema.org",
  "developer.mozilla.org",
  "w3.org",
  "ietf.org",
  "nist.gov",
];

export function trustChecks(
  page: FetchedPage,
  $: CheerioAPI,
  schemas: SchemaNode[],
  ctx: PromptContext
): CheckResult[] {
  const results: CheckResult[] = [];

  const flatTypes = (node: SchemaNode): string[] => {
    const t = node["@type"];
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  };

  const orgNode = schemas.find((n) => flatTypes(n).includes("Organization"));
  const personNode = schemas.find((n) => flatTypes(n).includes("Person"));

  const sameAsOrg = (orgNode?.sameAs as string[] | undefined) ?? [];
  const sameAsStatus =
    sameAsOrg.length >= 2 ? "pass" : sameAsOrg.length === 1 ? "warn" : "info";
  results.push({
    id: "trust.organization-sameas",
    phase: "Trust & Authority",
    title: "Organization sameAs (entity links)",
    status: sameAsStatus,
    message:
      sameAsOrg.length === 0
        ? orgNode
          ? "Organization schema present but has no sameAs links."
          : "No Organization schema with sameAs found."
        : `Organization sameAs links: ${sameAsOrg.length}.`,
    fix:
      sameAsStatus === "pass"
        ? undefined
        : "Add sameAs links to LinkedIn, Wikipedia, Wikidata, Crunchbase, GitHub. This locks brand identity in the Knowledge Graph.",
    prompt:
      sameAsStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Domain: ${ctx.origin}

Task: Build the sameAs entity link list for this brand's Organization schema.

Steps:
1. Identify the brand from the page title and domain.
2. Suggest the canonical profile URLs to include in sameAs (in priority order):
   - Wikipedia article (if one exists)
   - Wikidata entity (Q-number URL)
   - LinkedIn company page
   - Crunchbase profile
   - GitHub organization
   - X / Twitter handle
   - Official YouTube channel
3. For each, give the URL pattern and mark TODO if you can't verify the exact URL exists.

Return:
1. A ready-to-paste "sameAs": [...] JSON array.
2. A 1-sentence note on which links are most worth verifying first to maximize Knowledge Graph trust.`,
  });

  results.push({
    id: "trust.person-schema",
    phase: "Trust & Authority",
    title: "Author Person schema",
    status: personNode ? "pass" : "info",
    message: personNode
      ? "Person schema present for authorship."
      : "No Person schema found.",
    fix: personNode
      ? undefined
      : "If the page is editorial, add Person schema for the author with name, jobTitle, worksFor, sameAs.",
    prompt: personNode
      ? undefined
      : `${pageHeader(ctx)}

Task: Add Person JSON-LD for the author of this page.

Steps:
1. Find the author's bio in the codebase (author page, frontmatter, CMS author record). If multiple authors exist, generate one Person block per author.
2. Generate the JSON-LD with: name, jobTitle, worksFor (Organization with name + url), url (author page on this site), description (1-sentence credentials line), sameAs (LinkedIn, X, personal site, GitHub if available), knowsAbout (3–5 specific topics they cover).
3. Insert the schema in the page <head> (or layout) so it serializes to the rendered HTML.
4. If the author byline isn't already visible on the page, add a small HTML byline snippet showing the same name + credentials.

Use <TODO: …> markers only for fields not derivable from the codebase. Report the file(s) edited.`,
  });

  const bylinePatterns = [
    /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
    /\bauthor:\s*[A-Z]/i,
    /\bwritten\s+by\s+[A-Z]/i,
  ];
  const bodyText = $("body").text();
  const hasByline =
    $("[rel='author'], [class*='author' i], [itemprop='author']").length > 0 ||
    bylinePatterns.some((p) => p.test(bodyText));
  results.push({
    id: "trust.byline",
    phase: "Trust & Authority",
    title: "Visible Author Byline",
    status: hasByline ? "pass" : "info",
    message: hasByline
      ? "An author byline is visible on the page."
      : "No visible 'By [Author]' byline detected.",
    fix: hasByline
      ? undefined
      : "Show a real author byline (not 'Admin' or 'Staff Writer'). Link to a dedicated author page with credentials.",
    prompt: hasByline
      ? undefined
      : `${pageHeader(ctx)}

Task: Design the author byline block for this page.

Output a ready-to-paste HTML snippet that includes:
- Author full name (linked to /authors/[slug])
- 1-sentence credentials line (years of experience + named expertise area)
- Avatar placeholder
- "Reviewed by" line if technical content (link to reviewer's author page)
- Visible "Published: [date]" and "Updated: [date]" stamps
- Microdata or schema.org class hooks (itemprop="author") so the schema and visible content match

Use TODO placeholders for any field I should fill in. Lead the snippet with one sentence explaining where to place this in the page (under H1, above body).`,
  });

  const hasUpdatedText = /(?:last\s+updated|updated\s+on|last\s+modified)\s*[:\-]?\s*[A-Z0-9]/i.test(
    bodyText
  );
  const hasTimeTag = $("time[datetime]").length > 0;
  results.push({
    id: "trust.last-updated",
    phase: "Trust & Authority",
    title: "Visible Last-Updated Date",
    status: hasUpdatedText || hasTimeTag ? "pass" : "info",
    message:
      hasUpdatedText || hasTimeTag
        ? "A visible date or <time> element is present."
        : "No visible 'Last updated' date detected on the page.",
    fix:
      hasUpdatedText || hasTimeTag
        ? undefined
        : "Show a visible 'Last Updated: [date]' near the H1. AI explicitly prefers content updated in the last 12 months.",
    prompt:
      hasUpdatedText || hasTimeTag
        ? undefined
        : `${pageHeader(ctx)}

Task: Generate the visible "Last Updated" component for this page.

Output:
1. The HTML snippet using semantic <time datetime="..."> with both visible date and machine-readable datetime attribute. Place under the H1.
2. A 1-line "What changed" note format the team can append on each refresh (e.g. "Updated [date] — refreshed pricing data and added new comparison row").
3. The Article schema fields to keep in sync: datePublished and dateModified, both ISO 8601.

Return ready-to-paste HTML and a short instruction sentence on where it goes.`,
  });

  const origin = new URL(page.finalUrl).hostname;
  const links = $("a[href]")
    .map((_, el) => $(el).attr("href"))
    .get()
    .filter(Boolean) as string[];

  let internal = 0;
  let externalTrusted = 0;
  let externalOther = 0;
  for (const href of links) {
    try {
      const u = new URL(href, page.finalUrl);
      if (u.hostname === origin) internal++;
      else if (
        TRUSTED_TLDS.some((tld) => u.hostname.endsWith(tld)) ||
        TRUSTED_DOMAINS.some((d) => u.hostname.endsWith(d))
      )
        externalTrusted++;
      else externalOther++;
    } catch {
      // ignore invalid URLs
    }
  }

  void externalOther;

  const evidenceStatus =
    externalTrusted >= 2 ? "pass" : externalTrusted === 1 ? "warn" : "info";
  results.push({
    id: "trust.evidence-anchors",
    phase: "Trust & Authority",
    title: "Evidence Anchors (.gov / .edu / authoritative)",
    status: evidenceStatus,
    message:
      externalTrusted === 0
        ? "No outbound links to .gov, .edu, Wikipedia, or other authoritative sources."
        : `${externalTrusted} authoritative outbound link(s) detected.`,
    fix:
      evidenceStatus === "pass"
        ? undefined
        : "Cite primary sources: official docs, standards bodies, .gov/.edu, Wikipedia. Evidence anchors strengthen accuracy and citability.",
    prompt:
      evidenceStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Suggest evidence anchors (citations) for this page.

Steps:
1. Identify the 3–5 specific factual claims on this page that most need a credible source (statistics, technical specs, regulations, definitions).
2. For each claim, suggest the most authoritative source type:
   - Official documentation (vendor docs, RFCs, W3C specs)
   - Government / standards bodies (.gov, ISO, NIST, IETF)
   - Academic (.edu, peer-reviewed)
   - Reference (Wikipedia, MDN, schema.org)
3. Give the suggested URL or URL pattern (mark TODO if you can't verify).
4. Show the inline anchor text to use — descriptive, not "click here".

Return a numbered table: claim → source type → URL → suggested anchor text.`,
  });

  const internalStatus =
    internal >= 5 ? "pass" : internal >= 2 ? "warn" : "info";
  results.push({
    id: "trust.internal-links",
    phase: "Trust & Authority",
    title: "Internal Links (topic cluster)",
    status: internalStatus,
    message: `${internal} internal link(s) detected.`,
    fix:
      internalStatus === "pass"
        ? undefined
        : "Link to 2–4 related cluster pages with descriptive anchor text. Topic clusters compound topical authority.",
    prompt:
      internalStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Suggest internal-link opportunities for this page.

Steps:
1. From the title/H1, identify the page's primary topic and 4–6 sub-topics.
2. For each sub-topic, suggest the kind of supporting cluster page that should exist on this site (pillar, comparison, how-to, glossary entry).
3. Suggest the anchor text to use (descriptive, entity-rich — not "learn more" or "this article").
4. Mark which suggestions are likely to already exist on the site vs. which represent content gaps to create.

Return a table: sub-topic → suggested cluster page type → suggested URL slug → anchor text.`,
  });

  return results;
}
