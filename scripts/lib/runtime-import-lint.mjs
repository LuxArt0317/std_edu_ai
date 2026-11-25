import ts from 'typescript';

export function runtimeImportProblems(source,filename){
 const tree=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true),problems=[];
 function check(node,value){
  if(!/\.(?:ts|tsx|mts|cts)$/iu.test(value))return;
  const location=tree.getLineAndCharacterOfPosition(node.getStart(tree));
  problems.push({file:filename,line:location.line+1,column:location.character+1,code:'STU_RUNTIME_IMPORT',
   reason:'Vercel packages this backend as JavaScript; a runtime TypeScript path can point to a source file missing in production.',
   fix:'Import a compiled/generated JavaScript module. Use import type for type-only dependencies.'});
 }
 function visit(node){
  if(ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly&&ts.isStringLiteral(node.moduleSpecifier))check(node,node.moduleSpecifier.text);
  if(ts.isExportDeclaration(node)&&!node.isTypeOnly&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))check(node,node.moduleSpecifier.text);
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
   const argument=node.arguments[0];
   if(argument&&ts.isStringLiteralLike(argument))check(node,argument.text);
   else if(argument&&ts.isTemplateExpression(argument))check(node,argument.templateSpans.at(-1)?.literal.text||'');
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);return problems;
}
