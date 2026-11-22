'use client';

import { useState } from 'react';
import { planRepeatedAssignments, type PersonalCommand, type PersonalState } from '../../lib/personal-tools/model';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

export function RepeatShifts({ day, state, send }: { day: string; state: PersonalState; send: (command: PersonalCommand) => Promise<boolean> }) {
  const [start, setStart] = useState(day);
  const [end, setEnd] = useState(day);
  const [selected, setSelected] = useState([1, 2, 3, 4, 5]);
  const [patternId, setPatternId] = useState('');
  let plan = null;
  try { plan = planRepeatedAssignments(state.assignments, start, end, selected); } catch { /* The form explains invalid ranges. */ }
  const patternExists = state.patterns.some(pattern => pattern.id === patternId);
  return <details className="pt-inset">
    <summary>같은 근무 여러 날 배정</summary>
    <form onSubmit={event => {
      event.preventDefault();
      if (patternExists && plan?.dates.length) void send({type:'assignment.repeat',start,end,weekdays:selected,patternId});
    }}>
      <label>반복 시작일<input type="date" required value={start} onChange={event=>setStart(event.target.value)}/></label>
      <label>반복 종료일<input type="date" required min={start} value={end} onChange={event=>setEnd(event.target.value)}/></label>
      <label>반복할 패턴<select required value={patternId} onChange={event=>setPatternId(event.target.value)}>
        <option value="">선택</option>{state.patterns.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <div role="group" aria-label="반복 요일">{weekdays.map((label, value)=><label className="pt-check" key={value}>
        <input type="checkbox" checked={selected.includes(value)} onChange={event=>setSelected(current=>event.target.checked
          ? [...current,value] : current.filter(item=>item!==value))}/>{label}
      </label>)}</div>
      <p role="status">{plan?`새로 배정 ${plan.dates.length}일 · 이미 배정된 날짜 ${plan.skipped}일`:'31일 이내 날짜와 요일을 선택해 주세요.'}</p>
      <button type="submit" disabled={!patternExists||!plan?.dates.length}>반복 근무 저장</button>
    </form>
  </details>;
}
