import type { CheerioAPI } from "cheerio";
import type { CheckResult, ResolvedProfile } from "../types";
import { pageHeader, type PromptContext } from "../prompts";

export function contentChecks(
  $: CheerioAPI,
  ctx: PromptContext,
  profile: ResolvedProfile = "article"
): CheckResult[] {
  const results: CheckResult[] = [];
  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = main.text().replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);

  const failBelow = profile === "local-business" ? 80 : 300;
  const warnBelow = profile === "local-business" ? 250 : 800;
  const targetCopy =
    profile === "local-business"
      ? "For service/landing pages, aim for ~300+ words covering services, areas served, why choose us, contact CTA."
      : "For most informational queries, aim for 1000+ words covering definition, use cases, comparisons, and FAQs.";

  let depthStatus: CheckResult["status"] = "pass";
  let depthMessage = `Main content has ~${words.length} words.`;
  if (words.length < failBelow) {
    depthStatus = "fail";
    depthMessage = `Main content is only ~${words.length} words — too thin${profile === "local-business" ? " (likely a JS-rendered page invisible to AI agents)" : " to cover query fan-out sub-topics"}.`;
  } else if (words.length < warnBelow) {
    depthStatus = "warn";
    depthMessage = `Main content is ~${words.length} words. ${targetCopy}`;
  }
  results.push({
    id: "content.depth",
    phase: "Content Quality",
    title: "Semantic Depth (word count)",
    status: depthStatus,
    message: depthMessage,
    fix:
      depthStatus === "pass"
        ? undefined
        : "Cover the full query fan-out: definition, features, use cases, alternatives, FAQs. Depth beats length, but thin pages can't satisfy expanded queries.",
    prompt:
      depthStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Current word count: ~${words.length}

Task: Build a semantic-depth expansion plan.

Steps:
1. From the title/H1, generate the Query Fan-Out — 8–12 sub-queries an AI would expand the topic into (definition, comparison, pricing, use cases, edge cases, alternatives, integrations, regulations, implementation, troubleshooting, common pitfalls, future trends).
2. For each sub-query, propose:
   - A new H2 or H3 heading using the query phrasing
   - A 2–3 sentence outline of what to cover
   - 1 piece of "information gain" (original data, first-hand example, edge case) that AI cannot self-generate
3. Mark which sections are highest-leverage for AI citation (definition, comparison, FAQ).

Return an ordered outline as a markdown list with H2 / H3 / outline / information-gain note for each section.`,
  });

  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  let modularStatus: CheckResult["status"] = "pass";
  let modularMessage = `${h2Count} H2 / ${h3Count} H3 sections — page is chunkable.`;
  if (h2Count === 0) {
    modularStatus = "fail";
    modularMessage = "No H2 sections — the page has no extractable chunks.";
  } else if (h2Count < 3) {
    modularStatus = "warn";
    modularMessage = `Only ${h2Count} H2 section(s). Add more topic-specific subsections so AI can extract self-contained answers.`;
  }
  results.push({
    id: "content.modularity",
    phase: "Content Quality",
    title: "Modular Sections (H2 chunks)",
    status: modularStatus,
    message: modularMessage,
    fix:
      modularStatus === "pass"
        ? undefined
        : "Break content into 4–8 H2 sections, each covering one job-to-be-done. Each section should make sense extracted on its own.",
    prompt:
      modularStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Current heading structure: ${h2Count} H2, ${h3Count} H3

Task: Restructure this page into modular, chunkable H2 sections.

Constraints:
- 4–8 H2 sections, each covering exactly one job-to-be-done
- Each section must read as a self-contained answer when extracted (BLUF + body + closer)
- Use query-shaped H2 headings (questions or how-to phrases)
- Order sections to mirror typical user reading flow: definition → use cases → implementation → comparison → FAQ
- Suggest H3 sub-headings only where the H2 covers multiple distinct sub-topics

Return:
1. A proposed H2 outline (numbered list with one-line description of each section's job).
2. For 1–2 of the most important sections, a starter "BLUF + claim + evidence" template I can fill in.`,
  });

  const imgs = $("img").toArray();
  const missingAlt = imgs.filter((el) => {
    const alt = $(el).attr("alt");
    return alt === undefined || alt.trim() === "";
  }).length;
  let altStatus: CheckResult["status"] = "pass";
  let altMessage =
    imgs.length === 0
      ? "No images on the page."
      : `${imgs.length - missingAlt} of ${imgs.length} images have alt text.`;
  if (imgs.length > 0 && missingAlt > 0) {
    altStatus = missingAlt / imgs.length > 0.3 ? "warn" : "info";
  }
  results.push({
    id: "content.alt-text",
    phase: "Content Quality",
    title: "Image Alt Text",
    status: altStatus,
    message: altMessage,
    fix:
      altStatus === "pass"
        ? undefined
        : "Add descriptive alt text to all content images, mentioning the relevant entities (not just 'image' or filename).",
    prompt:
      altStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Images missing alt text: ${missingAlt} of ${imgs.length}

Task: Find every <img> on this page that is missing an alt attribute and fix it in source.

Steps:
1. Locate the page source files and identify each <img> (or <Image>, <NextImage>, etc.) without a descriptive alt.
2. For each, infer the subject and purpose from surrounding context (caption, file name, nearby headings).
3. Edit the source to add alt text in place.

Rules:
- 8–15 words per alt
- Lead with the entity or subject, not "Image of"
- Include the function the image performs on the page (diagram, screenshot, chart, illustrative photo)
- For purely decorative images, set alt="" and add a brief comment explaining why
- For charts/data visuals, summarise the takeaway, not the chart type
- If the image purpose is genuinely unclear, leave a <TODO: alt for [filename]> marker

After editing, list each file changed and the alt text added.`,
  });

  const lang = $("html").attr("lang");
  results.push({
    id: "content.lang",
    phase: "Content Quality",
    title: "HTML Language",
    status: lang ? "pass" : "warn",
    message: lang
      ? `<html lang="${lang}"> is set.`
      : "No lang attribute on <html>.",
    fix: lang
      ? undefined
      : "Add lang to <html> (e.g., <html lang=\"en\"). Helps language detection for retrieval and accessibility.",
  });

  return results;
}
