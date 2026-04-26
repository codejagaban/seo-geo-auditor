"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Sparkles, FileText, MapPin } from "lucide-react";
import type { AuditReport, Profile } from "@/lib/auditor/types";
import { AuditResults } from "@/components/audit-results";

const PROFILES: Array<{
  value: Profile;
  label: string;
  hint: string;
  Icon: typeof Sparkles;
}> = [
  {
    value: "auto",
    label: "Auto-detect",
    hint: "Pick the right profile based on the page",
    Icon: Sparkles,
  },
  {
    value: "article",
    label: "Article / blog",
    hint: "Editorial content, guides, comparisons",
    Icon: FileText,
  },
  {
    value: "local-business",
    label: "Local business",
    hint: "Service business, care, clinic, contractor",
    Icon: MapPin,
  },
];

export function AuditForm() {
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<Profile>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setReport(null);
    setLoading(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, profile }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status}).`);
      } else {
        setReport(data as AuditReport);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex w-full gap-2">
          <Input
            type="text"
            inputMode="url"
            placeholder="https://example.com/page-to-audit"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            required
            className="h-12 text-base"
          />
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="h-12 px-6"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Auditing
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Audit
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Audit profile:
          </span>
          <div
            role="radiogroup"
            aria-label="Audit profile"
            className="inline-flex rounded-lg border bg-muted/40 p-1"
          >
            {PROFILES.map((p) => {
              const active = profile === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={p.hint}
                  onClick={() => setProfile(p.value)}
                  disabled={loading}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  } disabled:opacity-50`}
                >
                  <p.Icon className="h-3.5 w-3.5" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          Fetching the page, parsing HTML, and running the audit…
        </div>
      )}

      {report && <AuditResults report={report} />}
    </div>
  );
}
