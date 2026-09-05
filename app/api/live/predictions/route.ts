import { getDb } from '../../../../db';
import { kstDayOf,shiftKstDay } from '../../../../lib/kst';
import { POPULATION_MODEL } from '../../../../lib/population-predictions';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const area=new URL(request.url).searchParams.get('area')??'myeongdong';
  if(!['myeongdong','hongdae','seongsu'].includes(area)) return Response.json({error:'invalid_area'},{status:400});
  try {
    const db=(await getDb()).$client, today=kstDayOf(new Date().toISOString()), tomorrow=shiftKstDay(today,1);
    const [run,coverage,records]=await Promise.all([
      db.prepare('SELECT payload FROM forecast_runs WHERE area=? AND target_date=?').bind(area,tomorrow).first<{payload:string}>(),
      db.prepare('SELECT payload FROM area_data_coverage WHERE area=?').bind(area).first<{payload:string}>(),
      db.prepare(`SELECT p.target_at AS targetAt,p.value AS predicted,p.created_at AS createdAt,o.actual_value AS actual,o.event_at AS actualAt
        FROM predictions p LEFT JOIN outcomes o ON o.prediction_id=p.prediction_id
        WHERE p.area=? AND p.model_version=? AND p.target_at>=? AND p.target_at<? ORDER BY p.target_at DESC LIMIT 168`)
        .bind(area,POPULATION_MODEL,shiftKstDay(today,-7),tomorrow).all(),
    ]);
    return Response.json({area,targetDate:tomorrow,run:run?JSON.parse(run.payload):null,coverage:coverage?JSON.parse(coverage.payload):null,records:records.results??[],
      generatedAt:new Date().toISOString()},{headers:{'cache-control':'public, max-age=60, s-maxage=120'}});
  } catch { return Response.json({error:'prediction_data_unavailable'},{status:503,headers:{'cache-control':'no-store'}}); }
}
