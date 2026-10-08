import { getDb } from '../../../../db';
import { nextKstExchangeMidnight } from '../../../../lib/duty-free-exchange';
import { readDutyFreeSnapshot, unavailableDutyFreeSnapshot } from '../../../../lib/duty-free-exchange-store';

export const dynamic = 'force-dynamic';
export function dutyFreeCacheControl(nowMs: number, readable: boolean) {
  const seconds = Math.floor((nextKstExchangeMidnight(nowMs)-nowMs)/1000);
  if (!readable || seconds<1) return 'no-store';
  return `public, max-age=${Math.min(60,seconds)}, s-maxage=${Math.min(300,seconds)}`;
}
export async function GET() {
  const now=new Date();
  try {
    const db=await getDb();
    const snapshot=await readDutyFreeSnapshot(db.$client,now);
    return Response.json(snapshot,{headers:{'cache-control':dutyFreeCacheControl(now.getTime(),true)}});
  } catch {
    // No manual/static fallback is presented as a successful automated collection.
    return Response.json(unavailableDutyFreeSnapshot(now),{headers:{'cache-control':'no-store'}});
  }
}
