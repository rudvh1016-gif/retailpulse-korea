/** Additional fields from OA-21285; no extra provider request and no invented zeros. */
export interface CategoryActivity {
  group: string; category: string; level: string | null;
  payments: number | null; amountMin: number | null; amountMax: number | null;
}
export interface SeoulContext {
  commercialAt: string | null; categories: CategoryActivity[];
  weather: null | { observedAt: string; temperature: number | null; humidity: number | null;
    wind: number | null; pm10: number | null; pm25: number | null;
    pm10Grade: string | null; pm25Grade: string | null };
}
/** A combined snapshot is ordered by its latest observation, while each metric keeps its own time. */
export function seoulContextObservedAt(context: SeoulContext): string | null {
  return [context.commercialAt, context.weather?.observedAt]
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1) ?? null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function label(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.trim() !== '*' ? value.trim().slice(0,100) : null;
}
function number(value: unknown, min = 0, max = 1e12): number | null {
  if (value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '*') return null;
  const parsed = Number(String(value).replaceAll(',',''));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
export function seoulContextTime(value: unknown): string | null {
  const text = label(value)?.replace(/^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})$/, "$1-$2-$3 $4:$5");
  if (!text || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) return null;
  const iso = text.replace(' ','T').slice(0,19);
  const result = `${iso.length === 16 ? iso + ':00' : iso}+09:00`;
  return Number.isFinite(Date.parse(result)) ? result : null;
}
export function normalizeSeoulContext(city: Record<string,unknown>): SeoulContext {
  const commercial = object(city.LIVE_CMRCL_STTS);
  const categories: CategoryActivity[] = [];
  if (Array.isArray(commercial.CMRCL_RSB)) for (const input of commercial.CMRCL_RSB.slice(0,100)) {
    const row = object(input);
    const group = label(row.RSB_LRG_CTGR), category = label(row.RSB_MID_CTGR);
    if (!group || !category) continue;
    let amountMin = number(row.RSB_SH_PAYMENT_AMT_MIN), amountMax = number(row.RSB_SH_PAYMENT_AMT_MAX);
    if (amountMin !== null && amountMax !== null && amountMax < amountMin) { amountMin = null; amountMax = null; }
    categories.push({group, category, level:label(row.RSB_PAYMENT_LVL), payments:number(row.RSB_SH_PAYMENT_CNT), amountMin, amountMax});
  }
  const raw = object(Array.isArray(city.WEATHER_STTS) ? city.WEATHER_STTS[0] : city.WEATHER_STTS);
  const observedAt = seoulContextTime(raw.WEATHER_TIME);
  return { commercialAt: seoulContextTime(commercial.CMRCL_TIME), categories,
    weather: observedAt ? { observedAt, temperature:number(raw.TEMP,-80,65), humidity:number(raw.HUMIDITY,0,100),
      wind:number(raw.WIND_SPD,0,150), pm10:number(raw.PM10,0,2000), pm25:number(raw.PM25,0,2000),
      pm10Grade:label(raw.PM10_INDEX), pm25Grade:label(raw.PM25_INDEX) } : null };
}
