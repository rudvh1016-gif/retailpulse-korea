type D1Query = { sql: string; params?: unknown[] };
type D1Meta = { rows_read?: number; rows_written?: number; duration?: number };
type D1QueryResult = { success: boolean; meta?: D1Meta; results?: unknown[] };

interface D1ApiResponse {
  success: boolean;
  result?: D1QueryResult[];
  errors?: Array<{ code?: number; message?: string }>;
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
}

/**
 * Small D1 REST adapter for trusted GitHub Actions only.
 * It intentionally exposes only the prepare/run/batch surface used by collectors.
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
      if (!response.ok) throw new Error(`d1_http_${response.status}`);
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
