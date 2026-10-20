/** Matched frontend-only release budget; never describes these as live-site vitals. */
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function compareLabReports(before,after){
 if(before.label!=='BEFORE'||after.label!=='AFTER'||before.method!==after.method||before.sourceDate!==after.sourceDate)throw Error('UNMATCHED_LAB_CONDITIONS');
 const metrics=['lcpMs','fcpMs','cls','observedBlockingMs','initialTransferBytes','imageTransferBytes'];
 const rows=[390,1440].map(width=>{
  const a=before.summaries.find(row=>row.width===width),b=after.summaries.find(row=>row.width===width);
  if(!a?.valid||!b?.valid||metrics.some(key=>!Number.isFinite(a[key])||!Number.isFinite(b[key])))throw Error('INVALID_LAB_MEASUREMENT');
  const differences=Object.fromEntries(metrics.map(key=>[key,{before:a[key],after:b[key],delta:b[key]-a[key],percent:a[key]>0?(b[key]/a[key]-1)*100:null}]));
  const failures=[];
  if(b.cls>0.1)failures.push('LAYOUT_SHIFT_BUDGET');
  if(b.fcpMs>a.fcpMs*1.1+100)failures.push('FIRST_PAINT_REGRESSION');
  if(b.initialTransferBytes>a.initialTransferBytes*1.05)failures.push('INITIAL_TRANSFER_REGRESSION');
  return {width,differences,budgetPassed:!failures.length,failures,lcpElementChanged:JSON.stringify(a.lcpElements)!==JSON.stringify(b.lcpElements)};
 });
 return {frontendLabOnly:true,liveBackendMeasured:false,sourceDate:before.sourceDate,method:before.method,passed:rows.every(row=>row.budgetPassed),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [before,after,output]=process.argv.slice(2);if(!output)throw Error('Usage: BEFORE AFTER OUTPUT');
 const report=compareLabReports(JSON.parse(readFileSync(before,'utf8')),JSON.parse(readFileSync(after,'utf8')));
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}
