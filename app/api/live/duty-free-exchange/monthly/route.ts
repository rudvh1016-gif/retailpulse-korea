import { getDb } from '../../../../../db';
import { dutyFreeMonthlyCacheControl, readDutyFreeMonthly } from '../../../../../lib/duty-free-exchange-monthly';
export const dynamic='force-dynamic';
export async function GET() {
  const now=new Date();
  try {
    const db=await getDb();
    return Response.json(await readDutyFreeMonthly(db.$client,now),{headers:{'cache-control':dutyFreeMonthlyCacheControl(now.getTime())}});
  }catch {
    // Storage failures are not an empty six-month history.
    return Response.json({error:'STORAGE_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
