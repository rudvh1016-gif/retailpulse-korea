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

interface D1Database {
  prepare(query: string): unknown;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
