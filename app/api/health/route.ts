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
    return Response.json({ app: "ok", database: "unavailable", sources: [], checkedAt }, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }
}
