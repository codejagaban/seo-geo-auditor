import type { FetchedPage } from "./types";

const USER_AGENT =
  "SEO-GEO-Auditor/1.0 (+https://example.com) Mozilla/5.0 (compatible)";

export async function fetchPage(targetUrl: string): Promise<FetchedPage> {
  const url = new URL(targetUrl);
  const startedAt = performance.now();
  let ttfbMs = 0;

  const response = await fetch(url.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });

  ttfbMs = performance.now() - startedAt;
  const html = await response.text();
  const totalMs = performance.now() - startedAt;

  return {
    url: targetUrl,
    finalUrl: response.url,
    status: response.status,
    ttfbMs: Math.round(ttfbMs),
    totalMs: Math.round(totalMs),
    contentType: response.headers.get("content-type") ?? "",
    html,
    byteSize: new TextEncoder().encode(html).length,
  };
}
