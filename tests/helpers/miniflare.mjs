import { Miniflare as RuntimeMiniflare, convertV4MiniflareOptions } from 'miniflare';

// Use Cloudflare's official converter for Miniflare 5's configuration API.
// Keep the existing single-worker integration fixtures and assertions intact.
export class Miniflare extends RuntimeMiniflare {
  constructor(workerOptions) {
    super(convertV4MiniflareOptions(workerOptions));
  }
}
