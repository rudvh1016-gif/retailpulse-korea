import {LIMITS,fail,sha256,exactKeys,cleanText} from './model.mjs';
const TYPES=['image/png','image/jpeg','image/webp'];
// Standard image-element fallback keeps supported rasters usable when bitmap
// decoding is unavailable. No HEIC codec, network transfer or metadata is kept.
async function decodePhoto(blob){
  if(typeof createImageBitmap==='function')return createImageBitmap(blob);
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});return {width:image.naturalWidth,height:image.naturalHeight,source:image,close:()=>URL.revokeObjectURL(url)};}
  catch(error){URL.revokeObjectURL(url);throw error;}
}
export function imageHeader(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);let type,width,height;
  const str=(i,n)=>String.fromCharCode(...b.slice(i,i+n));
  if(b.length>=24 && b.slice(0,8).every((x,i)=>x===[137,80,78,71,13,10,26,10][i]) && str(12,4)==='IHDR'){type='image/png';width=v.getUint32(16);height=v.getUint32(20);}
  else if(b.length>=12 && b[0]===255 && b[1]===216){
    type='image/jpeg';let i=2;
    while(i+4<=b.length){if(b[i++]!==255)fail('PHOTO','JPEG 파일이 손상되었어요.');while(b[i]===255)i++;const m=b[i++];if(m===0xda || m===0xd9)break;if(m===0x01 || (m>=0xd0&&m<=0xd7))continue;const n=v.getUint16(i);if(n<2 || i+n>b.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(m)&&n>=7){height=v.getUint16(i+3);width=v.getUint16(i+5);break;}i+=n;}
  }else if(b.length>=30 && str(0,4)==='RIFF'&&str(8,4)==='WEBP'){
    type='image/webp';const kind=str(12,4);
    if(kind==='VP8X'){if(b[20]&2)fail('PHOTO','움직이는 사진은 사용할 수 없어요.');width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16);}
    else if(kind==='VP8L'&&b[20]===47){const bits=v.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>14)&0x3fff)+1;}
    else if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
  }
  if(!type || !width || !height)fail('PHOTO','읽을 수 있는 JPG·PNG·WebP 정지 사진을 선택해 주세요.');
  if(width*height>LIMITS.pixels)fail('PHOTO','사진 해상도가 너무 커요. 2천만 화소 이하 사진을 선택해 주세요.');
  return {type,width,height};
}
export async function preparePhoto(file){
  if(!file?.size || file.size>LIMITS.sourcePhoto)fail('PHOTO','사진은 5MB 이하 JPG·PNG·WebP 파일을 선택해 주세요.');
  const header=imageHeader(await file.arrayBuffer());if(file.type && file.type!==header.type)fail('PHOTO','사진 확장 형식과 실제 내용이 달라요.');
  let bitmap;try{bitmap=await decodePhoto(file);}catch{fail('PHOTO','사진을 읽지 못했어요. 다른 사진을 선택해 주세요.');}
  try{
    const scale=Math.min(1,LIMITS.edge/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)fail('PHOTO','사진을 준비하지 못했어요.');context.drawImage(bitmap.source||bitmap,0,0,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));
    if(!blob || blob.size>LIMITS.photo)fail('PHOTO','보관용 사진이 2MB를 넘어요. 더 작은 사진을 선택해 주세요.');
    const name=cleanText(file.name||'photo',120,'사진 이름');return {blob,type:blob.type,name,width,height,sha256:await sha256(blob)};
  }finally{bitmap.close();}
}
export function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
export function fromBase64(s){
  if(typeof s!=='string'||!s.length||s.length>Math.ceil(LIMITS.photo/3)*4||s.length%4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))fail('PHOTO','백업 사진 데이터가 올바르지 않아요.');
  let raw;try{raw=atob(s);}catch{fail('PHOTO','백업 사진을 읽을 수 없어요.');}const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>LIMITS.photo || toBase64(bytes)!==s)fail('PHOTO','백업 사진 데이터가 올바르지 않아요.');return bytes;
}
export async function photoForBackup(p){if(!p)return null;return {type:p.type,name:p.name,width:p.width,height:p.height,sha256:p.sha256,base64:toBase64(new Uint8Array(await p.blob.arrayBuffer()))};}
export async function photoFromBackup(p){
  if(p===null)return null;exactKeys(p,['type','name','width','height','sha256','base64'],'백업 사진');
  if(!TYPES.includes(p.type)||!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width<1||p.height<1||Math.max(p.width,p.height)>LIMITS.edge||!(/^[a-f0-9]{64}$/.test(p.sha256)))fail('PHOTO','백업 사진 형식이 올바르지 않아요.');
  const name=cleanText(p.name,120,'사진 이름');if(name!==p.name)fail('PHOTO','백업 사진 이름을 확인해 주세요.');
  const bytes=fromBase64(p.base64),head=imageHeader(bytes);if(head.type!==p.type||head.width!==p.width||head.height!==p.height||await sha256(bytes)!==p.sha256)fail('PHOTO','백업 사진의 크기 또는 내용 검증에 실패했어요.');
  const blob=new Blob([bytes],{type:p.type});let decoded;try{decoded=await decodePhoto(blob);}catch{fail('PHOTO','백업 사진이 손상되었어요.');}try{if(decoded.width!==p.width||decoded.height!==p.height)fail('PHOTO','백업 사진 크기가 일치하지 않아요.');}finally{decoded.close();}
  return {blob,type:p.type,name,width:p.width,height:p.height,sha256:p.sha256};
}
