import assert from 'node:assert/strict';
import test from 'node:test';
import {sanitizeRunExecution} from './run-execution.mjs';
test('API-only runs cannot claim a browser or verified session',()=>{
 const result=sanitizeRunExecution({client:'api-only',authenticated:true,entryPoint:'school-affairs-client',route:'/example',dispatched:['/api/research-assistant','https://evil.example'],token:'must-not-persist'});
 assert.deepEqual(result,{client:'api-only',entryPoint:'api-only',route:'/example',dispatched:['/api/research-assistant']});
 assert.equal(sanitizeRunExecution({client:'made-up'}),null);
});
test('existing website run labels preserve bounded routing without extra properties',()=>{
 const result=sanitizeRunExecution({client:'website-assistant',authenticated:true,entryPoint:'school-affairs-client',route:'x'.repeat(700),dispatched:Array(30).fill('/api/affairs-assistant'),secret:'not-saved'});
 assert.equal(result.authenticated,true);assert.equal(result.route.length,500);assert.equal(result.dispatched.length,20);assert.equal(result.secret,undefined);
});
