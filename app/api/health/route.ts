import { getDb } from "../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const db = await getDb();
    const result = await db.$client.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const sources = await db.$client.prepare("SELECT source_id AS sourceId, status, last_retrieved_at AS lastRetrievedAt FROM source_health ORDER BY source_id").all<{ sourceId: string; status: string; lastRetrievedAt: string | null }>();
    return Response.json({
      app: "ok",
      database: result?.ok === 1 ? "ok" : "degraded",
      sources: sources.results ?? [],
      checkedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    // A health endpoint that answers 200 while the database is unreachable is
    // how the 2026-09-01 D1 quota outage passed every check: the site served
    // pages with no data and the smoke called it healthy. 503 is the truthful
    // answer and the one standard monitoring already understands. This is
    // reserved for the database being unreachable — a merely degraded source
    // still returns 200, because the product is still serving real last-good
    // data in that case.
    return Response.json({ app: "ok", database: "unavailable", sources: [], checkedAt }, {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "60" },
    });
  }
}
