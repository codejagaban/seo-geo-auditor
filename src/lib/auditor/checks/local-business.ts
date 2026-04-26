import type { CheerioAPI } from "cheerio";
import type { CheckResult, FetchedPage } from "../types";
import { pageHeader, type PromptContext } from "../prompts";

interface SchemaNode {
  "@type"?: string | string[];
  "@graph"?: SchemaNode[];
  [key: string]: unknown;
}

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "MedicalBusiness",
  "MedicalOrganization",
  "HomeAndConstructionBusiness",
  "ProfessionalService",
  "Dentist",
  "Physician",
  "Hospital",
  "ChildCare",
  "Store",
  "Restaurant",
  "FinancialService",
  "LegalService",
  "EmergencyService",
  "HealthAndBeautyBusiness",
  "AutoDealer",
  "AutoRepair",
  "Plumber",
  "Electrician",
  "RealEstateAgent",
  "TravelAgency",
  "TouristAttraction",
  "Hotel",
  "Lodging",
  "Beach",
]);

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{7,}\d)/;

const ACCREDITATION_KEYWORDS = [
  "CQC",
  "Care Quality Commission",
  "Ofsted",
  "BUPA",
  "DBS",
  "ISO 9001",
  "ISO 27001",
  "GDPR compliant",
  "ICO registered",
  "FSA registered",
  "FCA",
  "Trading Standards",
  "Better Business Bureau",
  "BBB Accredited",
  "JCAHO",
  "AAAHC",
  "BBB",
];

const REVIEW_KEYWORDS = [
  "trustpilot",
  "google review",
  "google reviews",
  "yelp",
  "testimonial",
  "what our (clients|customers|patients|families|residents) say",
  "reviews",
  "rated",
  "5 stars",
  "★",
];

export function localBusinessChecks(
  page: FetchedPage,
  $: CheerioAPI,
  schemas: SchemaNode[],
  ctx: PromptContext
): CheckResult[] {
  const results: CheckResult[] = [];
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const html = page.html;
  const origin = ctx.origin;

  const flatTypes = (node: SchemaNode): string[] => {
    const t = node["@type"];
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  };

  const lbNode = schemas.find((n) =>
    flatTypes(n).some((t) => LOCAL_BUSINESS_TYPES.has(t))
  );
  results.push({
    id: "lb.schema",
    phase: "Local Business",
    title: "LocalBusiness schema",
    status: lbNode ? "pass" : "fail",
    message: lbNode
      ? `LocalBusiness-style schema detected (@type: ${flatTypes(lbNode).join(", ")}).`
      : "No LocalBusiness, MedicalBusiness, or related schema found.",
    fix: lbNode
      ? undefined
      : "Add LocalBusiness (or a more specific subtype like MedicalBusiness for care/health) JSON-LD with name, address, telephone, geo, openingHours, areaServed, priceRange.",
    prompt: lbNode
      ? undefined
      : `${pageHeader(ctx)}
Domain: ${origin}

Task: Generate LocalBusiness JSON-LD for this site.

Steps:
1. Pick the most specific @type from Schema.org that fits (LocalBusiness, MedicalBusiness, HomeAndConstructionBusiness, ProfessionalService, ChildCare, etc.). For a UK home-care provider, MedicalBusiness or HomeAndConstructionBusiness is usually correct.
2. Include all required + recommended fields:
   - @id (URL with fragment, e.g. https://${origin}/#localbusiness)
   - name, url, image, logo
   - description (1-2 sentences, entity-first)
   - address: PostalAddress with streetAddress, addressLocality, addressRegion, postalCode, addressCountry
   - telephone (E.164 format, e.g. +44 ...)
   - email
   - geo: GeoCoordinates with latitude, longitude
   - openingHoursSpecification: array of OpeningHoursSpecification with dayOfWeek + opens + closes
   - areaServed: array of named regions/cities/postcodes the business covers
   - priceRange (e.g. "££" or "£10-£50")
   - hasMap (link to Google Maps with the place embedded)
   - sameAs: links to Google Business Profile, Facebook, LinkedIn, Yelp, Trustpilot
3. Mark TODO for any field you can't infer from the page; never invent addresses, phone numbers, or coordinates.

Return only the <script type="application/ld+json"> block, ready to paste into <head>.`,
  });

  const phoneInHtml = /tel:[+\d]/i.test(html);
  const phoneVisible = PHONE_RE.test(bodyText);
  let phoneStatus: CheckResult["status"] = "pass";
  let phoneMessage = "Phone number is visible and uses a tel: link.";
  if (!phoneVisible) {
    phoneStatus = "fail";
    phoneMessage = "No phone number detected on the page.";
  } else if (!phoneInHtml) {
    phoneStatus = "warn";
    phoneMessage = "Phone number visible but not wrapped in a tel: link.";
  }
  results.push({
    id: "lb.phone",
    phase: "Local Business",
    title: "Phone number (with tel: link)",
    status: phoneStatus,
    message: phoneMessage,
    fix:
      phoneStatus === "pass"
        ? undefined
        : "Show the phone number in the header/footer and wrap it in <a href=\"tel:+44...\">. Mobile users should be able to tap to call.",
    prompt:
      phoneStatus === "pass"
        ? undefined
        : phoneStatus === "warn"
          ? `${pageHeader(ctx)}

Task: The phone number is visible on the page but not wrapped in a tel: link.

Output:
1. The exact <a href="tel:+44XXXXXXXXXX"> markup to wrap the existing phone number with (E.164 format, no spaces).
2. The telephone field + contactPoint JSON-LD fragment for the LocalBusiness schema (contactType "customer service", availableLanguage).

Mark <TODO: phone> for the actual number. Don't generate any new layout — just the wrap and the schema.`
          : `${pageHeader(ctx)}

Task: Generate the schema fragment + a small visible phone snippet for header/footer.

Output:
1. The telephone + contactPoint JSON-LD fragment for the LocalBusiness schema.
2. A minimal HTML snippet for header/footer: <a href="tel:+44..."> with phone icon, no extra layout chrome.

Mark <TODO: phone>. Return only the schema and the small phone link — no full sections.`,
  });

  const ukPostcode = UK_POSTCODE.exec(bodyText);
  const hasAddress =
    !!ukPostcode ||
    $("address").length > 0 ||
    /\b(suite|floor|street|road|avenue|lane|court|drive|way)\b/i.test(bodyText);
  results.push({
    id: "lb.nap",
    phase: "Local Business",
    title: "NAP (Name, Address, Postcode visible)",
    status: hasAddress ? "pass" : "fail",
    message: hasAddress
      ? ukPostcode
        ? `Address with UK postcode detected (e.g. "${ukPostcode[0]}").`
        : "Address-like content detected on the page."
      : "No street address or postcode found on the page.",
    fix: hasAddress
      ? undefined
      : "Show the full business address (street, city, postcode) in the footer or contact section. Use a semantic <address> tag and match it exactly to your Google Business Profile.",
    prompt: hasAddress
      ? undefined
      : `${pageHeader(ctx)}

Task: Generate the PostalAddress JSON-LD fragment + a minimal visible NAP block (since none was detected on the page).

Output:
1. The PostalAddress JSON-LD fragment to nest inside the LocalBusiness schema (streetAddress, addressLocality, addressRegion, postalCode, addressCountry "GB").
2. A minimal semantic <address> HTML snippet for the footer — name, street, city, postcode, tel: link, mailto: link. No design chrome.
3. One-line reminder: NAP must match Google Business Profile and Companies House character-for-character.

Mark <TODO> placeholders. Return JSON fragment + small HTML snippet only — don't redesign the footer.`,
  });

  const hoursVisible =
    /(open|closed|opening hours|hours of operation|mon[\s-–]*(fri|sun)|monday[\s-–]*(friday|sunday)|24\/7|by appointment)/i.test(
      bodyText
    );
  const hoursInSchema = schemas.some(
    (n) => "openingHoursSpecification" in n || "openingHours" in n
  );
  const hoursStatus =
    hoursVisible && hoursInSchema
      ? "pass"
      : hoursVisible || hoursInSchema
        ? "warn"
        : "info";
  results.push({
    id: "lb.hours",
    phase: "Local Business",
    title: "Opening hours (visible + in schema)",
    status: hoursStatus,
    message:
      hoursVisible && hoursInSchema
        ? "Opening hours are visible on the page AND in schema."
        : hoursVisible
          ? "Opening hours are visible but not in schema."
          : hoursInSchema
            ? "Opening hours in schema but not visible on the page."
            : "No opening hours found on the page.",
    fix:
      hoursStatus === "pass"
        ? undefined
        : "Show opening hours in the footer/contact section AND mirror them in openingHoursSpecification on the LocalBusiness schema. For 24/7 services, set opens=00:00 and closes=23:59 across all days.",
    prompt:
      hoursStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Generate the openingHoursSpecification JSON-LD fragment to add inside the LocalBusiness schema.

Output:
- An openingHoursSpecification array with one entry per dayOfWeek (or a single entry covering the full week for 24/7 services).
- Each entry: @type "OpeningHoursSpecification", dayOfWeek, opens, closes (24h ISO time format).
- For care/healthcare businesses serving 24/7, set opens "00:00" and closes "23:59".

If the actual hours aren't in the codebase, use <TODO: hours per day> markers. Insert the schema directly into the LocalBusiness JSON-LD in <head>. Report the file edited.`,
  });

  const areaServedInSchema = schemas.some(
    (n) => "areaServed" in n || "serviceArea" in n
  );
  const areaServedKeywords =
    /\b(serving|covering|areas? we cover|service areas?|throughout|across) (the )?(uk|england|wales|scotland|north[\s-]*(west|east)|south[\s-]*(west|east)|midlands|greater [a-z]+|london|manchester|birmingham|leeds|bristol|liverpool|newcastle|nottingham|sheffield|leicester|cardiff)/i.test(
      bodyText
    );
  const areaStatus = areaServedInSchema
    ? "pass"
    : areaServedKeywords
      ? "warn"
      : "info";
  results.push({
    id: "lb.area-served",
    phase: "Local Business",
    title: "Area served (geographic coverage)",
    status: areaStatus,
    message:
      areaServedInSchema
        ? "areaServed declared in schema."
        : areaServedKeywords
          ? "Service areas mentioned in copy but not in schema."
          : "No service area or coverage region found on the page.",
    fix:
      areaStatus === "pass"
        ? undefined
        : "List the regions/cities/postcodes you cover both visibly on the page AND in the LocalBusiness schema's areaServed field. AI uses this to match local intent queries.",
    prompt:
      areaStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Generate the areaServed JSON-LD fragment to add inside the LocalBusiness schema.

Output:
- An areaServed array using:
  - @type "City" with name (and optionally containedInPlace) for each town/city
  - @type "AdministrativeArea" for broader regions
  - @type "PostalCodeSpecification" with postalCodePrefix for postcode-district coverage
  - @type "Country" with name "United Kingdom" if the business serves nationally

Find the served areas in the codebase (about page, services page, footer copy, CMS field). If unclear, use <TODO: list of cities/postcode districts> markers. Insert the schema fragment directly into the LocalBusiness JSON-LD in <head>. No surrounding HTML — schema only. Report the file edited.`,
  });

  const accreditationsHit = ACCREDITATION_KEYWORDS.filter((k) =>
    new RegExp(`\\b${k}\\b`, "i").test(bodyText)
  );
  const accreditationStatus =
    accreditationsHit.length >= 1 ? "pass" : "info";
  results.push({
    id: "lb.accreditations",
    phase: "Local Business",
    title: "Accreditations / regulatory badges",
    status: accreditationStatus,
    message:
      accreditationsHit.length > 0
        ? `Detected accreditation mentions: ${accreditationsHit.join(", ")}.`
        : "No common accreditation badges (CQC, Ofsted, ISO, ICO, FCA, BBB) detected on the page.",
    fix:
      accreditationStatus === "pass"
        ? undefined
        : "Display regulatory badges (CQC for UK care, Ofsted for childcare, ICO registration, ISO certifications, professional bodies). These are high-trust signals AI surfaces in answers.",
    prompt:
      accreditationStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Suggest the regulatory and trust badges this business should display.

Steps:
1. Infer the business sector from the page (home care, dental, financial, etc.).
2. List the relevant UK regulators / certifying bodies for that sector. For UK home care examples: CQC (Care Quality Commission), Skills for Care, UKHCA, Investors in People, ICO (data protection), DBS-checked staff badge.
3. For each, give:
   - Where the badge should appear (footer, "About us", dedicated trust strip)
   - Whether the badge can be linked to a public register entry (provide the URL pattern, e.g. CQC profile URLs)
   - Suggested visible alt text
4. Add a 1-line note about which badges should be hyperlinked back to the regulator's verification page (Google rewards verifiable claims).

Return a markdown table: badge → applicable? → public verification URL pattern → recommended placement.`,
  });

  const reviewSchema = schemas.find((n) =>
    flatTypes(n).some((t) =>
      ["Review", "AggregateRating", "Rating"].includes(t)
    )
  );
  const reviewKeyword = REVIEW_KEYWORDS.some((k) =>
    new RegExp(k, "i").test(bodyText)
  );
  const reviewStatus = reviewSchema
    ? "pass"
    : reviewKeyword
      ? "warn"
      : "info";
  results.push({
    id: "lb.reviews",
    phase: "Local Business",
    title: "Reviews / testimonials with schema",
    status: reviewStatus,
    message: reviewSchema
      ? "Review or AggregateRating schema detected."
      : reviewKeyword
        ? "Testimonials/reviews mentioned in copy but no Review/AggregateRating schema."
        : "No reviews, testimonials, or rating signals detected.",
    fix:
      reviewStatus === "pass"
        ? undefined
        : "Add visible testimonials with author names + AggregateRating or Review JSON-LD. Link to the source where possible (Google, Trustpilot, Yelp).",
    prompt:
      reviewStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Generate AggregateRating + Review JSON-LD for the LocalBusiness schema.

⚠️ Google policy requires schema review content to match what's visibly on the page. So this output is dual:
1. The schema fragment: AggregateRating (ratingValue, reviewCount, bestRating) + an array of Review nodes (reviewRating, author, datePublished, reviewBody).
2. A minimal HTML <section> with the matching testimonials (quote, author, date, source link) — only needed if these reviews aren't already visible somewhere on the site.

Look in the codebase for existing testimonials (testimonials.json, CMS records, components named TestimonialCard, etc.). If found, generate Review nodes from the real entries. If none exist visibly, leave <TODO: paste verbatim review from [source]> markers — never fabricate review text. Report the file edited.`,
  });

  const hasContactForm = $("form").length > 0;
  const hasMailto = /mailto:[^"'\s]+@/.test(html);
  const contactStatus =
    hasContactForm || hasMailto ? "pass" : "warn";
  results.push({
    id: "lb.contact",
    phase: "Local Business",
    title: "Contact form or mailto link",
    status: contactStatus,
    message: hasContactForm
      ? `Contact form detected${hasMailto ? " (and mailto link)" : ""}.`
      : hasMailto
        ? "mailto: link detected."
        : "No contact form or mailto link found on the page.",
    fix:
      contactStatus === "pass"
        ? undefined
        : "Add at least one frictionless contact path: a short form (3 fields max) or a visible mailto link. For care/health, also offer a phone option in case visitors are urgent.",
    prompt:
      contactStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}

Task: Generate the ContactPoint JSON-LD fragment for the LocalBusiness schema.

Output:
- A contactPoint array with telephone, email, contactType ("customer service" or "appointments"), availableLanguage, hoursAvailable.
- For care/health: add a separate ContactPoint entry with contactType "emergency" if applicable.

Then a 1-line recommendation: the page has no visible contact form or mailto link — note where one should go (header CTA, footer, or dedicated /contact page). Don't generate the form HTML unless I ask.

Mark <TODO> placeholders. Return only the JSON fragment + the 1-line note.`,
  });

  const hasGeo = schemas.some((n) => "geo" in n);
  results.push({
    id: "lb.geo",
    phase: "Local Business",
    title: "Geo coordinates in schema",
    status: hasGeo ? "pass" : "info",
    message: hasGeo
      ? "geo (latitude/longitude) found in schema."
      : "No geo coordinates declared in schema.",
    fix: hasGeo
      ? undefined
      : "Add a geo block with GeoCoordinates (latitude, longitude) inside the LocalBusiness schema. AI map / location queries use this to confirm physical presence.",
    prompt: hasGeo
      ? undefined
      : `${pageHeader(ctx)}
Domain: ${origin}

Task: Generate the geo block to add inside the LocalBusiness JSON-LD.

Output:
1. The geo fragment using @type "GeoCoordinates" with latitude and longitude (decimal degrees).
2. A 1-line instruction on how to find the coordinates: pick the address pin in Google Maps, right-click → "What's here" → copy lat/long.
3. If the business serves an area rather than a single location, also generate a hasMap field linking to the public Google Maps URL.

Mark <TODO: lat>, <TODO: long>. Return ready-to-paste JSON.`,
  });

  const sameAsKeywords = [
    "google",
    "facebook",
    "linkedin",
    "instagram",
    "twitter",
    "x.com",
    "trustpilot",
    "yelp",
  ];
  const sameAsHits = schemas
    .flatMap((n) => {
      const sa = n.sameAs;
      return Array.isArray(sa) ? sa : sa ? [sa] : [];
    })
    .filter((u): u is string => typeof u === "string");
  const sameAsCovers = sameAsKeywords.filter((k) =>
    sameAsHits.some((u) => u.toLowerCase().includes(k))
  );
  const gbpStatus = sameAsCovers.includes("google") ? "pass" : "info";
  results.push({
    id: "lb.gbp-link",
    phase: "Local Business",
    title: "Google Business Profile link (sameAs)",
    status: gbpStatus,
    message: sameAsCovers.includes("google")
      ? "Schema sameAs includes a Google profile link."
      : "No Google Business Profile link in schema sameAs.",
    fix:
      gbpStatus === "pass"
        ? undefined
        : "Add the Google Business Profile URL (g.co/kgs/... or maps.google.com/?cid=...) to sameAs. This anchors the entity to the Knowledge Graph.",
    prompt:
      gbpStatus === "pass"
        ? undefined
        : `${pageHeader(ctx)}
Domain: ${origin}

Task: Help me link this site to its Google Business Profile so the entity is anchored in the Knowledge Graph.

Output:
1. The 3 forms of GBP URL I can use in sameAs (cid URL, g.co/kgs URL, maps.google.com URL) — explain which is most stable.
2. A short checklist for verifying GBP is correctly set up: NAP matches site exactly, primary category set, services listed, photos uploaded, hours match.
3. The sameAs JSON array with placeholders for: GBP URL, Facebook page, LinkedIn company page, Instagram, Trustpilot, Yelp.

Mark <TODO: gbp-url>. Return ready-to-paste JSON snippet and the checklist.`,
  });

  return results;
}
