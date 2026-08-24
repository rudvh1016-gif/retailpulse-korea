import { getDb } from "../../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const sources = await db.$client.prepare(`SELECT source_id AS sourceId, status, last_event_at AS eventAt,
      last_retrieved_at AS retrievedAt, detail FROM source_health ORDER BY source_id`).all<{
        sourceId: string;
        status: string;
        eventAt: string | null;
        retrievedAt: string | null;
        detail: string | null;
      }>();
    return Response.json({ mode: "source-health", sources: sources.results ?? [] }, {
      headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch {
    return Response.json({ mode: "degraded", sources: [], message: "Live sources are not connected. Official historical and Demo-labelled views remain available." }, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }
}
