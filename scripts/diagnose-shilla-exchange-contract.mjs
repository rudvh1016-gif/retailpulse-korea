/** Manual, read-only contract diagnosis. No collector/DB imports or raw-page logging. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SHILLA_DIAGNOSTIC_URL = 'https://www.shilladfs.com/estore/kr/ko/';
export const SHILLA_DIAGNOSTIC_MAX_BYTES = 1024 * 1024;
export const SHILLA_DIAGNOSTIC_TIMEOUT_MS = 12_000;
const tags = new Set(['div', 'span', 'p', 'a', 'li', 'dl', 'dt', 'dd', 'em', 'strong', 'b', 'small', 'time']);
// Literal public presentation vocabulary only; never print arbitrary class/id/attribute values.
const classes = new Set(['exchange', 'sum', 'rate', 'exchangeRate', 'exchange-rate', 'todayRate', 'today-rate', 'tit', 'title', 'txt', 'text', 'value', 'amount', 'date']);
const labels = ['오늘의 환율', '오늘 환율', '금일 환율', '적용 환율', '적용환율', '환율'];
const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ignored = new Set(['script', 'style', 'template', 'noscript', 'form', 'button', 'select', 'textarea', 'svg', 'iframe', 'object']);
const number = '(?:[1-9]\\d{0,2}(?:,\\d{3})+|[1-9]\\d{0,4})(?:\\.\\d{1,2})?';
const ratePattern = new RegExp(`(?:USD\\s*1|1\\s*USD|\\$\\s*1|1\\s*\\$)\\s*[=:]\\s*(${number})\\s*(?:원|KRW|₩)`, 'gi');
const datePattern = /\b(20\d{2})[./-](\d{2})[./-](\d{2})\b/g;

// Linear scanning avoids unbounded regex work on malformed/unterminated tags.
function htmlTokens(html) {
  const tokens = [], lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < html.length) {
    if (tokens.length >= 40000) return null;
    if (html[cursor] !== '<') {
      const next = html.indexOf('<', cursor);
      const end = next < 0 ? html.length : next;
      tokens.push(html.slice(cursor, end)); cursor = end;
      continue;
    }
    const end = html.indexOf('>', cursor + 1);
    if (end < 0 || end - cursor > 4096) return null;
    const token = html.slice(cursor, end + 1);
    tokens.push(token); cursor = end + 1;
    const rawTag = /^<(script|style|textarea)\b/i.exec(token)?.[1].toLowerCase();
    if (rawTag) {
      let close = lower.indexOf(`</${rawTag}`, cursor);
      while (close >= 0 && !/[\s>]/.test(lower[close + rawTag.length + 2] ?? '')) close = lower.indexOf(`</${rawTag}`, close + rawTag.length + 2);
      if (close < 0) return null;
      cursor = close; // Never tokenize script/style/input text as public markup.
    }
  }
  return tokens;
}

function entities(value) {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/&nbsp;/gi, ' ').replace(/&dollar;/gi, '$').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function publicFields(value) {
  let rest = entities(value);
  const label = labels.find(item => rest.includes(item)) ?? null;
  const rates = [];
  rest = rest.replace(ratePattern, (_, amount) => {
    const rate = Number(amount.replaceAll(',', ''));
    if (rate >= 100 && rate <= 10000) rates.push(rate.toFixed(2));
    else return 'INVALID';
    return '';
  });
  const dates = [];
  rest = rest.replace(datePattern, (_, year, month, day) => {
    const date = `${year}-${month}-${day}`;
    const at = Date.parse(`${date}T00:00:00Z`);
    if (Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === date) dates.push(date);
    else return 'INVALID';
    return '';
  });
  for (const item of labels) rest = rest.replaceAll(item, '');
  rest = rest.replace(/(?:적용|기준|오늘|내일|익일|전일|어제|effective|today|tomorrow|yesterday)/gi, '');
  // Reject mixed text, arbitrary identifiers, URLs, account values, and stray numbers.
  if (!/^[\s()[\]:=.,/-]*$/.test(rest)) return null;
  return { label, rates: [...new Set(rates)], dates: [...new Set(dates)] };
}

/** Conservative bounded HTML token inspection, not a browser or a rate publication parser. */
export function sanitizeShillaExchangeEvidence(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > SHILLA_DIAGNOSTIC_MAX_BYTES) return [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const tokens = htmlTokens(clean);
  if (!tokens) return [];
  const markup = tokens.filter(token => token.startsWith('<')).join('');
  // Stop, rather than attempting login, challenge solving, or another request.
  const title = entities(/<title\b[^>]*>([^<]*)<\/title\s*>/i.exec(clean)?.[1] ?? '');
  if (/(?:access denied|forbidden|security check|just a moment|captcha|sign in|log in|login|로그인|접근.*차단|보안.*확인)/i.test(title)
    || /<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(markup)
    || /<(?!script\b)[a-z][^>]*\b(?:id|class)\s*=\s*["'][^"']*(?:captcha|cf-challenge|challenge-form)[^"']*["']/i.test(markup)) return [];
  const nodes = [], stack = [];
  let blocked = false;
  for (const token of tokens) {
    if (token[0] !== '<') {
      if (stack.some(node => node.ignored)) continue;
      const text = entities(token);
      if (/(?:verify (?:that )?you are human|unusual traffic|access denied|enable javascript and cookies to continue|captcha|security check|login required|sign in required|자동입력 방지|접근이 차단|보안문자|로그인이 필요)/i.test(text)
        || (stack.some(node => ['h1', 'h2'].includes(node.tag)) && /^(?:login|log in|sign in|로그인)$/i.test(text))) blocked = true;
      for (const node of stack) {
        if (node.text.length <= 256) node.text += token;
      }
      continue;
    }
    const tag = /^<\/?([a-z][\w:-]*)/i.exec(token)?.[1].toLowerCase();
    if (!tag) continue;
    if (token.startsWith('</')) {
      const index = stack.map(node => node.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      continue;
    }
    const attribute = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(token);
    const safeClasses = [...new Set((attribute?.[1] ?? attribute?.[2] ?? attribute?.[3] ?? '').split(/\s+/).filter(item => classes.has(item)))];
    const node = { tag, classes: safeClasses, text: '', parent: stack.at(-1), ignored: ignored.has(tag) || stack.some(parent => parent.ignored) };
    if (!node.ignored && tags.has(tag)) nodes.push(node);
    if (!voids.has(tag) && !token.endsWith('/>')) stack.push(node);
    if (stack.length > 64) return [];
  }
  if (blocked) return [];
  const evidence = [];
  for (const node of nodes) {
    if (node.text.length > 256) continue;
    const fields = publicFields(node.text);
    if (!fields) continue;
    let owner = node;
    while (owner && !owner.classes.some(item => ['exchange', 'exchangeRate', 'exchange-rate', 'todayRate', 'today-rate'].includes(item))
      && !(owner.text.length <= 256 && publicFields(owner.text)?.label)) owner = owner.parent;
    if (!owner || (!fields.label && !fields.rates.length && !fields.dates.length)) continue;
    evidence.push({ tag: node.tag, classes: node.classes, ...fields });
    if (evidence.length === 12) break;
  }
  return evidence;
}

/** Injected fetch/time only support offline fixtures. No URL override or retry exists. */
export async function diagnoseShillaExchange({ fetchImpl = fetch, timeoutMs = SHILLA_DIAGNOSTIC_TIMEOUT_MS } = {}) {
  const report = { httpStatus: null, contentType: null, bodyBytes: 0, bodySha256: null, exchangeEvidence: [] };
  const controller = new AbortController();
  const budget = Number.isInteger(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, SHILLA_DIAGNOSTIC_TIMEOUT_MS) : SHILLA_DIAGNOSTIC_TIMEOUT_MS;
  let timer, response, reader;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, budget);
  });
  const cancel = () => {
    controller.abort();
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* Never log raw errors. */ }
  };
  try {
    response = await Promise.race([fetchImpl(SHILLA_DIAGNOSTIC_URL, {
      method: 'GET', headers: { accept: 'text/html' }, redirect: 'manual', credentials: 'omit', signal: controller.signal,
    }), expired]);
    report.httpStatus = response.status;
    const contentType = response.headers.get('content-type') ?? '';
    report.contentType = /^(text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.exec(contentType)?.[1].toLowerCase() ?? 'OTHER';
    if (response.status !== 200 || report.contentType === 'OTHER' || !response.body
      || Number(response.headers.get('content-length')) > SHILLA_DIAGNOSTIC_MAX_BYTES) return { ok: false, report };
    reader = response.body.getReader();
    const parts = [];
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      if (report.bodyBytes + value.byteLength > SHILLA_DIAGNOSTIC_MAX_BYTES) return { ok: false, report };
      report.bodyBytes += value.byteLength;
      parts.push(value);
    }
    const body = Buffer.concat(parts, report.bodyBytes);
    report.bodySha256 = createHash('sha256').update(body).digest('hex');
    const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1].toLowerCase() ?? 'utf-8';
    if (!['utf-8', 'utf8', 'euc-kr'].includes(charset)) return { ok: false, report };
    const html = new TextDecoder(charset, { fatal: true }).decode(body);
    report.exchangeEvidence = sanitizeShillaExchangeEvidence(html);
    return { ok: report.exchangeEvidence.some(item => item.rates.length), report };
  } catch {
    return { ok: false, report }; // Network/encoding errors never leak URLs, headers or session data.
  } finally {
    clearTimeout(timer);
    cancel();
    try { reader?.releaseLock(); } catch { /* A timed-out read may still be settling. */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Requiring the exact opt-in prevents an accidental bare invocation from contacting the source.
  if (process.argv.length !== 3 || process.argv[2] !== '--once') process.exitCode = 2;
  else {
    const { ok, report } = await diagnoseShillaExchange();
    console.log(JSON.stringify(report));
    process.exitCode = ok ? 0 : 1;
  }
}
