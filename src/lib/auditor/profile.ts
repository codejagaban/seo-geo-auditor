import type { CheerioAPI } from "cheerio";
import type { FetchedPage, ResolvedProfile } from "./types";

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{7,}\d)/;
const ARTICLE_PATH = /\/(blog|articles?|posts?|news|insights?|stories|guides?)\//i;
const BUSINESS_HOST_HINT =
  /(care|clinic|dental|dentist|law|legal|attorney|plumb|electric|construction|consult|accounting|solicitor|barrister|estate|agency|services?|salon|spa|fitness|gym|studio|garage|repair|cleaner|cleaning|veterinary|vet|hotel|restaurant|cafe|bar|brewery|architect|surveyor|wedding|catering|removal|locksmith|funeral|nursery|school|tutoring|recovery|rehab|hospice|hospital|practice)/i;

export function detectProfile(
  page: FetchedPage,
  $: CheerioAPI
): ResolvedProfile {
  const url = new URL(page.finalUrl);
  const path = url.pathname;
  const bodyText = $("body").text();
  const isHomepage = path === "/" || path === "";

  if (ARTICLE_PATH.test(path)) return "article";

  const hasArticleSchema = $("script[type='application/ld+json']")
    .toArray()
    .some((el) => /Article|BlogPosting/i.test($(el).text()));
  if (hasArticleSchema) return "article";

  const hasArticleSignals =
    $("time[datetime]").length > 0 &&
    /\bby\s+[A-Z][a-z]+/.test(bodyText);
  if (hasArticleSignals && !isHomepage) {
    return "article";
  }

  const localSignals = [
    /tel:/i.test(page.html),
    PHONE_RE.test(bodyText),
    UK_POSTCODE.test(bodyText),
    /\b(opening hours|hours of operation|mon[\s-]*fri|monday[\s-]*friday|24\/7|by appointment)\b/i.test(
      bodyText
    ),
    /\b(contact us|get in touch|book a (consultation|call|appointment))\b/i.test(
      bodyText
    ),
    /\b(services?|appointments?|consultations?|locations?|catchment)\b/i.test(
      bodyText
    ),
    /\b(cqc|ofsted|dbs|iso\s*\d|ico\s+registered|fca\s+registered|registered\s+charity)\b/i.test(
      bodyText
    ),
    BUSINESS_HOST_HINT.test(url.hostname),
    isHomepage,
    $("address").length > 0,
  ].filter(Boolean).length;

  if (localSignals >= 2) return "local-business";

  return "article";
}
