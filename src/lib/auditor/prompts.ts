export interface PromptContext {
  finalUrl: string;
  title?: string;
  h1?: string;
  metaDescription?: string;
  introText?: string;
  origin: string;
}

const AGENT_PREAMBLE = `You are an AI coding agent with access to this site's codebase. Apply the fix directly:

1. **Discover** — search the project for the relevant file(s) yourself (head/layout files, page templates, content sources, schema/JSON-LD blocks). Don't ask the user where things live.
2. **Read existing context** — pull the actual current values (phone, address, hours, business name, brand assets) from the codebase or rendered HTML before generating new content. Don't paraphrase or invent.
3. **Apply the change** — edit the file(s) directly. For schema changes, place JSON-LD in the appropriate <head> or layout, not as a separate snippet for the user to paste.
4. **Use <TODO: …> markers** only for values you cannot determine from the codebase or public sources. Make TODOs specific (e.g. <TODO: latitude from Google Maps "What's here">), not vague.
5. **Verify** — after editing, re-render the page and confirm the change is live in the served HTML before reporting done.

Do NOT ask the user clarifying questions, ask them to paste content, or end the response with "ready when you are". Take the action.

---

`;

export function pageHeader(ctx: PromptContext): string {
  const lines: string[] = [AGENT_PREAMBLE, `Page URL: ${ctx.finalUrl}`];
  if (ctx.title) lines.push(`Current <title>: "${ctx.title}"`);
  if (ctx.h1) lines.push(`Current <h1>: "${ctx.h1}"`);
  if (ctx.metaDescription)
    lines.push(`Current meta description: "${ctx.metaDescription}"`);
  return lines.join("\n");
}

export function snippet(text: string, max = 600): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
