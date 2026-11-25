import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {assistantContext} from '../../src/services/assistantContext.js';

const transportCode=ts.transpileModule(readFileSync(new URL('../../src/services/assistantTransport.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

/** Execute the real per-call transport against this test's isolated fetch stub. */
export function runAssistantClientInNewContext(code,context){
  const transportExports={};
  runInNewContext(transportCode,{exports:transportExports,fetch:context.fetch});
  const requireModule=context.require;
  return runInNewContext(code,{...context,require:specifier=>{
    if(specifier.endsWith('assistantTransport')||specifier.endsWith('assistantTransport.js'))return transportExports;
    if(specifier.endsWith('assistantContext.js'))return {assistantContext};
    return requireModule(specifier);
  }});
}
