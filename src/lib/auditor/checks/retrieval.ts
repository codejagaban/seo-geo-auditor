import type { CheerioAPI } from "cheerio";
import type { CheckResult, FetchedPage } from "../types";

export function retrievalChecks(
  page: FetchedPage,
  $: CheerioAPI
): CheckResult[] {
  const results: CheckResult[] = [];

  results.push({
    id: "retrieval.status",
    phase: "Retrieval",
    title: "HTTP Status",
    status: page.status >= 200 && page.status < 300 ? "pass" : "fail",
    message: `Server returned ${page.status} for ${page.finalUrl}.`,
    fix:
      page.status >= 200 && page.status < 300
        ? undefined
        : "Page must return a 2xx status. Fix redirects or server errors so crawlers and AI agents reach the final URL directly.",
  });

  if (page.status >= 200 && page.status < 300) {
    const ttfb = page.ttfbMs;
    let status: CheckResult["status"] = "pass";
    let message = `TTFB ${ttfb}ms — within the safe AI retrieval budget (<400ms).`;
    if (ttfb > 800) {
      status = "fail";
      message = `TTFB ${ttfb}ms — past the AI critical cutoff. AI agents will likely drop your page from the candidate set.`;
    } else if (ttfb > 400) {
      status = "warn";
      message = `TTFB ${ttfb}ms — in the warning zone. AI chatbots use ~200–400ms timeouts.`;
    }
    results.push({
      id: "retrieval.ttfb",
      phase: "Retrieval",
      title: "Time to First Byte (TTFB)",
      status,
      message,
      fix:
        status === "pass"
          ? undefined
          : "Aim for TTFB <400ms. Cache HTML at the edge (Vercel/CDN), reduce server work, and avoid blocking middleware on the document request.",
    });
  }

  const robotsMeta = $("meta[name='robots']").attr("content") ?? "";
  const noindex = /noindex/i.test(robotsMeta);
  results.push({
    id: "retrieval.noindex",
    phase: "Retrieval",
    title: "Indexing Allowed (noindex)",
    status: noindex ? "fail" : "pass",
    message: noindex
      ? `Page declares <meta name="robots" content="${robotsMeta}"> — it will not be indexed.`
      : "Page is not blocked by a noindex directive.",
    fix: noindex
      ? "Remove the noindex value from the robots meta unless this page is intentionally excluded."
      : undefined,
  });

  const canonical = $("link[rel='canonical']").attr("href") ?? "";
  results.push({
    id: "retrieval.canonical",
    phase: "Retrieval",
    title: "Canonical URL",
    status: canonical ? "pass" : "warn",
    message: canonical
      ? `Canonical is set to ${canonical}.`
      : "No <link rel=\"canonical\"> found.",
    fix: canonical
      ? undefined
      : "Add a self-referential canonical link tag to consolidate ranking signals and avoid duplicate-content ambiguity.",
  });

  const bodyText = $("body").text().trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  let renderStatus: CheckResult["status"] = "pass";
  let renderMessage = `Server-rendered HTML contains ~${wordCount} words of body text.`;
  if (wordCount < 50) {
    renderStatus = "fail";
    renderMessage = `Only ~${wordCount} words rendered server-side. Page likely depends on client-side JavaScript and won't be retrieved reliably.`;
  } else if (wordCount < 200) {
    renderStatus = "warn";
    renderMessage = `Only ~${wordCount} words rendered server-side. Verify primary content (definition, answer, CTA) is in the initial HTML, not JS-injected.`;
  }
  results.push({
    id: "retrieval.ssr",
    phase: "Retrieval",
    title: "Server-Rendered Content",
    status: renderStatus,
    message: renderMessage,
    fix:
      renderStatus === "pass"
        ? undefined
        : "Render the answer, definition, and key headings in the initial HTML. Use SSR/SSG or pre-rendering — AI agents do not wait for JavaScript.",
  });

  const interstitialKeywords = [
    "cookie",
    "consent",
    "subscribe",
    "newsletter",
    "sign up",
    "verify you are human",
    "captcha",
  ];
  const overlay = $("[role='dialog'], .modal, .overlay, .cookie-banner, #cookie-banner")
    .toArray()
    .map((el) => $(el).text().toLowerCase());
  const hasInterstitial = overlay.some((t) =>
    interstitialKeywords.some((k) => t.includes(k))
  );
  results.push({
    id: "retrieval.interstitials",
    phase: "Retrieval",
    title: "No Blocking Interstitials",
    status: hasInterstitial ? "warn" : "pass",
    message: hasInterstitial
      ? "A cookie/consent/newsletter overlay was detected in the initial HTML."
      : "No obvious blocking interstitial in the initial HTML.",
    fix: hasInterstitial
      ? "Avoid full-page interstitials in the first paint. Crawlers and AI agents may stop at the wall and never reach the main content."
      : undefined,
  });

  return results;
}
