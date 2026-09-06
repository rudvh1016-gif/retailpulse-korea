type D1Query = { sql: string; params?: unknown[] };
// `changes` is SQLite changes(): logical rows the statement altered.
// `rows_written` is D1's storage counter and includes index writes.
type D1Meta = { rows_read?: number; rows_written?: number; changes?: number; duration?: number };
type D1QueryResult = { success: boolean; meta?: D1Meta; results?: unknown[] };

interface D1ApiResponse {
  success: boolean;
  result?: D1QueryResult[];
  errors?: Array<{ code?: number; message?: string }>;
}

/**
 * What Cloudflare said went wrong, reduced to something safe to log.
 *
 * `d1_http_400` on its own is not a diagnosis. Production hit exactly that on
 * 2026-09-06, three attempts in a row on three different runners, and the log
 * could not say whether it was auth, a malformed request or the SQL. The
 * numeric code narrowed it to a query error; the message is what names the
 * column.
 *
 * The message is SQLite's, about OUR schema — "no such column: zone", "NOT
 * NULL constraint failed: airport_passenger_forecast.zone" — and that schema
 * is in this repository. What keeps a secret out is upstream of the reduction:
 * every value this code sends is a bound parameter, so the statement SQLite
 * quotes back contains `?` where the values were, never the values.
 *
 * The reduction is the second line, not the first. Only letters, digits, `_`,
 * `.`, `:` and `-` survive; runs of anything else collapse to a single `_`;
 * the result is capped. That strips the punctuation a SQL fragment is made of
 * and keeps the whole string inside the caller's bounded cause-code shape
 * (lib/source-adapters.ts). It does not claim to launder a message that
 * already contains a bare token — nothing here should ever produce one.
 *
 * A body that is not the documented shape adds nothing rather than replacing
 * the status we already know.
 */
const D1_MESSAGE_MAX = 56;

function safeD1Message(message: unknown): string {
  if (typeof message !== "string") return "";
  const reduced = message.replace(/[^A-Za-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "");
  return reduced ? `_${reduced.slice(0, D1_MESSAGE_MAX)}` : "";
}

async function d1ErrorSuffix(response: Response): Promise<string> {
  try {
    const payload = await response.json() as D1ApiResponse;
    const failure = payload.errors?.[0];
    if (!failure) return "";
    const code = Number.isSafeInteger(failure.code) ? `_${failure.code}` : "";
    return `${code}${safeD1Message(failure.message)}`;
  } catch {
    return "";
  }
}

class RestPreparedStatement {
  private params: unknown[] = [];

  constructor(private readonly database: CloudflareD1RestDatabase, readonly sql: string) {}

  bind(...values: unknown[]) {
    this.params = values;
    return this;
  }

  query(): D1Query {
    return { sql: this.sql, params: this.params };
  }

  async run(): Promise<D1QueryResult> {
    return (await this.database.execute([this.query()]))[0];
  }

  /**
   * Reads rows back, shaped like the Workers D1 binding's `all()`.
   *
   * This existed on the Workers binding and on every test double, but NOT on
   * this REST adapter, which is what Actions actually uses. The recovery
   * planner (lib/collection-recovery.ts) reads D1 before deciding whether to
   * call a provider, so the missing method threw, the read was reported as
   * "nothing stored", and every recovery window spent a full cycle of
   * provider requests instead of the zero a healthy window should cost
   * (production run 33479570166, 2026-09-01).
   */
  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta?: D1Meta }> {
    const result = (await this.database.execute([this.query()]))[0];
    return {
      results: (result?.results ?? []) as T[],
      success: result?.success ?? false,
      meta: result?.meta,
    };
  }

  /**
   * Reads the first row back, shaped like the Workers D1 binding's `first()`.
   *
   * Same class of gap as `all()` above, and it bit in exactly the same way.
   * A2's last-good check counts stored facilities to decide whether a failed
   * run means STALE (a directory exists) or ERROR (nothing is stored). Its
   * `catch` turns any throw into a count of zero, so the missing method made
   * a healthy 1,221-row directory report ERROR after a transient provider
   * timeout (production run 33810820692, 2026-09-04). The rows were never at
   * risk; the status was simply wrong about them.
   */
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const { results } = await this.all<T>();
    return results[0] ?? null;
  }
}

/**
 * Small D1 REST adapter for trusted GitHub Actions only.
 *
 * It exposes prepare/bind/run/all/first/batch — the surface the collectors and
 * the recovery planner use. Anything a caller needs must exist HERE, not only
 * on the Workers binding and the test doubles: a method missing from this
 * class fails silently in Actions while every unit test passes. That has now
 * happened twice, so tests/d1-rest-surface.test.mjs scans the source for every
 * `.method()` the collectors call on a prepared statement and fails if this
 * adapter does not implement it.
 */
export class CloudflareD1RestDatabase {
  private readonly endpoint: string;

  constructor(
    accountId: string,
    databaseId: string,
    private readonly apiToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  }

  prepare(sql: string) {
    return new RestPreparedStatement(this, sql);
  }

  async batch(statements: RestPreparedStatement[]) {
    return this.execute(statements.map((statement) => statement.query()));
  }

  async execute(batch: D1Query[]): Promise<D1QueryResult[]> {
    if (!batch.length) return [];
    if (batch.length > 50) throw new Error("d1_batch_too_large");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ batch }),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
        continue;
      }
      if (!response.ok) throw new Error(`d1_http_${response.status}${await d1ErrorSuffix(response)}`);
      const payload = await response.json() as D1ApiResponse;
      if (!payload.success || !Array.isArray(payload.result)) {
        const code = payload.errors?.[0]?.code ?? "unknown";
        throw new Error(`d1_query_failed_${code}`);
      }
      if (payload.result.some((result) => result.success === false)) throw new Error("d1_batch_statement_failed");
      return payload.result;
    }
    throw new Error("d1_retry_exhausted");
  }
}
