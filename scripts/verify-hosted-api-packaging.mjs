import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Execute compiled JavaScript, without the source .ts files that Vercel omits.
const root=process.cwd(),temporary=await mkdtemp(path.join(os.tmpdir(),'stu-api-package-'));
const configuration=JSON.parse(await readFile(path.join(root,'tsconfig.json'),'utf8'));
assert.equal(configuration.compilerOptions.rewriteRelativeImportExtensions,true);
const files=execFileSync('git',['ls-files','-z','api','server','src','tools/evaluation-lab','tests/evaluation'],{encoding:'utf8'}).split('\0')
  .filter(name=>/\.(?:[mc]?js|tsx?|json)$/.test(name)&&! /\.d\.(?:ts|mts|cts)$/.test(name));
const originalFetch=globalThis.fetch;
try{
  await writeFile(path.join(temporary,'package.json'),'{"type":"module"}\n');
  await symlink(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir');
  for(const name of files){
    const source=await readFile(path.join(root,name),'utf8');
    const typed=/\.tsx?$/.test(name),destination=path.join(temporary,typed?name.replace(/\.tsx?$/,'.js'):name);
    const code=typed?ts.transpileModule(source,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2023,
      module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true}}).outputText:source;
    await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,code);
  }
  globalThis.fetch=async()=>{throw Error('Packaging verification must not contact a provider.');};
  const {default:handler}=await import(pathToFileURL(path.join(temporary,'api/affairs-data.js')).href);
  let status=0,body;
  const response={setHeader(){},status(value){status=value;return this;},json(value){body=value;return this;}};
  await handler({method:'GET',headers:{},query:{resource:'evaluation-lab',op:'state'}},response);
  assert.equal(status,401,JSON.stringify(body));
  console.log(JSON.stringify({compiledApiImport:true,sourceTypeScriptAbsent:true,publicAndAccountHandlersLinked:true,unauthenticatedDenied:true,providerCalls:0}));
}finally{
  globalThis.fetch=originalFetch;await rm(temporary,{recursive:true,force:true});
}
