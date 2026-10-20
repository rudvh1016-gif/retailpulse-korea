import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** Narrow reviewed template, not a general legal-text parser. Every unmasked byte
 * in the legal section (including age, exceptions, dates and links) must match. */
export function extractJapanNumericTemplate(html){
 const start=html.indexOf('<!--contents start-->'),end=html.indexOf('</div><!--contents end-->');
 if(start<0||end<=start||html.indexOf('<!--contents start-->',start+1)>=0)throw Error('JP_TEMPLATE_STRUCTURE_CHANGED');
 let template=html.slice(start,end).replace(/\s+/g,' ').trim();const values={};
 const fields=[
  ['liquorBottles',/(<th colspan="2">酒類<\/th> <td>)(\d+)(本<\/td>)/,1,20],
  ['liquorBottleMl',/(<td>1本)(\d+)(mlのもの。<\/td>)/,1,5000],
  ['cigarettes',/(<th>「紙巻たばこ」のみの場合<\/th> <td>)(\d+)(本<\/td>)/,1,1000],
  ['perfumeOunces',/(<th colspan="2">香水<\/th> <td>)(\d+(?:\.\d+)?)(オンス<\/td>)/,0.1,20],
 ];
 for(const [field,pattern,min,max] of fields){
  const matches=[...template.matchAll(new RegExp(pattern.source,'g'))];if(matches.length!==1)throw Error('JP_TEMPLATE_STRUCTURE_CHANGED');
  const value=Number(matches[0][2]);if(!Number.isFinite(value)||value<min||value>max)throw Error('JP_NUMERIC_RANGE_REVIEW');
  values[field]=value;template=template.replace(pattern,(_,before,_number,after)=>before+'{{'+field+'}}'+after);
 }
 return {templateSha256:hash(template),values};
}
export function parseJapanNumericUpdate(source,html){
 if(source.numericParser!=='jp-allowance-v1'||!source.baseline?.numericTemplateSha256)return null;
 try{const candidate=extractJapanNumericTemplate(html);return candidate.templateSha256===source.baseline.numericTemplateSha256?candidate:null;}catch{return null;}
}
