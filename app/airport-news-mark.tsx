/** Small pre-rendered Blender decoration. Labels carry the accessible name. */
export function AirportNewsMark({topic='airport',entry=false,paper=false}:{topic?:'airport'|'customs';entry?:boolean;paper?:boolean}){
 const asset='/visuals/news/v1/'+(paper?'paper':topic)+'-news';
 // Painted size of the square mark (object-fit: contain): the guide entry's 4:3 box is 48x36 on
 // phones and 80x60 above 600px, the news entry's box 48x48 and 80x60 (departure-guide-entry.module.css).
 const sizes=!entry?'32px':paper?'(max-width: 600px) 48px, 60px':'(max-width: 600px) 36px, 60px';
 return <img src={asset+'-128.webp'} srcSet={`${asset}-64.webp 64w, ${asset}-128.webp 128w, ${asset}-256.webp 256w`} sizes={sizes} width={128} height={128} alt="" aria-hidden="true" decoding="async" loading={entry?'lazy':'eager'}/>;
}
