'use client';
import Image from 'next/image';
import styles from './departure-guide-entry.module.css';
export interface DepartureChoiceOption<Value extends string> {value:Value;label:string;image:string;testId?:string}
/** One visible, keyboard-operable control per choice; the actual state stays in HTML. */
export function DepartureChoiceGroup<Value extends string>({label,value,options,onChange,testId,description,descriptionTestId,href,linkLabel}:{label:string;value:Value;options:DepartureChoiceOption<Value>[];onChange:(value:Value)=>void;testId:string;description?:string;descriptionTestId?:string;href?:string;linkLabel?:string}) {
 return <fieldset className={styles.choiceGroup} data-testid={testId} data-value={value}>
  <legend>{label}</legend><div className={styles.choiceOptions} data-options={options.length}>
   {options.map(option=><button type="button" key={option.value} aria-pressed={value===option.value} onClick={()=>onChange(option.value)} data-testid={option.testId??`${testId}-${option.value}`}>
    <Image unoptimized src={option.image} width={256} height={256} alt="" loading="lazy" decoding="async"/>
    <span>{option.label}</span><svg className={styles.choiceMark} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6 10 3 3 5-6"/></svg>
   </button>)}
  </div>{description&&<p className={styles.choiceExplanation} role="status" data-testid={descriptionTestId}>{description}</p>}
  {href&&<a className={styles.choiceSource} href={href} target="_blank" rel="noreferrer">{linkLabel} ↗</a>}
 </fieldset>;
}
