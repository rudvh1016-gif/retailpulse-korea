export type PassengerGuideAsset='terminal'|'checkin'|'security'|'immigration'|'boarding'|'refund_register'|'refund_receive';
/** Decorative Blender renders; procedure names and sign labels stay in HTML. */
export function PassengerGuideImage({asset}:{asset:PassengerGuideAsset}) {
 return <span className="passenger-guide-image" aria-hidden="true">
  <img src={`/passenger-guide/v1/${asset}-128.webp`} alt="" width={128} height={128} loading="lazy" decoding="async"/>
  {asset==='terminal'&&<><span className="passenger-terminal-label passenger-terminal-label-t1" translate="no">T1</span><span className="passenger-terminal-label passenger-terminal-label-t2" translate="no">T2</span></>}
 </span>;
}
