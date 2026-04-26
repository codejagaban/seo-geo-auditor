import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "../types";
import { pageHeader, type PromptContext } from "../prompts";

interface SchemaNode {
  "@type"?: string | string[];
  "@graph"?: SchemaNode[];
  [key: string]: unknown;
}

export function structuredDataChecks(
  $: CheerioAPI,
  ctx: PromptContext
): {
  results: CheckResult[];
  schemas: SchemaNode[];
} {
  const results: CheckResult[] = [];
  const blocks = $("script[type='application/ld+json']").toArray();

  const schemas: SchemaNode[] = [];
  let parseErrors = 0;
  for (const el of blocks) {
    const raw = $(el).contents().text();
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) schemas.push(...parsed);
      else schemas.push(parsed);
    } catch {
      parseErrors++;
    }
  }

  const flat: SchemaNode[] = [];
  const flatten = (node: SchemaNode) => {
    flat.push(node);
    if (node["@graph"] && Array.isArray(node["@graph"])) {
      for (const child of node["@graph"]) flatten(child);
    }
  };
  for (const s of schemas) flatten(s);

  const types = new Set<string>();
  for (const node of flat) {
    const t = node["@type"];
    if (Array.isArray(t)) t.forEach((x) => types.add(x));
    else if (typeof t === "string") types.add(t);
  }

  const presenceStatus =
    blocks.length > 0 && parseErrors === 0
      ? "pass"
      : blocks.length === 0
        ? "fail"
        : "warn";
  results.push({
    id: "schema.presence",
    phase: "Structured Data",
    title: "JSON-LD Structured Data",
    status: presenceStatus,
    message:
      blocks.length === 0
        ? "No <script type=\"application/ld+json\"> blocks found."
        : parseErrors > 0
          ? `${blocks.length} JSON-LD block(s) found, ${parseErrors} failed to parse.`
          : `${blocks.length} JSON-LD block(s) parsed cleanly. Types: ${[...types].join(", ") || "(none)"}.`,
    fix:
      presenceStatus === "pass"
        ? undefined
        : "Add JSON-LD with the right @type for the page (Article, Product, FAQPage, HowTo, Organization, Person). Validate at search.google.com/test/rich-results.",
    prompt:
      presenceStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Decide which Schema.org types this page needs and generate the JSON-LD.

Steps:
1. Infer the page's primary job from the title/H1 (article? product? FAQ? how-to? landing?).
2. Pick the appropriate @type(s): Article/BlogPosting, Product/SoftwareApplication, FAQPage, HowTo, Organization (always for site identity), BreadcrumbList.
3. Generate one combined JSON-LD block using @graph if multiple types apply.
4. Use realistic placeholder values for fields you can't infer (mark them with TODO).

Return only the <script type="application/ld+json"> block, ready to paste into <head>.`,
  });

  const expected: Array<{ type: string; phase: string }> = [
    { type: "Organization", phase: "Site-wide identity" },
    { type: "BreadcrumbList", phase: "Navigation context" },
    { type: "Article", phase: "Editorial content" },
    { type: "Person", phase: "Author identity" },
    { type: "FAQPage", phase: "Q&A blocks" },
    { type: "HowTo", phase: "Step-by-step content" },
    { type: "Product", phase: "Software/SaaS pages" },
  ];
  for (const { type } of expected) {
    const present = types.has(type);
    results.push({
      id: `schema.${type.toLowerCase()}`,
      phase: "Structured Data",
      title: `${type} schema`,
      status: present ? "pass" : "info",
      message: present
        ? `${type} schema detected.`
        : `${type} schema not found.`,
      fix: present ? undefined : suggestionForSchema(type),
      prompt: present ? undefined : promptForSchema(type, ctx),
    });
  }

  const article = flat.find((n) => {
    const t = n["@type"];
    return t === "Article" || (Array.isArray(t) && t.includes("Article")) ||
      t === "BlogPosting" || (Array.isArray(t) && t.includes("BlogPosting"));
  });
  if (article) {
    const dateModified = (article.dateModified ?? article.datePublished) as
      | string
      | undefined;
    if (dateModified) {
      const date = new Date(dateModified);
      const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      let freshStatus: CheckResult["status"] = "pass";
      let freshMessage = `Article was last modified ${Math.round(ageDays)} days ago (${dateModified}).`;
      if (Number.isNaN(ageDays)) {
        freshStatus = "warn";
        freshMessage = `Could not parse dateModified: "${dateModified}".`;
      } else if (ageDays > 365) {
        freshStatus = "warn";
        freshMessage = `Article is ${Math.round(ageDays)} days old. AI prefers content updated in the last 12 months.`;
      } else if (ageDays > 180) {
        freshStatus = "info";
        freshMessage = `Article is ${Math.round(ageDays)} days old. Plan a refresh — median cited article is ~148 days old.`;
      }
      results.push({
        id: "schema.article.freshness",
        phase: "Structured Data",
        title: "Content Freshness (dateModified)",
        status: freshStatus,
        message: freshMessage,
        fix:
          freshStatus === "pass" || freshStatus === "info"
            ? undefined
            : "Update dateModified when you genuinely refresh the content (new stats, new sections). Don't rely on datePublished alone.",
        prompt:
          freshStatus === "warn"
            ? `${pageHeader(ctx)}
dateModified is currently: "${dateModified}" (~${Math.round(ageDays)} days old).

Task: Suggest a refresh plan for this article.

Output:
1. List 4–6 sub-topics likely to be stale (statistics, prices, product features, regulations).
2. For each, suggest the specific update to make and a credible 2026 source to cite.
3. Provide a short "what changed" summary for the page footer.

Don't paraphrase the existing content — focus on what to add or correct.`
            : undefined,
      });
    }
  }

  return { results, schemas: flat };
}

function suggestionForSchema(type: string): string {
  switch (type) {
    case "Organization":
      return "Add Organization schema site-wide with name, url, logo, and sameAs links to LinkedIn, Wikipedia, Wikidata to lock brand identity.";
    case "BreadcrumbList":
      return "Add BreadcrumbList schema reflecting the URL hierarchy — helps search engines understand site context.";
    case "Article":
      return "Add Article schema with headline, datePublished, dateModified, and author for editorial pages.";
    case "Person":
      return "Add Person schema for the author with name, jobTitle, worksFor, and sameAs (LinkedIn etc.).";
    case "FAQPage":
      return "If the page has Q&A, add FAQPage schema with mainEntity → Question/acceptedAnswer pairs.";
    case "HowTo":
      return "If the page has steps/process content, add HowTo schema with step, name, text, totalTime.";
    case "Product":
      return "For software/SaaS, add Product or SoftwareApplication schema with applicationCategory and operatingSystem.";
    default:
      return `Consider adding ${type} schema if relevant.`;
  }
}

function promptForSchema(type: string, ctx: PromptContext): string {
  const base = `${pageHeader(ctx)}\nDomain: ${ctx.origin}`;
  switch (type) {
    case "Organization":
      return `${base}

Task: Generate Organization JSON-LD for this site.

Include:
- @context, @type: Organization
- name, url, logo (use https://${ctx.origin}/logo.png as placeholder)
- sameAs: LinkedIn, Wikipedia, Wikidata, GitHub, X — fill in with real URLs you can verify, leave TODO comments for unknown ones
- contactPoint with telephone and email if applicable

Return only the <script type="application/ld+json"> block, ready to paste into the site-wide <head>.`;
    case "BreadcrumbList":
      return `${base}

Task: Generate BreadcrumbList JSON-LD for this URL.

Steps:
1. Parse the URL path into hierarchical segments.
2. For each segment, infer a human-readable name.
3. Build the itemListElement array with position, name, item (full URL).

Return only the <script type="application/ld+json"> block.`;
    case "Article":
      return `${base}

Task: Generate Article (or BlogPosting) JSON-LD for this page.

Include:
- headline (matches H1)
- description (matches meta description)
- image (TODO placeholder — describe ideal hero image)
- datePublished, dateModified (use today's date for dateModified)
- author: nested Person with name, url
- publisher: nested Organization with name, logo
- mainEntityOfPage with the page URL

Return only the <script type="application/ld+json"> block.`;
    case "Person":
      return `${base}

Task: Generate Person JSON-LD for the author of this page.

Include:
- name, jobTitle, worksFor (Organization), url (author page on this site)
- sameAs: LinkedIn, X, personal site (mark TODO for unknown)
- description: 1-sentence credentials summary

Return only the <script type="application/ld+json"> block. Mark TODOs for any field you can't determine from the page.`;
    case "FAQPage":
      return `${base}

Task: Generate a 5-question FAQPage JSON-LD for this page.

Steps:
1. Infer the topic from the title/H1.
2. Generate 5 questions a real user would ask (Query Fan-Out: definition, comparison, pricing, use cases, edge cases).
3. Write a concise, answer-first response for each (40–80 words).
4. Wrap as FAQPage with mainEntity → Question/acceptedAnswer.

Return:
1. The <script type="application/ld+json"> block.
2. A separate HTML snippet of the visible FAQ section that mirrors it (so the schema and visible content match).`;
    case "HowTo":
      return `${base}

Task: Generate HowTo JSON-LD for this page.

Steps:
1. Infer the process from the title/H1.
2. Break it into 4–7 sequential steps.
3. For each step: name, text (1–2 sentences), optional image and url anchor.
4. Estimate totalTime in ISO 8601 duration (e.g. PT15M).

Return both:
1. The <script type="application/ld+json"> block.
2. The matching visible <ol> HTML.`;
    case "Product":
      return `${base}

Task: Generate Product (or SoftwareApplication) JSON-LD for this page.

Include:
- name, description, image
- applicationCategory (e.g., "DeveloperApplication", "BusinessApplication")
- operatingSystem (Web, Windows, macOS, Linux, iOS, Android)
- offers (price, priceCurrency, availability) — mark TODO if unknown
- aggregateRating if available
- featureList (5–10 key features as a string array)

Return only the <script type="application/ld+json"> block.`;
    default:
      return `${base}\n\nTask: Generate ${type} JSON-LD for this page using realistic values from the page context. Mark TODO for fields you can't determine. Return only the <script type="application/ld+json"> block.`;
  }
}
