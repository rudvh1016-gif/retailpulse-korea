/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { dispatchRealtimeCollection } from "../lib/realtime-dispatch";
import { redirectHttpToHttps } from "./https-redirect";

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

    return handler.fetch(request, env, ctx);
  },

  /**
   * Trigger-only realtime scheduler.
   *
   * This is INERT until a Cron Trigger is configured, and no wrangler config
   * declares one — activation needs separate owner approval. It never calls a
   * provider, parses a payload, hashes anything or touches D1; it makes one
   * authenticated GitHub request that dispatches collect-realtime.yml, and
   * GitHub Actions runs the unchanged A4-T1/A4-T2/S1 collectors.
   * See docs/REALTIME_SCHEDULER_AUDIT.md.
   */
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchRealtimeCollection(env).then((log) => {
      // The log record carries no header, token or authenticated URL.
      console.log(JSON.stringify(log));
    }));
  },
};

export default worker;
