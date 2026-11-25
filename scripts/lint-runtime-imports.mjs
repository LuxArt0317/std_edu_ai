import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {runtimeImportProblems} from './lib/runtime-import-lint.mjs';

let checked=0,errors=0;
async function check(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())await check(file);
  else if(entry.isFile()&&/\.(?:[cm]?[jt]s|tsx)$/u.test(file)&&!/\.d\.[cm]?ts$|\.test\.|affairsAssistantRuntime\.js$/u.test(file)){
   checked++;
   for(const problem of runtimeImportProblems(await readFile(file,'utf8'),file)){
    errors++;console.error(`${file}:${problem.line}:${problem.column} error ${problem.code}\nReason: ${problem.reason}\nFix: ${problem.fix}`);
   }
  }
 }
}
for(const directory of ['api','server','tools/evaluation-lab'])await check(directory);
console.log(JSON.stringify({runtimeImportLint:true,checked,errors}));if(errors)process.exitCode=1;
