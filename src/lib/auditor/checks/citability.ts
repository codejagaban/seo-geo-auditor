import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "../types";
import { pageHeader, snippet, type PromptContext } from "../prompts";

const HEDGING_PHRASES = [
  "it depends",
  "it might",
  "it may",
  "maybe",
  "perhaps",
  "possibly",
  "could be",
  "some people",
  "some users",
  "in many cases",
  "in some cases",
  "it's possible",
  "it is possible",
];

const VAGUE_TERMS = [
  "powerful",
  "modern",
  "best-in-class",
  "world-class",
  "cutting-edge",
  "next-generation",
  "future-ready",
  "revolutionary",
  "seamless",
];

export function citabilityChecks(
  $: CheerioAPI,
  ctx: PromptContext
): CheckResult[] {
  const results: CheckResult[] = [];

  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const h1 = $("h1").first();
  const afterH1Text = collectFirstParagraphsAfter($, h1);
  const blufWords = afterH1Text.split(/\s+/).filter(Boolean);
  const blufFirst60 = blufWords.slice(0, 60).join(" ");

  const looksLikeAnswer =
    blufWords.length >= 20 &&
    !VAGUE_TERMS.some((t) => blufFirst60.toLowerCase().includes(t)) &&
    !HEDGING_PHRASES.some((t) => blufFirst60.toLowerCase().includes(t));

  results.push({
    id: "citability.bluf",
    phase: "Citability",
    title: "BLUF (Bottom Line Up Front)",
    status: looksLikeAnswer ? "pass" : blufWords.length === 0 ? "fail" : "warn",
    message:
      blufWords.length === 0
        ? "No paragraph text found immediately after the H1."
        : looksLikeAnswer
          ? `First ~60 words after H1 read like a direct answer: "${truncate(blufFirst60, 180)}"`
          : `First content after H1 looks like marketing fluff or hedging: "${truncate(blufFirst60, 180)}"`,
    fix: looksLikeAnswer
      ? undefined
      : "Open with a 1–3 sentence entity-first definition or direct answer in the first 40–60 words. State what the thing IS, then add constraints. Avoid 'powerful' / 'modern' / 'it depends'.",
    prompt: looksLikeAnswer
      ? undefined
      : `${pageHeader(ctx)}

Current opening paragraph(s) after the H1:
"""
${snippet(afterH1Text, 600)}
"""

Task: Rewrite the opening as a BLUF (Bottom Line Up Front) block.

Constraints:
- 1–3 sentences, 40–60 words total
- Sentence 1: entity-first definition. Pattern: "[Entity] is [category] that [primary job]."
- Include at least one specific constraint that makes the claim verifiable (audience, scale, environment, measurable outcome)
- No hedging ("it depends", "maybe", "perhaps", "could be")
- No vague adjectives ("powerful", "modern", "future-ready", "best-in-class")
- Should be liftable as a standalone AI citation without surrounding context

Return only the rewritten paragraph, then a one-line note explaining the constraint you added.`,
  });

  const fullText = main.text();
  const hedgeHits = HEDGING_PHRASES.filter((p) =>
    fullText.toLowerCase().includes(p)
  );
  results.push({
    id: "citability.hedging",
    phase: "Citability",
    title: "Hedging Language",
    status: hedgeHits.length === 0 ? "pass" : hedgeHits.length > 3 ? "warn" : "info",
    message:
      hedgeHits.length === 0
        ? "No common hedging phrases detected."
        : `Detected hedging phrases: ${hedgeHits.slice(0, 5).join(", ")}${hedgeHits.length > 5 ? "…" : ""}`,
    fix:
      hedgeHits.length === 0
        ? undefined
        : "Replace hedging with conditional precision. Pattern: 'For [specific situation], [direct answer] because [evidence]'.",
    prompt:
      hedgeHits.length === 0
        ? undefined
        : `${pageHeader(ctx)}
Detected hedging phrases on the page: ${hedgeHits.join(", ")}

Task: Find every sentence on this page containing one of the detected hedging phrases and rewrite it using the conditional-precision pattern.

Steps:
1. Locate the page's content source files (MDX/Markdown, CMS export, or rendered HTML) and grep for each hedge phrase.
2. For each occurrence, rewrite the sentence in place using the pattern: "For [specific situation], [direct answer] because [evidence]."

Rules:
- Don't drop the nuance — name the dependency explicitly instead of leaving it vague.
- Replace "it depends" with a 2-line conditional ("For X, do A. For Y, do B.").
- Replace "maybe" / "possibly" / "could" with measured certainty backed by a constraint.
- Don't fabricate statistics — leave a <TODO: source> marker if a real number is needed and unavailable.

After editing, list each replacement made (file path, before, after).`,
  });

  const vagueHits = VAGUE_TERMS.filter((t) =>
    fullText.toLowerCase().includes(t)
  );
  results.push({
    id: "citability.vague",
    phase: "Citability",
    title: "Vague Marketing Claims",
    status: vagueHits.length === 0 ? "pass" : vagueHits.length > 3 ? "warn" : "info",
    message:
      vagueHits.length === 0
        ? "No common vague marketing terms detected."
        : `Detected vague terms: ${vagueHits.join(", ")}.`,
    fix:
      vagueHits.length === 0
        ? undefined
        : "Replace adjectives with specifics. 'Powerful' → '40% faster than X under Y conditions'. AI ignores generic superlatives.",
    prompt:
      vagueHits.length === 0
        ? undefined
        : `${pageHeader(ctx)}
Detected vague marketing terms on the page: ${vagueHits.join(", ")}

Task: Find every occurrence of these vague terms in the page's content source and replace each with a specific, evidence-backed claim.

Steps:
1. Locate the content source files and grep for each detected term.
2. For each occurrence, substitute with a concrete claim based on data you can find in the codebase (release notes, docs, benchmarks, CHANGELOG).

Substitution patterns:
- "powerful" → a measurable performance number, throughput, or capacity
- "modern" → the actual standard / spec / framework version (e.g. "supports React 19, Node 22+")
- "future-ready" → the specific upcoming standard it implements
- "best-in-class" → a comparison anchor (vs. named competitor) or benchmark result
- "seamless" → the specific friction that is eliminated (no auth handoff, no manual import, etc.)

Rules:
- Never invent numbers. If no data exists in the codebase, leave a <TODO: source> marker rather than guessing.
- Keep the sentence flow natural — substitute, don't bolt on.

After editing, list each replacement (file path, before, after).`,
  });

  const h2s = $("h2").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3s = $("h3").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const headings = [...h2s, ...h3s];
  const questionHeadings = headings.filter((h) =>
    /\?$/.test(h) ||
    /^(what|why|how|when|where|who|which|is|are|can|does|do)\b/i.test(h)
  );
  let queryHeadingStatus: CheckResult["status"] = "pass";
  let queryHeadingMessage = `${questionHeadings.length} of ${headings.length} H2/H3 headings look query-shaped.`;
  if (headings.length === 0) {
    queryHeadingStatus = "warn";
    queryHeadingMessage = "No H2 or H3 headings found — page is not chunkable.";
  } else if (questionHeadings.length === 0) {
    queryHeadingStatus = "warn";
    queryHeadingMessage = `None of the ${headings.length} H2/H3 headings match real query patterns (questions or how-to phrases).`;
  }
  results.push({
    id: "citability.query-headings",
    phase: "Citability",
    title: "Query-Shaped Headings",
    status: queryHeadingStatus,
    message: queryHeadingMessage,
    fix:
      queryHeadingStatus === "pass"
        ? undefined
        : "Phrase H2/H3 like real queries: 'What is X?', 'How to do Y', 'X vs Y'. Headings are retrieval magnets.",
    prompt:
      queryHeadingStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Current H2/H3 headings on the page:
${headings.length ? headings.map((h, i) => `${i + 1}. ${h}`).join("\n") : "(none)"}

Task: Rewrite each heading as a real user query.

Rules:
- Use question form when it fits ("What is X?", "How does Y work?", "When should I use Z?").
- For comparison sections: "X vs Y: [criterion]".
- For process sections: "How to [verb] [object]".
- Keep the same section ordering and meaning — only change the heading wording.
- Aim to match People-Also-Ask patterns for the page topic.

Return a numbered list with the original heading and the rewritten heading side by side.`,
  });

  const hasFaqHeading = headings.some((h) => /faq|frequently asked/i.test(h));
  const dlPairs = $("dl dt").length;
  const hasFaqPattern = hasFaqHeading || dlPairs >= 3 ||
    (questionHeadings.length >= 3);
  results.push({
    id: "citability.faq",
    phase: "Citability",
    title: "FAQ Module",
    status: hasFaqPattern ? "pass" : "info",
    message: hasFaqPattern
      ? "FAQ-style content detected (heading or 3+ question H2/H3s)."
      : "No FAQ-style block detected.",
    fix: hasFaqPattern
      ? undefined
      : "Add a 3–5 question FAQ section covering predictable follow-up questions (Query Fan-Out). Pair with FAQPage JSON-LD.",
    prompt: hasFaqPattern
      ? undefined
      : `${pageHeader(ctx)}

Task: Generate a 5-question FAQ section for this page using Query Fan-Out logic.

Steps:
1. Infer the page's primary topic from the title/H1.
2. Generate 5 sub-queries an AI retrieval system would expand the topic into:
   - Definition ("What is …?")
   - Comparison ("X vs Y" / "Is X better than Y?")
   - Pricing or scope ("How much does X cost?" / "What does X include?")
   - Use case ("When should I use X?")
   - Edge case or objection ("Does X work for [edge case]?")
3. Write a 40–80 word answer-first response for each (BLUF style — direct answer, then context).

Return both:
1. A clean HTML <section> with question headings (H3) and answer paragraphs.
2. A matching FAQPage JSON-LD <script type="application/ld+json"> block where every Question and acceptedAnswer text matches the visible HTML exactly.`,
  });

  const tables = $("table").length;
  results.push({
    id: "citability.comparison-table",
    phase: "Citability",
    title: "Comparison / Data Tables",
    status: tables > 0 ? "pass" : "info",
    message:
      tables > 0
        ? `${tables} table(s) found — strong extraction asset for AI.`
        : "No <table> elements found.",
    fix:
      tables > 0
        ? undefined
        : "For 'best/vs/alternatives' intent, add a comparison table. Tables are clean answer objects AI can lift directly.",
    prompt:
      tables > 0
        ? undefined
        : `${pageHeader(ctx)}

Task: Design a comparison table for this page.

Steps:
1. From the title/H1, identify the primary entity and its 2–4 closest competitors or alternatives.
2. Pick 6–10 comparison criteria that real buyers care about (not generic ones — be specific to the category).
3. Mark cells with concrete values, not "yes/no" only when possible (e.g. "supports X up to 50 concurrent users").
4. Mark TODO for any value you can't verify.

Return:
1. The HTML <table> with <thead> and <tbody>.
2. A 1-sentence "key takeaway" caption above the table that an AI could quote.`,
  });

  const orderedLists = $("ol li").length;
  results.push({
    id: "citability.steps",
    phase: "Citability",
    title: "Steps Module",
    status: orderedLists >= 3 ? "pass" : "info",
    message:
      orderedLists >= 3
        ? `${orderedLists} ordered-list items detected — usable as steps.`
        : "No clear numbered steps found.",
    fix:
      orderedLists >= 3
        ? undefined
        : "If the page covers a process, add a numbered <ol> of steps and pair with HowTo JSON-LD.",
    prompt:
      orderedLists >= 3
        ? undefined
        : `${pageHeader(ctx)}

Task: Generate a numbered Steps section for this page.

Steps:
1. From the title/H1, identify the process or task being explained.
2. Break it into 4–7 sequential, atomic steps (each step = one decision or action).
3. For each: a 3–8 word step title and a 1–2 sentence body explaining what to do and what success looks like.
4. Estimate total time in ISO 8601 duration (e.g. PT15M).

Return:
1. HTML <ol> with <li> items containing <h3> step titles and explanatory paragraphs.
2. Matching HowTo JSON-LD <script type="application/ld+json"> with step, name, text, totalTime fields where the step text mirrors the visible content.`,
  });

  const takeawaysPattern = /key takeaways|tl;?dr|summary|quick answer|in short/i;
  const hasTakeaways = headings.some((h) => takeawaysPattern.test(h)) ||
    main.find("[class*='takeaway' i], [class*='tldr' i]").length > 0;
  results.push({
    id: "citability.takeaways",
    phase: "Citability",
    title: "Key Takeaways Block",
    status: hasTakeaways ? "pass" : "info",
    message: hasTakeaways
      ? "A 'key takeaways' / 'TL;DR' / 'summary' block was detected."
      : "No key takeaways block detected.",
    fix: hasTakeaways
      ? undefined
      : "Add a 3–5 bullet 'Key Takeaways' summary near the top — extractable as a standalone answer object.",
    prompt: hasTakeaways
      ? undefined
      : `${pageHeader(ctx)}

Task: Add a "Key Takeaways" block directly under the H1 of this page.

Steps:
1. Read the full page body from the source file.
2. Generate 3–5 bullets that each summarise a self-contained claim from the body. Use only facts present in the source.
3. Insert the block in the source file immediately after the H1.

Constraints:
- Each bullet 12–25 words
- Lead with the most cited-likely fact (definition, primary differentiator, headline metric)
- No bullets that say "this article will explain…" — every bullet must already be the answer
- Don't fabricate numbers — only use what's in the source

Format: <section><h2>Key takeaways</h2><ul><li>…</li></ul></section>. Report the file edited and the inserted block.`,
  });

  return results;
}

function collectFirstParagraphsAfter(
  $: CheerioAPI,
  el: ReturnType<CheerioAPI>
): string {
  if (!el || el.length === 0) return "";
  const node = el.get(0);
  if (!node) return "";
  let collected = "";
  let cur = $(node).next();
  let safety = 0;
  while (cur.length > 0 && safety < 10 && collected.split(/\s+/).length < 80) {
    if (cur.is("p, ul, ol, blockquote, div")) {
      const t = cur.text().trim();
      if (t) collected += " " + t;
    }
    cur = cur.next();
    safety++;
  }
  if (!collected.trim()) {
    collected = $(node).parent().text().trim().slice(0, 600);
  }
  return collected.replace(/\s+/g, " ").trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
