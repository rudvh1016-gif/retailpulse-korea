import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { betaSignups } from "../../../db/schema";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validSegments = new Set(["visitor", "airport", "store", "research"]);
const validLocales = new Set(["ko", "en", "zh", "ja"]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: unknown;
      segment?: unknown;
      locale?: unknown;
      sourcePath?: unknown;
      consent?: unknown;
      website?: unknown;
    };

    // Honeypot: bots commonly fill this visually hidden field.
    if (typeof payload.website === "string" && payload.website.trim()) {
      return Response.json({ ok: true }, { status: 201 });
    }

    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const segment = typeof payload.segment === "string" ? payload.segment : "visitor";
    const locale = typeof payload.locale === "string" ? payload.locale : "ko";
    const sourcePath = typeof payload.sourcePath === "string" ? payload.sourcePath.slice(0, 160) : "/";

    if (!payload.consent) return Response.json({ error: "consent_required" }, { status: 400 });
    if (!emailPattern.test(email) || email.length > 254) return Response.json({ error: "invalid_email" }, { status: 400 });
    if (!validSegments.has(segment) || !validLocales.has(locale)) return Response.json({ error: "invalid_option" }, { status: 400 });

    const db = await getDb();
    await db.insert(betaSignups).values({
      email,
      segment,
      locale,
      sourcePath,
      consentVersion: "2026-08-23",
    }).onConflictDoUpdate({
      target: betaSignups.email,
      set: {
        segment,
        locale,
        sourcePath,
        consentVersion: "2026-08-23",
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return Response.json({ error: message.includes("DB") || message.includes("table") ? "storage_unavailable" : "unexpected_error" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as { email?: unknown };
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!emailPattern.test(email) || email.length > 254) return Response.json({ error: "invalid_email" }, { status: 400 });
    const db = await getDb();
    await db.delete(betaSignups).where(eq(betaSignups.email, email));
    // Always return the same response so this endpoint does not reveal membership.
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
}
