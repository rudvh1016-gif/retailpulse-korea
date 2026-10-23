/** Narrow workaround for vinext 0.0.50: its 404 renderer resolves layout
 * metadata but ignores the not-found module's metadata. Keep the framework's
 * status and noindex; do not reclassify successful pages or touch RSC/API data.
 * Remove this workaround once the runtime's 404 metadata is verified natively.
 */
const copy = {
  ko: { title: '페이지를 찾을 수 없습니다 | KORETAIL', description: '요청한 페이지는 없거나 주소가 바뀌었습니다.' },
  en: { title: 'Page not found | KORETAIL', description: 'The page is missing or its address has changed.' },
  zh: { title: '找不到页面 | KORETAIL', description: '该页面不存在或地址已更改。' },
  ja: { title: 'ページが見つかりません | KORETAIL', description: 'ページが存在しないか、URLが変更されました。' },
} as const;

type RewriteElement = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): RewriteElement;
  append(content: string, options?: { html?: boolean }): RewriteElement;
  remove(): RewriteElement;
};
type Rewriter = {
  on(selector: string, handlers: { element(element: RewriteElement): void }): Rewriter;
  transform(response: Response): Response;
};

export function notFoundMetadataForPath(pathname: string) {
  const segment = pathname.split('/')[1];
  const locale = segment === 'en' || segment === 'zh' || segment === 'ja' ? segment : 'ko';
  return copy[locale];
}

// Only small, complete 404 documents are eligible. A clone keeps the original
// response available unchanged on read failure, timeout or an oversized body.
export const NOT_FOUND_METADATA_MAX_BYTES = 128 * 1024;
export const NOT_FOUND_METADATA_READ_TIMEOUT_MS = 1000;

// Older Node/Undici releases attach a clone finalizer to the original tee
// branch. Keep every probe Response alive for as long as its original can be
// returned to the caller; retaining just the reader is not sufficient there.
// Key by the original STREAM so a reader also keeps the clone alive after
// its Response wrapper is dropped. Weak keys do not retain abandoned streams.
const probeResponses = new WeakMap<ReadableStream<Uint8Array>, Response>();

async function completeSmallBody(response: Response, maxBytes = NOT_FOUND_METADATA_MAX_BYTES): Promise<Uint8Array<ArrayBuffer> | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    const probe = response.clone();
    probeResponses.set(response.body!, probe);
    reader = probe.body!.getReader();
  }
  catch { return null; }
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), NOT_FOUND_METADATA_READ_TIMEOUT_MS);
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result === null) return null;
      if (result.done) {
        const complete = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { complete.set(chunk, offset); offset += chunk.byteLength; }
        return complete;
      }
      size += result.value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(result.value);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    // A tee's cancellation promise can wait for the ORIGINAL branch. Never
    // await it here: the caller must still be able to consume that response.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function rewriteNotFoundMetadata(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (response.status !== 404 || mediaType !== 'text/html' || !response.body
    || request.method !== 'GET'
    || url.pathname === '/api' || url.pathname.startsWith('/api/')
    || request.headers.get('rsc') === '1'
    || request.headers.get('accept')?.includes('text/x-component')) return response;

  const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
  if (encoding && encoding !== 'identity') return response;
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > NOT_FOUND_METADATA_MAX_BYTES) return response;
  const bytes = await completeSmallBody(response);
  if (bytes === null) return response;
  try {
    const metadata = notFoundMetadataForPath(url.pathname);
    // Worker-provided API; no runtime package or browser dependency is needed.
    const { HTMLRewriter } = globalThis as unknown as { HTMLRewriter: new () => Rewriter };
    const rewritten = new HTMLRewriter()
      .on('head', { element(element) {
        // These are fixed, trusted translations, never request-supplied HTML.
        element.append(`<title>${metadata.title}</title><meta name="description" content="${metadata.description}">`, { html: true });
      } })
      .on('head title', { element(element) { element.remove(); } })
      .on('head meta', { element(element) {
        const name = element.getAttribute('name')?.toLowerCase();
        const property = element.getAttribute('property')?.toLowerCase();
        if (name === 'description') element.remove();
        else if (property === 'og:title' || name === 'twitter:title') element.setAttribute('content', metadata.title);
        else if (property === 'og:description' || name === 'twitter:description') element.setAttribute('content', metadata.description);
        else if (property === 'og:url') element.remove();
        // In particular, preserve the framework's existing robots=noindex tag.
      } })
      .on('head link', { element(element) {
        const rel = element.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? [];
        if (rel.includes('canonical') || (rel.includes('alternate') && element.getAttribute('hreflang') !== null)) element.remove();
      } })
      .transform(new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers }));
    // Fully verify the bounded transformed document before replacing anything.
    // Keep a small allowance for longer translated metadata at the input limit.
    const output = await completeSmallBody(rewritten, NOT_FOUND_METADATA_MAX_BYTES + 4096);
    void rewritten.body?.cancel().catch(() => {});
    probeResponses.delete(rewritten.body!);
    if (output === null) return response;
    const headers = new Headers(rewritten.headers);
    headers.delete('content-length');
    // A validator for the unmodified representation must not describe new bytes.
    headers.delete('etag');
    headers.delete('content-md5');
    const result = new Response(output, { status: response.status, statusText: response.statusText, headers });
    // The clone has reached EOF; release the original tee's bounded buffer.
    void response.body.cancel().catch(() => {});
    probeResponses.delete(response.body!);
    return result;
  } catch {
    // Parsing/transform setup must never replace the original error response.
    return response;
  }
}

