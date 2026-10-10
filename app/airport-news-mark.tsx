/** Small pre-rendered Blender decoration. Labels carry the accessible name. */
export function AirportNewsMark({topic='airport',entry=false}:{topic?:'airport'|'customs';entry?:boolean}){
 const asset='/visuals/news/v1/'+topic+'-news';
 return <img src={asset+'-128.webp'} srcSet={`${asset}-64.webp 64w, ${asset}-128.webp 128w, ${asset}-256.webp 256w`} sizes={entry?'(max-width: 600px) 48px, 80px':'32px'} width={128} height={128} alt="" aria-hidden="true" decoding="async" loading={entry?'lazy':'eager'}/>;
}
