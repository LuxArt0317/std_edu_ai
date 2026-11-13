import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {releaseManifest} from '../../scripts/write-release-manifest.mjs';
import {validatePreviewTarget,validatePreviewManifest,verifyPreviewRelease} from './verified-preview.mjs';
import {dtmSubmissionBrowserMode} from './dtm-submissions-browser.mjs';

const origin='https://stdedu-51020rwpv-v1-d286.vercel.app';
const revision='67a524de25f23ec4b1c6c425bf9824ec3072a078';
const options={previewOrigin:origin,expectedReleaseRevision:revision};
const manifest=releaseManifest({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:revision},new Date('2026-11-13T00:00:00.000Z'));
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json; charset=utf-8'}});

test('exact explicit preview approval and valid writer manifest are required',()=>{
  assert.deepEqual(validatePreviewTarget(origin,options),{origin,expectedReleaseRevision:revision});
  assert.deepEqual(validatePreviewManifest(manifest,revision),manifest);
  for(const candidate of [undefined,'https://stu.best','http://stdedu-51020rwpv-v1-d286.vercel.app',origin+'/',origin+'/path',origin+'?a=1',origin+'#x',
    origin.replace('https://','https://person:password@'),origin.replace('.app','.app:443'),origin.replace('.app','.app:8443'),
    'https://another-team.vercel.app',origin+'.invalid',origin.replace('https://','https://.')])
    assert.throws(()=>validatePreviewTarget(candidate,{...options,previewOrigin:candidate}));
  assert.throws(()=>validatePreviewTarget(origin,{...options,previewOrigin:origin.replace('51020rwpv','other')}));
  for(const invalid of [undefined,'',revision.slice(1),revision.toUpperCase(),'g'.repeat(40)])
    assert.throws(()=>validatePreviewTarget(origin,{...options,expectedReleaseRevision:invalid}));
});

test('manifest rejects another revision, environment, unverified data and malformed shapes',()=>{
  for(const value of [null,[],{},...[
    {revision:'1'.repeat(40)},{revision:null},{environment:'production'},{source:'unverified'},{version:2},
    {builtAt:'2026-02-30T00:00:00.000Z'},{builtAt:'not-a-date'},{builtAt:'2026-11-13T00:00:00Z'},{extra:true},
  ].map(patch=>({...manifest,...patch}))])assert.throws(()=>validatePreviewManifest(value,revision));
  const missing={...manifest};delete missing.builtAt;assert.throws(()=>validatePreviewManifest(missing,revision));
});

test('preflight fetch is credential-free, uncached, redirect-rejecting and exact',async()=>{
  let calls=0;
  const actual=await verifyPreviewRelease(origin,{...options,fetchImpl:async(url,init)=>{
    calls++;assert.equal(url,origin+'/release.json');
    assert.deepEqual(Object.keys(init).sort(),['cache','credentials','headers','method','redirect','signal']);
    assert.equal(init.method,'GET');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
    assert.deepEqual(init.headers,{Accept:'application/json'});assert.ok(init.signal instanceof AbortSignal);
    return json(manifest);
  }});
  assert.deepEqual(actual,manifest);assert.equal(calls,1);
  await assert.rejects(verifyPreviewRelease(origin,{...options,previewOrigin:undefined,fetchImpl:()=>{calls++;throw new Error();}}));
  assert.equal(calls,1,'Invalid approval must fail before a network call.');
});

test('protected, redirected, malformed and oversized previews fail closed',async()=>{
  for(const status of [301,302,307,401,403,404,500])
    await assert.rejects(verifyPreviewRelease(origin,{...options,fetchImpl:async()=>new Response('unavailable',{status})}));
  for(const response of [new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}}),
    new Response('{bad',{headers:{'Content-Type':'application/json'}}),json({...manifest,revision:'1'.repeat(40)}),
    new Response(' '.repeat(4097),{headers:{'Content-Type':'application/json'}})])
    await assert.rejects(verifyPreviewRelease(origin,{...options,fetchImpl:async()=>response}));
  const redirected=json(manifest);Object.defineProperty(redirected,'redirected',{value:true});
  await assert.rejects(verifyPreviewRelease(origin,{...options,fetchImpl:async()=>redirected}));
  const other=json(manifest);Object.defineProperty(other,'url',{value:'https://different.example/release.json'});
  await assert.rejects(verifyPreviewRelease(origin,{...options,fetchImpl:async()=>other}));
  await assert.rejects(verifyPreviewRelease(origin,{...options,fetchImpl:async()=>{throw new Error('simulated timeout');}}));
});

test('certificate gates preview before credential resolution and keeps it deployed HTTP',async()=>{
  const source=await readFile(new URL('./enrollment-certificate-live.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf('await verifyPreviewRelease(')<source.indexOf('const env=deploymentEnvironment()'));
  assert.match(source,/const handlers=local\?\{/);
  assert.match(source,/const local=\['http:\/\/127\.0\.0\.1:5184','http:\/\/localhost:5184'\]\.includes\(origin\)/);
  assert.match(source,/const mode=local\?'local_handlers':'deployed_http'/);
  assert.match(source,/\$\{targetEnvironment\}-\$\{runId\}/);
});

test('DTM preview is explicitly approved deployed HTTP; local and production modes remain distinct',()=>{
  assert.equal(dtmSubmissionBrowserMode('http://127.0.0.1:5184'),'local_working_tree');
  assert.equal(dtmSubmissionBrowserMode('https://stu.best'),'deployed_http');
  assert.equal(dtmSubmissionBrowserMode(origin,options),'deployed_http');
  assert.throws(()=>dtmSubmissionBrowserMode(origin));
  assert.throws(()=>dtmSubmissionBrowserMode(origin,{...options,previewOrigin:'https://other-v1-d286.vercel.app'}));
  assert.throws(()=>dtmSubmissionBrowserMode('https://stu.best/path',options));
});

test('DTM parent gates before credentials/clients/fixtures and browser never substitutes preview handlers',async()=>{
  const storage=await readFile(new URL('./dtm-submissions-storage-live.mjs',import.meta.url),'utf8');
  const gate=storage.indexOf('await verifyPreviewRelease(browserOrigin,previewApproval)');assert.ok(gate>0);
  for(const later of ['const env=deploymentEnvironment()','const ownerEnv=parseEnv','const sql=postgres(','const runId=randomUUID()'])
    assert.ok(gate<storage.indexOf(later),later+' must follow preview verification.');
  assert.match(storage,/argumentOrigin\?\?process\.env\.NATIVE_ORIGIN/);
  assert.match(storage,/origin:browserOrigin,\.\.\.previewApproval/);
  assert.match(storage,/preview\?'\/preview-'\+runId:''/);
  const browser=await readFile(new URL('./dtm-submissions-browser.mjs',import.meta.url),'utf8');
  assert.ok(browser.indexOf('await verifyPreviewRelease(origin,previewApproval)')<browser.indexOf("await import('playwright-core')"));
  assert.match(browser,/local=mode==='local_working_tree'/);
  assert.match(browser,/if\(local\)\{\s*const \[data,action,manage\]/);
});
