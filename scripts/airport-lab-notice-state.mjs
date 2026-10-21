import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Both builds must be measured as returning readers. The baseline can use a
 * different notice version, so load its checked-out helper rather than seed
 * the candidate's key into both origins. Never fall back on a missing helper.
 */
export async function loadLabNoticeDismissal(modulePath) {
 const moduleUrl=modulePath?pathToFileURL(resolve(modulePath)):new URL('./update-notice-test-state.mjs',import.meta.url);
 const loaded=await import(moduleUrl.href);
 if(typeof loaded.noticeDismissedState!=='function')throw new Error('LAB_NOTICE_HELPER_MISSING');
 return loaded.noticeDismissedState;
}
