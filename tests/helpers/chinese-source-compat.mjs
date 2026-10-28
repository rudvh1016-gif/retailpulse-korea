import ts from 'typescript';

/** Existing source-shape assertions describe the Korean layout. Remove only
 * presentation lookups and explicit Chinese branches for those assertions;
 * Chinese behavior is checked against real rendered output in separate tests. */
export function koreanCompatibilitySource(input){
 let source=input;
 for(let pass=0;pass<12;pass++){
  const tree=ts.createSourceFile('view.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
  const isChinese=node=>ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&node.left.getText(tree)==='lang'&&ts.isStringLiteral(node.right)&&node.right.text==='zh';
  function visit(node){
   if(ts.isIfStatement(node)&&isChinese(node.expression)){edits.push([node.getStart(tree),node.end,node.elseStatement?.getText(tree)??'']);return;}
   if(ts.isConditionalExpression(node)&&isChinese(node.condition)){edits.push([node.getStart(tree),node.end,node.whenFalse.getText(tree)]);return;}
   if(ts.isCallExpression(node)&&node.expression.getText(tree)==='chineseText'&&node.arguments.length===2){
    const argument=node.arguments[1];
    if(ts.isStringLiteral(argument)&&ts.isJsxExpression(node.parent)&&!ts.isJsxAttribute(node.parent.parent))edits.push([node.parent.getStart(tree),node.parent.end,argument.text]);
    else edits.push([node.getStart(tree),node.end,argument.getText(tree)]);
    return;
   }
   ts.forEachChild(node,visit);
  }visit(tree);if(!edits.length)break;
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
 }
 return source;
}
