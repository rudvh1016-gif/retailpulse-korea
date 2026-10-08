import { getDb } from '../../../../db';
import { dutyFreeDatedPresentation, nextKstExchangeMidnight } from '../../../../lib/duty-free-exchange';
import { readDutyFreeSnapshot, unavailableDutyFreeSnapshot } from '../../../../lib/duty-free-exchange-store';

export const dynamic = 'force-dynamic';
export function dutyFreeCacheControl(nowMs: number, readable: boolean, hasToday = true) {
  const seconds = Math.floor((nextKstExchangeMidnight(nowMs)-nowMs)/1000);
  if (!readable || seconds<1) return 'no-store';
  return `public, max-age=${Math.min(hasToday?60:5,seconds)}, s-maxage=${Math.min(hasToday?300:15,seconds)}`;
}
export async function GET() {
  const now=new Date();
  try {
    const db=await getDb();
    const snapshot=await readDutyFreeSnapshot(db.$client,now);
    return Response.json(snapshot,{headers:{'cache-control':dutyFreeCacheControl(now.getTime(),true,dutyFreeDatedPresentation(snapshot,now.getTime()).some(row=>row.current))}});
  } catch {
    // No manual/static fallback is presented as a successful automated collection.
    return Response.json(unavailableDutyFreeSnapshot(now),{headers:{'cache-control':'no-store'}});
  }
}
