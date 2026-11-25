import assert from 'node:assert/strict';
import test from 'node:test';
import {runtimeImportProblems} from '../../scripts/lib/runtime-import-lint.mjs';

test('runtime import lint locates the loader defect and explains the deployment reason',()=>{
 const problems=runtimeImportProblems("// import('./comment.ts')\nexport const load=()=>import('../api/affairs-assistant.ts');",'server/loader.js');
 assert.equal(problems.length,1);assert.equal(problems[0].line,2);
 assert.match(problems[0].reason,/JavaScript.*source file missing in production/u);
 assert.match(problems[0].fix,/compiled\/generated JavaScript/u);
 assert.equal(runtimeImportProblems("import item from './handler.ts';",'api/handler.ts').length,1);
 assert.equal(runtimeImportProblems("const load=id=>import(`./${id}.ts`);",'server/loader.js').length,1);
});
test('type-only dependencies and compiled runtime imports remain allowed',()=>{
 assert.deepEqual(runtimeImportProblems("import type {Handler} from './handler.ts'; export type {Other} from './other.ts'; const load=()=>import('./runtime.js');",'api/entry.ts'),[]);
});
