/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { dispatchScheduledCollection } from "../lib/realtime-dispatch";
import { redirectHttpToHttps } from "./https-redirect";
import { shouldRouteToSummaryCache } from "./summary-cache-routing";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  DATA_GO_KR_SERVICE_KEY?: string;
  SEOUL_OPEN_DATA_KEY?: string;
  KMA_SERVICE_KEY?: string;
  /**
   * Cloudflare Worker secret for the trigger-only realtime scheduler.
   * Absent until the owner configures it at activation time; the handler
   * reports dispatch_missing_token rather than throwing.
   */
  GITHUB_DISPATCH_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  /**
   * Loopback bindings for this Worker's own named exports, enabled by default
   * from compatibility date 2025-11-17 (this Worker is well past it). Typed as
   * optional so the gateway degrades to the direct handler rather than
   * throwing if it is ever unavailable.
   */
  exports?: { SummaryCache?: Fetcher };
}

interface ScheduledEvent {
  cron: string;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const httpsRedirect = redirectHttpToHttps(request);
    if (httpsRedirect) return httpsRedirect;

    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // Only the public summary read is handed to the cached entrypoint. Every
    // other route — writes, health, pages, assets — stays on this uncached
    // gateway and reaches the application unchanged.
    if (shouldRouteToSummaryCache(request.method, url.pathname)) {
      const summaryCache = ctx.exports?.SummaryCache;
      if (summaryCache) return summaryCache.fetch(request);
    }

    return handler.fetch(request, env, ctx);
  },

  /**
   * Trigger-only scheduled dispatcher.
   *
   * It never calls a provider, parses a payload, hashes anything or touches
   * D1; each authorized Production Cron makes one
   * authenticated GitHub request to an allowlisted workflow, and GitHub
   * Actions runs the unchanged collectors.
   * See docs/REALTIME_SCHEDULER_AUDIT.md.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchScheduledCollection(event.cron, env).then((log) => {
      // The log record carries no header, token or authenticated URL.
      console.log(JSON.stringify(log));
    }));
  },
};

export default worker;

/**
 * The one entrypoint Cloudflare is allowed to put a cache in front of.
 *
 * Workers Caching is configured per entrypoint in `wrangler.production.jsonc`:
 * `default` stays uncached so the gateway keeps running on every request, and
 * only this export opts in. A cache hit is served without invoking it at
 * all, which is precisely the point — the expensive D1-backed summary work
 * lives behind it, so a hit costs zero rows read.
 *
 * Whether a given response is actually storable is not decided here. It is
 * decided by the `cache-control` header the summary route emits, via
 * `lib/summary-cache-policy.ts`: a degraded or outer-failure payload carries
 * `no-store` and Cloudflare declines to cache it.
 *
 * Deliberately a plain fetch handler rather than a `WorkerEntrypoint`
 * subclass. `extends` would need a static `cloudflare:workers` import, and
 * that module exists only inside workerd, so every Node test that loads this
 * file would fail to resolve it — `db/index.ts` dodges the same edge with a
 * dynamic import. Cloudflare treats any export implementing `fetch` as an
 * entrypoint, so the narrower form costs nothing.
 */
export const SummaryCache = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },
};
