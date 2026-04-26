import { NextResponse } from "next/server";
import { runAudit } from "@/lib/auditor";
import type { Profile } from "@/lib/auditor/types";

export const runtime = "nodejs";

const VALID_PROFILES: Profile[] = ["auto", "article", "local-business"];

export async function POST(request: Request) {
  let body: { url?: string; profile?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body.url ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Missing 'url' field." }, { status: 400 });
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = "https://" + normalized;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return NextResponse.json(
      { error: "Could not parse URL. Include a valid hostname." },
      { status: 400 }
    );
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json(
      { error: "Only http and https URLs are supported." },
      { status: 400 }
    );
  }

  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname.endsWith(".local")
  ) {
    return NextResponse.json(
      { error: "Local hostnames are not allowed." },
      { status: 400 }
    );
  }

  const profileParam = (body.profile ?? "auto") as Profile;
  const profile: Profile = VALID_PROFILES.includes(profileParam)
    ? profileParam
    : "auto";

  try {
    const report = await runAudit(parsed.toString(), profile);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Audit failed: ${message}` },
      { status: 502 }
    );
  }
}
