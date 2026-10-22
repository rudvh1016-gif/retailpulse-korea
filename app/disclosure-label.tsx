/** Keep translated labels byte-for-byte intact while leaving embedded counts
 * at body weight. An optional leading title keeps a longer explanation quiet. */
export function DisclosureLabel({text,title}:{text:string;title?:string}) {
 if(title && text.startsWith(title))return <><span data-disclosure-title>{title}</span><span data-disclosure-meta>{text.slice(title.length)}</span></>;
 return <span data-disclosure-title>{text.split(/(\d+(?:[.,/]\d+)*)/u).map((part,index)=>/^\d/u.test(part)?<span key={index} data-disclosure-meta>{part}</span>:part)}</span>;
}
