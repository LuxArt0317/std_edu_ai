import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const source=await readFile('api/affairs-assistant.ts','utf8');
const tree=ts.createSourceFile('affairs-assistant.ts',source,ts.ScriptTarget.Latest,true);
for(const node of tree.statements){
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
    const name=node.moduleSpecifier.text;
    if(name.startsWith('./')||/\.tsx?$/.test(name))throw Error('The runtime compiler requires parent-relative JavaScript imports.');
  }
}
// api/ and server/ are siblings, so the existing ../server and ../src paths stay valid.
const result=ts.transpileModule(source,{fileName:'affairs-assistant.ts',reportDiagnostics:true,
  compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}});
if(result.diagnostics?.some(item=>item.category===ts.DiagnosticCategory.Error))throw Error('Assistant runtime compilation failed.');
const checksum=createHash('sha256').update(source).digest('hex');
const output=`// Generated from api/affairs-assistant.ts; source-sha256: ${checksum}\n${result.outputText}`;
await writeFile('server/affairsAssistantRuntime.js.tmp',output);
await rename('server/affairsAssistantRuntime.js.tmp','server/affairsAssistantRuntime.js');
console.log(JSON.stringify({assistantRuntimeCompiled:true,sourceChecksum:checksum}));
