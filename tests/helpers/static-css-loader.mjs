// Static React rendering has no DOM or stylesheet evaluation. Keep real CSS for browser tests.
export function load(url,context,next){
 if(url.endsWith('.css'))return {format:'module',source:'export default {}',shortCircuit:true};
 return next(url,context);
}
