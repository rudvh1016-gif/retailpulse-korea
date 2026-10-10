'use client';
import {useId} from 'react';
import styles from './departure-guide-entry.module.css';

export interface DepartureChoiceOption<Value extends string> {value:Value;label:string;testId?:string}
/** Compact native buttons retain one explicit selected value and the real guide state. */
export function DepartureChoiceGroup<Value extends string>({label,value,options,onChange,testId,description,descriptionTestId,href,linkLabel}:{label:string;value:Value;options:DepartureChoiceOption<Value>[];onChange:(value:Value)=>void;testId:string;description?:string;descriptionTestId?:string;href?:string;linkLabel?:string}) {
 const descriptionId=useId();
 return <fieldset className={styles.choiceGroup} data-testid={testId} data-value={value} aria-describedby={description?descriptionId:undefined}>
  <legend>{label}</legend>
  <div className={styles.choiceOptions} data-options={options.length}>
   {options.map(option=><button type="button" key={option.value} aria-pressed={value===option.value} onClick={()=>onChange(option.value)} data-testid={option.testId??`${testId}-${option.value}`}>
    <svg className={styles.choiceMark} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6 10 3 3 5-6"/></svg>
    <span>{option.label}</span>
   </button>)}
  </div>
  {(description||href)&&<div className={styles.choiceDetails}>
   {description&&<p id={descriptionId} className={styles.choiceExplanation} role="status" data-testid={descriptionTestId}>{description}</p>}
   {href&&<a className={styles.choiceSource} href={href} target="_blank" rel="noopener noreferrer">{linkLabel} ↗</a>}
  </div>}
 </fieldset>;
}
