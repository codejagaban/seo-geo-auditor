import * as cheerio from "cheerio";
import { fetchPage } from "./fetcher";
import { retrievalChecks } from "./checks/retrieval";
import { metadataChecks } from "./checks/metadata";
import { structuredDataChecks } from "./checks/structured-data";
import { citabilityChecks } from "./checks/citability";
import { trustChecks } from "./checks/trust";
import { contentChecks } from "./checks/content";
import { localBusinessChecks } from "./checks/local-business";
import { detectProfile } from "./profile";
import type {
  AuditReport,
  CheckResult,
  Profile,
  ResolvedProfile,
} from "./types";
import type { PromptContext } from "./prompts";

const ARTICLE_ONLY_DROP_FOR_LOCAL = new Set([
  "citability.bluf",
  "citability.takeaways",
  "citability.steps",
  "citability.comparison-table",
  "citability.query-headings",
  "schema.article",
  "schema.person",
  "schema.howto",
  "schema.article.freshness",
  "trust.person-schema",
  "trust.byline",
  "trust.last-updated",
]);

export async function runAudit(
  targetUrl: string,
  requestedProfile: Profile = "auto"
): Promise<AuditReport> {
  const page = await fetchPage(targetUrl);
  const $ = cheerio.load(page.html);

  const ctx: PromptContext = {
    finalUrl: page.finalUrl,
    title: $("title").first().text().trim() || undefined,
    h1: $("h1").first().text().trim() || undefined,
    metaDescription:
      $("meta[name='description']").attr("content")?.trim() || undefined,
    origin: new URL(page.finalUrl).hostname,
  };

  let profile: ResolvedProfile;
  let profileSource: AuditReport["profileSource"];
  if (requestedProfile === "auto") {
    profile = detectProfile(page, $);
    profileSource = "auto-detected";
  } else {
    profile = requestedProfile;
    profileSource = "user-selected";
  }

  const checks: CheckResult[] = [];
  checks.push(...retrievalChecks(page, $));
  checks.push(...metadataChecks(page, $, ctx));
  const sd = structuredDataChecks($, ctx);
  checks.push(...sd.results);
  checks.push(...citabilityChecks($, ctx));
  checks.push(...trustChecks(page, $, sd.schemas, ctx));
  checks.push(...contentChecks($, ctx, profile));
  if (profile === "local-business") {
    checks.push(...localBusinessChecks(page, $, sd.schemas, ctx));
  }

  const filtered =
    profile === "local-business"
      ? checks.filter((c) => !ARTICLE_ONLY_DROP_FOR_LOCAL.has(c.id))
      : checks;

  const counted = filtered.filter((c) => c.status !== "info");
  const passed = counted.filter((c) => c.status === "pass").length;
  const warned = counted.filter((c) => c.status === "warn").length;
  const failed = counted.filter((c) => c.status === "fail").length;
  const total = counted.length;
  const overall = total === 0
    ? 0
    : Math.round(((passed + warned * 0.5) / total) * 100);

  return {
    url: targetUrl,
    fetchedAt: new Date().toISOString(),
    profile,
    profileSource,
    page: {
      finalUrl: page.finalUrl,
      status: page.status,
      ttfbMs: page.ttfbMs,
      totalMs: page.totalMs,
      byteSize: page.byteSize,
    },
    score: { overall, passed, warned, failed, total },
    checks: filtered,
  };
}
