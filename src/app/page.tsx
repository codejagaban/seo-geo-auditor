import { AuditForm } from "@/components/audit-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-16">
      <header className="mb-10 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              SEO + GEO + AEO + LLM SEO audit
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Audit any URL for AI search visibility.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              Paste a URL. We fetch it, parse the rendered HTML, and run the SEO + GEO
              publication standard — retrievability, structured data, citability,
              trust, and content depth — with concrete fixes for every gap.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <AuditForm />

      <footer className="mt-16 border-t pt-6 text-xs text-muted-foreground">
        Built on the SEO &amp; GEO Content Playbook. Checks what an AI retrieval
        agent sees in the first server-rendered pass — fast, no JavaScript
        execution.
      </footer>
    </main>
  );
}
