const countries=new Intl.DisplayNames(['ko'],{type:'region'});
export interface CalendarOrderItem {start:string;country:string;name:string;countryLabel?:string;id?:string;eventId?:string;end?:string;region?:string|null;sourceURL?:string}
/** Display ordering only. Keep original dates and input arrays untouched. */
export function compareCalendarOrder(a:CalendarOrderItem,b:CalendarOrderItem){
 const country=(item:CalendarOrderItem)=>item.countryLabel??countries.of(item.country)??item.country;
 return a.start.localeCompare(b.start)||country(a).localeCompare(country(b),'ko')||a.name.localeCompare(b.name,'ko')
  ||(a.id??a.eventId??'').localeCompare(b.id??b.eventId??'')||(a.end??'').localeCompare(b.end??'')
  ||(a.region??'').localeCompare(b.region??'','ko')||(a.sourceURL??'').localeCompare(b.sourceURL??'');
}
export const sortCalendarEvents=<T extends CalendarOrderItem>(events:readonly T[]):T[]=>[...events].sort(compareCalendarOrder);
