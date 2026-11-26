import {parsePersonalState,type PersonalState} from './model';
function escapeText(value:string){return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function stamp(ms:number){return new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
/** RFC 5545 folds by UTF-8 octets, never in the middle of a Unicode codepoint. */
function fold(line:string){
 let result='',current='',bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>75){result+=current+'\r\n';current=' ';bytes=1;}current+=char;bytes+=size;}return result+current;
}
export function exportShiftCalendar(state:PersonalState,now=new Date().toISOString()):string{
 const safe=parsePersonalState(state),clock=Date.parse(now);if(!Number.isFinite(clock))throw Error('INVALID_TIMESTAMP');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//KORETAIL//Personal Shifts//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const assignment of safe.assignments){
  const pattern=safe.patterns.find(p=>p.id===assignment.patternId)!;
  const start=Date.parse(assignment.date+'T'+pattern.open+':00+09:00');
  let end=Date.parse(assignment.date+'T'+pattern.close+':00+09:00');if(end<=start)end+=86400000;
  lines.push('BEGIN:VEVENT','UID:'+assignment.date+'-'+pattern.id+'@koretaildata.com','DTSTAMP:'+stamp(clock),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),'SUMMARY:'+escapeText(pattern.label),'DESCRIPTION:'+escapeText('KORETAIL '+pattern.terminal+' · '+(pattern.side??'전체')+' · 가져온 이후 변경은 자동 동기화되지 않습니다.'));
  const minutes=safe.notificationPreferences.beforeShiftMinutes;
  if(minutes)lines.push('BEGIN:VALARM','TRIGGER:-PT'+minutes+'M','ACTION:DISPLAY','DESCRIPTION:'+escapeText(pattern.label+' 근무 준비'),'END:VALARM');
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
