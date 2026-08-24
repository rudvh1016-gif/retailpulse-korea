/**
 * Minimal Cloudflare runtime declarations used by this Work Sites project.
 *
 * Production should replace these with generated Wrangler types (or
 * `@cloudflare/workers-types`) so every binding is checked against the real
 * deployment environment. Keeping this file intentionally small prevents the
 * browser bundle from gaining a runtime dependency just for Worker globals.
 */
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: { rows_read?: number; rows_written?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    APP_ENV?: string;
    ENABLE_BETA_SIGNUPS?: string;
    DATA_GO_KR_SERVICE_KEY?: string;
    SEOUL_OPEN_DATA_KEY?: string;
    KMA_SERVICE_KEY?: string;
  };
}
