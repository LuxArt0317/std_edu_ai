import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {releaseManifest} from '../../scripts/write-release-manifest.mjs';

test('release metadata accepts only platform commit provenance and publishes no environment secrets',()=>{
 const at=new Date('2026-11-13T01:00:00Z'),sha='a'.repeat(40);
 assert.deepEqual(releaseManifest({VERCEL:'1',VERCEL_GIT_COMMIT_SHA:sha,VERCEL_ENV:'production',OPENAI_API_KEY:'PRIVATE'},at),
  {version:1,revision:sha,environment:'production',source:'vercel-git',builtAt:at.toISOString()});
 for(const env of [{},{VERCEL_GIT_COMMIT_SHA:sha},{VERCEL:'1',VERCEL_GIT_COMMIT_SHA:'short'},
  {VERCEL:'1',VERCEL_GIT_COMMIT_SHA:'PRIVATE'},{VERCEL:'1',GITHUB_SHA:sha}]){
  const result=releaseManifest(env,at);assert.equal(result.revision,null);assert.equal(result.source,'unverified');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 }
});

test('the generated release file is excluded from SPA routing and remains uncached',()=>{
 const config=JSON.parse(readFileSync('vercel.json','utf8'));
 const fallback=config.rewrites.find((rule:any)=>rule.destination==='/app-shell.html');
 assert.ok(fallback.source.includes('release[.]json'));
 const expression=new RegExp('^'+fallback.source.replace('/:path(','/(')+'$');
 assert.equal(expression.test('/release.json'),false);assert.equal(expression.test('/school-affairs'),true);
 assert.ok(readFileSync('scripts/sync-school-routes.mjs','utf8').includes('release[.]json'));
 assert.ok(config.headers.some((rule:any)=>rule.headers.some((header:any)=>header.key==='Cache-Control'&&header.value==='no-store')&&rule.source.includes('?!assets/')));
});
