export const publicPrivacyPath = '/ko/privacy';

const fields = ['version', 'effectiveDate', 'operator', 'email', 'processing', 'rights', 'retention', 'providers', 'overseas', 'logs'] as const;
type PublicPrivacyPolicy = Record<(typeof fields)[number], string>;

export function parsePublicPrivacyPolicy(raw: unknown): PublicPrivacyPolicy | null {
  if (typeof raw !== 'string' || raw.length > 20_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const source = parsed as Record<string, unknown>;
    const entries = fields.map(field => [field, typeof source[field] === 'string' ? source[field].trim() : '']);
    const policy = Object.fromEntries(entries) as PublicPrivacyPolicy;
    if (fields.some(field => !policy[field]) || policy.operator.length > 100
      || !/^[A-Za-z0-9._-]{1,80}$/.test(policy.version)
      || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(policy.email)
      || policy.email.length > 254
      || !/^\d{4}-\d{2}-\d{2}$/.test(policy.effectiveDate)
      || new Date(policy.effectiveDate + 'T00:00:00Z').toISOString().slice(0, 10) !== policy.effectiveDate) return null;
    return policy;
  } catch {
    return null;
  }
}

export async function getPublicPrivacyPolicy() {
  try {
    const { env } = await import('cloudflare:workers');
    return parsePublicPrivacyPolicy(env.KORETAIL_PUBLIC_PRIVACY_POLICY);
  } catch {
    return null;
  }
}
