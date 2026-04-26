"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ExternalLink,
  Clock,
  Gauge,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import type { AuditReport, CheckResult, Phase } from "@/lib/auditor/types";

const PHASE_ORDER: Phase[] = [
  "Retrieval",
  "Metadata",
  "Structured Data",
  "Local Business",
  "Citability",
  "Content Quality",
  "Trust & Authority",
  "Performance",
];

const PROFILE_LABEL: Record<string, string> = {
  "article": "Article / blog",
  "local-business": "Local business",
};

const STATUS_META: Record<
  CheckResult["status"],
  { label: string; icon: typeof CheckCircle2; cls: string; badge: string }
> = {
  pass: {
    label: "Pass",
    icon: CheckCircle2,
    cls: "text-emerald-600 dark:text-emerald-400",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  },
  warn: {
    label: "Warn",
    icon: AlertTriangle,
    cls: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  },
  fail: {
    label: "Fail",
    icon: XCircle,
    cls: "text-red-600 dark:text-red-400",
    badge:
      "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
  },
  info: {
    label: "Info",
    icon: Info,
    cls: "text-sky-600 dark:text-sky-400",
    badge:
      "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  },
};

interface ScoreTier {
  label: string;
  text: string;
  bg: string;
  ring: string;
  bar: string;
  border: string;
}

function getScoreTier(score: number): ScoreTier {
  if (score >= 90)
    return {
      label: "Excellent",
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      ring: "ring-emerald-500/30 dark:ring-emerald-400/20",
      bar: "from-emerald-500 to-emerald-400",
      border: "border-emerald-200 dark:border-emerald-900",
    };
  if (score >= 75)
    return {
      label: "Good",
      text: "text-lime-600 dark:text-lime-400",
      bg: "bg-lime-50 dark:bg-lime-950/40",
      ring: "ring-lime-500/30 dark:ring-lime-400/20",
      bar: "from-lime-500 to-lime-400",
      border: "border-lime-200 dark:border-lime-900",
    };
  if (score >= 60)
    return {
      label: "Fair",
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      ring: "ring-amber-500/30 dark:ring-amber-400/20",
      bar: "from-amber-500 to-amber-400",
      border: "border-amber-200 dark:border-amber-900",
    };
  if (score >= 40)
    return {
      label: "Needs work",
      text: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/40",
      ring: "ring-orange-500/30 dark:ring-orange-400/20",
      bar: "from-orange-500 to-orange-400",
      border: "border-orange-200 dark:border-orange-900",
    };
  return {
    label: "Poor",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    ring: "ring-red-500/30 dark:ring-red-400/20",
    bar: "from-red-500 to-red-400",
    border: "border-red-200 dark:border-red-900",
  };
}

export function AuditResults({ report }: { report: AuditReport }) {
  const grouped = new Map<Phase, CheckResult[]>();
  for (const c of report.checks) {
    if (!grouped.has(c.phase)) grouped.set(c.phase, []);
    grouped.get(c.phase)!.push(c);
  }

  const phasesPresent = PHASE_ORDER.filter((p) => grouped.has(p));
  const tier = getScoreTier(report.score.overall);

  return (
    <div className="space-y-6">
      <Card className={`overflow-hidden ${tier.border}`}>
        <CardHeader className={tier.bg}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">Audit summary</CardTitle>
                <Badge variant="outline" className="bg-background/80 font-normal backdrop-blur">
                  {PROFILE_LABEL[report.profile] ?? report.profile} profile
                  {" · "}
                  <span className="text-muted-foreground">
                    {report.profileSource}
                  </span>
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-1 break-all">
                <a
                  href={report.page.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {report.page.finalUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </div>
            <div
              className={`flex shrink-0 flex-col items-center justify-center rounded-2xl bg-background px-5 py-3 ring-4 ${tier.ring} shadow-sm`}
            >
              <span
                className={`text-5xl font-bold tabular-nums leading-none ${tier.text}`}
              >
                {report.score.overall}
              </span>
              <span
                className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${tier.text}`}
              >
                {tier.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                GEO score
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-1.5">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${tier.bar} transition-all duration-500`}
                style={{ width: `${Math.max(report.score.overall, 2)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
              <span>0</span>
              <span>40</span>
              <span>60</span>
              <span>75</span>
              <span>90</span>
              <span>100</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Passed"
              value={report.score.passed}
              icon={<CheckCircle2 className="h-4 w-4" />}
              text="text-emerald-700 dark:text-emerald-300"
              bg="bg-emerald-50 dark:bg-emerald-950/40"
              border="border-emerald-200 dark:border-emerald-900"
            />
            <Stat
              label="Warnings"
              value={report.score.warned}
              icon={<AlertTriangle className="h-4 w-4" />}
              text="text-amber-700 dark:text-amber-300"
              bg="bg-amber-50 dark:bg-amber-950/40"
              border="border-amber-200 dark:border-amber-900"
            />
            <Stat
              label="Failed"
              value={report.score.failed}
              icon={<XCircle className="h-4 w-4" />}
              text="text-red-700 dark:text-red-300"
              bg="bg-red-50 dark:bg-red-950/40"
              border="border-red-200 dark:border-red-900"
            />
            <Stat
              label="Total checks"
              value={report.checks.length}
              icon={<Info className="h-4 w-4" />}
              text="text-foreground"
              bg="bg-muted/40"
              border="border-border"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4 text-sm">
            <MetaItem
              icon={<Clock className="h-4 w-4" />}
              label="TTFB"
              value={`${report.page.ttfbMs} ms`}
            />
            <MetaItem
              icon={<Gauge className="h-4 w-4" />}
              label="Total fetch"
              value={`${report.page.totalMs} ms`}
            />
            <MetaItem
              icon={<Info className="h-4 w-4" />}
              label="HTTP status"
              value={String(report.page.status)}
            />
            <MetaItem
              icon={<Info className="h-4 w-4" />}
              label="HTML size"
              value={formatBytes(report.page.byteSize)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {phasesPresent.map((phase) => {
          const items = grouped.get(phase)!;
          const fails = items.filter((i) => i.status === "fail").length;
          const warns = items.filter((i) => i.status === "warn").length;
          const passes = items.filter((i) => i.status === "pass").length;
          return (
            <Card key={phase}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{phase}</CardTitle>
                  <div className="flex gap-1.5">
                    {passes > 0 && (
                      <Badge variant="outline" className={STATUS_META.pass.badge}>
                        {passes} pass
                      </Badge>
                    )}
                    {warns > 0 && (
                      <Badge variant="outline" className={STATUS_META.warn.badge}>
                        {warns} warn
                      </Badge>
                    )}
                    {fails > 0 && (
                      <Badge variant="outline" className={STATUS_META.fail.badge}>
                        {fails} fail
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Accordion className="w-full">
                  {items.map((c) => {
                    const meta = STATUS_META[c.status];
                    const Icon = meta.icon;
                    return (
                      <AccordionItem key={c.id} value={c.id}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex w-full items-start gap-3 text-left">
                            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.cls}`} />
                            <div className="flex-1">
                              <div className="font-medium">{c.title}</div>
                              <div className="text-sm font-normal text-muted-foreground">
                                {c.message}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 ${meta.badge}`}
                            >
                              {meta.label}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        {(c.fix || c.prompt) && (
                          <AccordionContent>
                            <div className="ml-8 space-y-3">
                              {c.fix && (
                                <div className="border-l-2 border-primary/40 bg-muted/40 p-3 text-sm">
                                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    How to fix
                                  </div>
                                  {c.fix}
                                </div>
                              )}
                              {c.prompt && <PromptBlock prompt={c.prompt} />}
                            </div>
                          </AccordionContent>
                        )}
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  text,
  bg,
  border,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  text: string;
  bg: string;
  border: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${bg} ${border}`}>
      <div className={`flex items-center gap-1.5 ${text}`}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${text}`}>
        {value}
      </div>
    </div>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function PromptBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select textarea content
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    }
  }

  const lineCount = prompt.split("\n").length;
  const isLong = lineCount > 8;

  return (
    <div className="border-l-2 border-violet-500/60 bg-violet-50/50 p-3 text-sm dark:bg-violet-950/30">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3.5 w-3.5" />
          LLM prompt to fix
        </div>
        <div className="flex items-center gap-1">
          {isLong && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Collapse" : "Expand"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={copy}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy prompt
              </>
            )}
          </Button>
        </div>
      </div>
      <pre
        className={`whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90 ${
          isLong && !expanded ? "max-h-40 overflow-hidden" : ""
        }`}
      >
        {prompt}
      </pre>
      {isLong && !expanded && (
        <div className="pointer-events-none -mt-6 h-6 w-full bg-gradient-to-t from-violet-50/80 to-transparent dark:from-violet-950/40" />
      )}
    </div>
  );
}
