import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const files=[];
function visit(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())visit(file);else if(/\.(?:[cm]?ts|tsx|[cm]?js|jsx|json)$/.test(file))files.push(file);}}
visit('app');visit('lib');
const entries=[];
for(const file of files){
 const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.json')?ts.ScriptKind.JSON:file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function walk(node){
  if((ts.isStringLiteralLike(node)||ts.isJsxText(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node))&&/[가-힣]/.test(node.text)){
   const point=tree.getLineAndCharacterOfPosition(node.getStart(tree));
   entries.push({file:file.replaceAll('\\','/'),line:point.line+1,kind:ts.SyntaxKind[node.kind],text:node.text});
  }
  ts.forEachChild(node,walk);
 }walk(tree);
}
const output={note:'Inventory of all Korean source literals in app/lib, including Korean locale records, canonical source identifiers, and Korean-only screens. A source occurrence is a review candidate, not proof of a Chinese render leak. Browser and static-render evidence must be reported separately.',files:files.length,literals:entries.length,uniqueLiterals:new Set(entries.map(e=>e.text)).size,entries};
const destination=process.argv[2];
if(destination)fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({files:output.files,literals:output.literals,uniqueLiterals:output.uniqueLiterals}));
