export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type Phase =
  | "Retrieval"
  | "Metadata"
  | "Structured Data"
  | "Citability"
  | "Trust & Authority"
  | "Content Quality"
  | "Local Business"
  | "Performance";

export type Profile = "auto" | "article" | "local-business";

export type ResolvedProfile = "article" | "local-business";

export interface CheckResult {
  id: string;
  phase: Phase;
  title: string;
  status: CheckStatus;
  message: string;
  fix?: string;
  prompt?: string;
  evidence?: string;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  ttfbMs: number;
  totalMs: number;
  contentType: string;
  html: string;
  byteSize: number;
}

export interface AuditReport {
  url: string;
  fetchedAt: string;
  profile: ResolvedProfile;
  profileSource: "auto-detected" | "user-selected";
  page: {
    finalUrl: string;
    status: number;
    ttfbMs: number;
    totalMs: number;
    byteSize: number;
  };
  score: {
    overall: number;
    passed: number;
    warned: number;
    failed: number;
    total: number;
  };
  checks: CheckResult[];
}
