/** Offline, bounded IWXXM observation reader. No I/O or external XML resolution. */
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x:null;
const local=k=>String(k).replace(/^.*:/,'');
const known=new Set(['item','METAR','SPECI','msgText','metarMsg','xml','message','observation','OM_Observation','phenomenonTime','TimeInstant','timePosition','featureOfInterest','SF_SpatialSamplingFeature','sampledFeature','AirportHeliport','timeSlice','AirportHeliportTimeSlice','designator','locationIndicatorICAO','result','MeteorologicalAerodromeObservationRecord','airTemperature','dewpointTemperature','qnh','surfaceWind','AerodromeSurfaceWind','meanWindDirection','meanWindSpeed','windGustSpeed','visibility','AerodromeHorizontalVisibility','prevailingVisibility','prevailingVisibilityOperator','content','#text','_text','_','$t','value','uom']);
const safeKey=k=>known.has(local(k))&&/^(?:(?:iwxxm|om|gml|aixm|sams|sf|metce):)?[A-Za-z_][\w.-]*$/.test(k)?k:known.has(k)?k:'[OTHER]';
const type=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const kids=(node,name)=>node?.children?.filter(x=>x.name===name)??[];
const descendants=(node,name)=>{const out=[];const walk=n=>{if(n.name===name)out.push(n);for(const c of n.children)walk(c);};if(node)walk(node);return out;};
const one=a=>a.length===1?a[0]:null;
const scalar=n=>n&&n.children.length===0&&typeof n.text==='string'?n.text.trim():null;
const textKeys=new Set(['content','#text','_text','_','$t','value']);
const attrKeys=new Set(['uom','status','permissibleUsage','nilReason','nil','href','id','cloudAndVisibilityOK']);

function validTime(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s))return null;
 const d=new Date(s);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,19)===s.slice(0,19)?s:null;
}
function entity(s){return s.replace(/&([^;]+);/g,(_,v)=>{
 const fixed={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(own(fixed,v))return fixed[v];
 const n=/^#x[0-9a-f]+$/i.test(v)?parseInt(v.slice(2),16):/^#\d+$/.test(v)?Number(v.slice(1)):NaN;
 if(!Number.isInteger(n)||n<=0||n>0x10ffff||(n>=0xd800&&n<=0xdfff))throw Error('Invalid XML entity');return String.fromCodePoint(n);
});}

/** Restricted XML tree: rejects DTD/entities, malformed markup and excessive work. */
function xmlTree(xml,path){
 if(xml.length>131072||/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml))throw Error('Unsupported XML');
 const document={name:'document',children:[],text:'',attrs:{},path},stack=[document];let cursor=0,count=0;
 const tokens=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g;
 for(const m of xml.matchAll(tokens)){
  if(m.index!==cursor)throw Error('Malformed XML');cursor=m.index+m[0].length;const token=m[0],parent=stack.at(-1);
  if(token.startsWith('<!--'))continue;
  if(token.startsWith('<?')){if(!/^<\?xml\s[^?]*\?>$/.test(token)||document.children.length)throw Error('Unsupported XML PI');continue;}
  if(token.startsWith('<![CDATA[')){parent.text+=token.slice(9,-3);continue;}
  if(!token.startsWith('<')){parent.text+=entity(token);continue;}
  if(token.startsWith('</')){const name=token.slice(2,-1).trim();if(stack.length<=1||name!==parent.fullName)throw Error('Unbalanced XML');stack.pop();continue;}
  const start=token.match(/^<([A-Za-z_][\w.:-]*)([\s\S]*?)\s*(\/?)>$/);if(!start||++count>4096||stack.length>32)throw Error('Unsupported XML markup');
  const attrs={},attrSource=start[2],attr=/\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;let end=0;
  for(const a of attrSource.matchAll(attr)){if(attrSource.slice(end,a.index).trim())throw Error('Malformed XML attributes');end=a.index+a[0].length;const name=local(a[1]);if(attrKeys.has(name)){if(own(attrs,name))throw Error('Duplicate XML attribute');attrs[name]=entity(a[2]??a[3]);}}
  if(attrSource.slice(end).trim())throw Error('Malformed XML attributes');
  const node={name:local(start[1]),fullName:start[1],children:[],text:'',attrs,path:`${parent.path}.${safeKey(start[1])}`,sourceType:'string'};parent.children.push(node);if(start[3]!=='/')stack.push(node);
 }
 if(cursor!==xml.length||stack.length!==1||document.text.trim()||document.children.length!==1)throw Error('Malformed XML document');return document.children[0];
}

function jsonTree(value,name,path,budget,depth=0){
 if(++budget.nodes>4096||depth>32)throw Error('JSON shape limit');
 const node={name:local(name),children:[],text:'',attrs:{},path,sourceType:type(value)};
 if(typeof value==='string'||typeof value==='number'){node.text=String(value);return node;}
 if(!obj(value))return node;
 for(const[k,v]of Object.entries(value)){
  const normalized=local(k.replace(/^@_?/,'')).replace(/^\$/,'');
  if(attrKeys.has(normalized)&&(typeof v==='string'||typeof v==='boolean')){node.attrs[normalized]=String(v);continue;}
  if((k==='$'||k==='attributes')&&obj(v)){for(const[a,b]of Object.entries(v))if(attrKeys.has(local(a))&&['string','boolean'].includes(typeof b))node.attrs[local(a)]=String(b);continue;}
  if(textKeys.has(k)&&(typeof v==='string'||typeof v==='number')){if(node.text)throw Error('Ambiguous scalar');node.text=String(v);continue;}
  if(k.startsWith('xmlns'))continue;
  const values=Array.isArray(v)?v:[v];if(values.length>100)throw Error('JSON array limit');
  for(const item of values)node.children.push(jsonTree(item,k,`${path}.${safeKey(k)}${Array.isArray(v)?'[]':''}`,budget,depth+1));
 }return node;
}

const measures={airTemperature:['Cel',-100,100],dewpointTemperature:['Cel',-100,100],qnh:['hPa',100,1200],meanWindDirection:['deg',0,360],meanWindSpeed:[['m/s','[kn_i]'],0,500],windGustSpeed:[['m/s','[kn_i]'],0,500],prevailingVisibility:['m',0,100000]};
const reportMessage=node=>one([...kids(node,'msgText')]);
function structurePaths(root){
 const paths=[];const walk=node=>{if(paths.length>=64)return;if(known.has(node.name)){paths.push({path:node.path,type:node.sourceType});if(node.attrs.uom)paths.push({path:`${node.path}.@uom`,type:'string'});}for(const child of node.children)walk(child);};walk(root);return paths.slice(0,64);
}

function observationFromTree(root){
 const messageNode=reportMessage(root),message=scalar(messageNode);
 const tac=message?.match(/^(METAR|SPECI)\s+(?:COR\s+)?([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})Z(?:\s|$)/);
 const flat=root.name==='item',reportType=flat?tac?.[1]:['METAR','SPECI'].includes(root.name)?root.name:null;
 if(!reportType)return{reason:'REPORT_TYPE_UNVERIFIED'};
 if(tac&&tac[1]!==reportType)return{reason:'CONFLICTING_REPORT_TYPE'};
 if(root.attrs.status==='MISSING'||(message&&/\sNIL(?:\s|=|$)/.test(message)))return{reason:'NO_OBSERVATION'};
 if(root.attrs.permissibleUsage&&root.attrs.permissibleUsage!=='OPERATIONAL')return{reason:'NON_OPERATIONAL_REPORT'};
 let observedNode,timeValue,station;
 const obs=flat?null:one(kids(one(kids(root,'observation')),'OM_Observation'));
 if(flat){observedNode=one(kids(root,'phenomenonTime'));timeValue=scalar(observedNode);station=tac?.[2];}
 else{
  if(!obs)return{reason:'OBSERVATION_BRANCH_UNVERIFIED'};
  const phenomenon=one(kids(obs,'phenomenonTime'));
  let instant=one(kids(phenomenon,'TimeInstant'));
  if(!instant&&phenomenon?.attrs.href?.startsWith('#'))instant=one(descendants(root,'TimeInstant').filter(n=>n.attrs.id===phenomenon.attrs.href.slice(1)));
  observedNode=one(kids(instant,'timePosition'));timeValue=scalar(observedNode);
  const feature=one(kids(obs,'featureOfInterest')),airport=one(descendants(feature,'AirportHeliportTimeSlice'));
  const codes=[...kids(airport,'locationIndicatorICAO'),...kids(airport,'designator')].map(scalar).filter(v=>/^[A-Z]{4}$/.test(v??''));
  const stations=[...new Set(codes)];if(stations.length>1)return{reason:'CONFLICTING_STATION'};station=stations[0]??tac?.[2];
  if(tac&&station&&tac[2]!==station)return{reason:'CONFLICTING_STATION'};
 }
 if(station!=='RKSI')return{reason:'STATION_UNVERIFIED_OR_OTHER'};
 const observedAt=validTime(timeValue);if(!observedAt)return{reason:'OBSERVATION_TIME_UNVERIFIED'};
 if(tac){const d=new Date(observedAt);if(Number(tac[3])!==d.getUTCDate()||Number(tac[4])!==d.getUTCHours()||Number(tac[5])!==d.getUTCMinutes())return{reason:'TAC_TIME_CONFLICT'};}
 const result=flat?root:one(kids(one(kids(obs,'result')),'MeteorologicalAerodromeObservationRecord'));
 const values={},fieldPaths=[];if(messageNode)fieldPaths.push({field:'msgText',path:messageNode.path,type:messageNode.sourceType});
 fieldPaths.push({field:'observedAt',path:observedNode.path,type:observedNode.sourceType});
 for(const[name,[allowed,min,max]]of Object.entries(measures)){
  const node=one(descendants(result,name));if(!node)continue;
  fieldPaths.push({field:name,path:node.path,type:node.sourceType});
  const raw=scalar(node),unit=node.attrs.uom;
  if(node.attrs.nil==='true'||node.attrs.nilReason||!/^[-+]?\d+(?:\.\d+)?$/.test(raw??'')||!(Array.isArray(allowed)?allowed:[allowed]).includes(unit))continue;
  const value=Number(raw);if(!Number.isFinite(value)||value<min||value>max)continue;
  const qualifier=name==='prevailingVisibility'?scalar(one(descendants(result,'prevailingVisibilityOperator'))):null;
  values[name]={value,unit,path:node.path,...(['ABOVE','BELOW'].includes(qualifier)?{qualifier}:{})};
 }
 return{observation:{station,reportType,observedAt,measurements:values,measurementScope:'GROUND_OBSERVATION',turbulenceRisk:'NOT_INFERRED'},fieldPaths};
}

/** Only safe paths/types and validated public fields leave this function. */
export function inspectRksiMetarItem(item,index=0){
 const base=`response.body.items.item[${index}]`,meta={encoding:'UNRECOGNIZED',recognizedItemKeys:obj(item)?Object.keys(item).filter(k=>safeKey(k)!=='[OTHER]').slice(0,32):[],recognizedItemTypes:obj(item)?Object.fromEntries(Object.entries(item).filter(([k])=>safeKey(k)!=='[OTHER]').slice(0,32).map(([k,v])=>[k,type(v)])):{},otherItemKeyCount:obj(item)?Object.keys(item).filter(k=>safeKey(k)==='[OTHER]').length:0};
 try{
  let root;
  if(typeof item==='string'){root=xmlTree(item,base);meta.encoding='XML_STRING';}
  else if(obj(item)){
   const xmlEntries=Object.entries(item).filter(([,v])=>typeof v==='string'&&/^\s*(?:<\?xml[^>]*>\s*)?<(?:[A-Za-z_][\w.-]*:)?(?:METAR|SPECI)\b/.test(v));
   if(xmlEntries.length===1){const[k,v]=xmlEntries[0];root=xmlTree(v,`${base}.${safeKey(k)}`);meta.encoding='XML_IN_JSON';}
   else if(xmlEntries.length>1)return{...meta,reason:'AMBIGUOUS_REPORT'};
   else{const tree=jsonTree(item,'item',base,{nodes:0});const reports=tree.children.filter(n=>['METAR','SPECI'].includes(n.name));if(reports.length>1)return{...meta,reason:'AMBIGUOUS_REPORT'};root=reports[0]??tree;meta.encoding=root===tree?'FLAT_JSON':'NESTED_JSON';}
  }else return{...meta,reason:'ITEM_TYPE_UNVERIFIED'};
  return{...meta,structurePaths:structurePaths(root),...observationFromTree(root)};
 }catch{return{...meta,reason:'BOUNDED_PARSE_REJECTED'};}
}
