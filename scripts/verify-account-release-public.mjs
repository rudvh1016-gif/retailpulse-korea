import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

const privacyVersionPattern = /^[A-Za-z0-9._-]{1,80}$/;
const privacyPathPattern = /^\/[A-Za-z0-9][A-Za-z0-9/_-]*\/?$/;

function verifiedPolicyLink(document, homepage, expectedPolicy) {
  return [...document.querySelectorAll('a[href]')].some(link => {
    if (!link.textContent.trim() || link.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    try {
      return new URL(link.getAttribute('href'), homepage).href === expectedPolicy.href;
    } catch {
      return false;
    }
  });
}

function verifiedPolicyPage(document) {
  const main = document.querySelector('main');
  const visible = element => !element.closest('[hidden], [inert], [aria-hidden="true"]');
  const heading = main?.querySelector('h1');
  return Boolean(heading && visible(heading) && /^(?:(?:코리테일|KORETAIL)\s+)?개인정보\s*처리방침$/iu.test(heading.textContent.trim()) &&
    [...main.querySelectorAll('p, li, dd')].some(element => visible(element) && element.textContent.trim()));
}

async function readHtml(response, inspect) {
  if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')) return false;
  const dom = new JSDOM(await response.text());
  try {
    dom.window.document.querySelectorAll('script, style, template').forEach(element => element.remove());
    return inspect(dom.window.document);
  } finally {
    dom.window.close();
  }
}

async function privateJsonMatches(response, expectedStatus, expected) {
  if (response.status !== expectedStatus || response.headers.has('set-cookie')) return false;
  if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) return false;
  const directives = (response.headers.get('cache-control') ?? '').toLowerCase().split(',').map(value => value.trim());
  if (!directives.includes('private') || !directives.includes('no-store')) return false;
  if (response.headers.get('referrer-policy') !== 'no-referrer') return false;
  const value = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(expected);
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && value[key] === expected[key]);
}

// Anonymous public evidence only. Provider configuration, registered consent URLs,
// account storage and actual sign-in require separate evidence.
export async function verifyAccountReleasePublic({mode, origin, privacyPath, privacyVersion}, fetcher = fetch) {
  if ((mode !== 'policy' && mode !== 'account') || typeof origin !== 'string' ||
      typeof privacyPath !== 'string' || !privacyPathPattern.test(privacyPath) || privacyPath.includes('//') ||
      (mode === 'account' && (typeof privacyVersion !== 'string' || !privacyVersionPattern.test(privacyVersion))) ||
      (mode === 'policy' && privacyVersion !== undefined)) throw Error('INVALID_INPUT');
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin) throw Error('INVALID_ORIGIN');
  const homepage = new URL('/ko', base);
  const privacyPolicy = new URL(privacyPath, base);
  const get = (url, inspect) => Promise.resolve().then(async () => {
    const response = await fetcher(url, {
      method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: {'cache-control': 'no-cache'}, signal: AbortSignal.timeout(10000),
    });
    return {httpStatus: response.status, verified: await inspect(response).catch(() => false)};
  }).catch(() => ({httpStatus: null, verified: false}));

  const probes = {
    homepagePrivacyLink: get(homepage, response => readHtml(response, document => verifiedPolicyLink(document, homepage, privacyPolicy))),
    privacyPage: get(privacyPolicy, response => readHtml(response, verifiedPolicyPage)),
  };
  if (mode === 'account') {
    probes.accountPage = get(new URL('/ko/account', base), response => readHtml(response, document =>
      document.querySelector('main h1')?.textContent.trim() === '내 계정'));
    probes.signedOutStatus = get(new URL('/api/account/status', base), response => privateJsonMatches(response, 200,
      {enabled: true, authenticated: false, privacyVersion}));
    probes.privateStateRejected = get(new URL('/api/account/state', base), response => privateJsonMatches(response, 401,
      {error: 'UNAUTHENTICATED'}));
  }
  const checks = Object.fromEntries(await Promise.all(Object.entries(probes).map(async ([name, result]) => [name, await result])));
  return {mode, checkedAt: new Date().toISOString(), publicChecksPassed: Object.values(checks).every(check => check.verified), checks};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, origin, privacyPath, privacyVersion, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw Error('INVALID_INPUT');
    const result = await verifyAccountReleasePublic({mode, origin, privacyPath, privacyVersion});
    console.log(JSON.stringify(result, null, 2));
    if (!result.publicChecksPassed) process.exitCode = 1;
  } catch {
    console.error('Usage: node scripts/verify-account-release-public.mjs policy https://ORIGIN /PRIVACY-PATH');
    console.error('       node scripts/verify-account-release-public.mjs account https://ORIGIN /PRIVACY-PATH POLICY-VERSION');
    process.exitCode = 2;
  }
}
