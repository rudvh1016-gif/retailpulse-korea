import { holidaysOn, isPublished } from "./holiday-calendar";

/**
 * China's and Japan's official holidays on a service date (never an adjusted
 * working day), from the verified calendar. Korea's come in the summary.
 */
export function officialHolidaysOn(serviceDate: string) {
  return holidaysOn(serviceDate).map((day) => ({
    country: day.country, date: serviceDate, name: day.name,
    source: day.country === "CN" ? "gov.cn 国办发明电〔2025〕7号" : "内閣府 国民の祝日",
  }));
}

/** CN/JP official holiday status of a date, or null outside the published calendar years. */
export const cnJpHoliday = (day: string) => isPublished("CN", day) && isPublished("JP", day) ? holidaysOn(day).length > 0 : null;
