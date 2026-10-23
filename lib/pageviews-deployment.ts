/** Fail-closed, pre-D1 deployment gate. Do not turn on merely because migration
 * exists: current usage, measured D1/CPU cost and effective request-abuse
 * mitigation (or an explicit reviewed bounded-risk decision) are still required.
 * No credentials, paid service, new binding or security setting is introduced.
 */
export const PAGEVIEWS_DEPLOYMENT_ENABLED = false;
