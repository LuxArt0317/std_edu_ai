import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdtempSync,mkdirSync,symlinkSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

test('compiled assistant entrypoints start without TypeScript sources or a TypeScript loader',()=>{
  const root=resolve('.'),target=mkdtempSync(join(tmpdir(),'stu-assistant-imports-'));
  try{
    mkdirSync(join(target,'api'));writeFileSync(join(target,'package.json'),'{"type":"module"}');
    symlinkSync(join(root,'server'),join(target,'server'),'dir');symlinkSync(join(root,'src'),join(target,'src'),'dir');
    for(const name of ['affairs-assistant','research-assistant']){
      const source=readFileSync(join(root,'api',name+'.ts'),'utf8');
      const emitted=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText;
      assert.doesNotMatch(emitted,/from\s*['"][^'"]+\.ts['"]/,'A production JS entrypoint cannot import an absent TS API source.');
      writeFileSync(join(target,'api',name+'.js'),emitted);
    }
    const output=execFileSync(process.execPath,['--no-experimental-strip-types','--input-type=module','-e',`
      globalThis.fetch=()=>{throw Error('Import/405 startup must not call a provider');};
      for(const name of ['affairs-assistant','research-assistant']){
        const module=await import('./api/'+name+'.js');
        if(module.config.maxDuration!==120)throw Error('Duration changed');
        let code=0,body;
        const response={setHeader(){},status(value){code=value;return response;},json(value){body=value;}};
        await module.default({method:'OPTIONS',headers:{}},response);
        if(code!==405||!body?.error)throw Error('Entrypoint did not start normally');
      }
      console.log('Both compiled assistant entrypoints started');
    `],{cwd:target,encoding:'utf8',timeout:15000});
    assert.match(output,/Both compiled assistant entrypoints started/);
  }finally{rmSync(target,{recursive:true,force:true});}
});
