import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deriveProtectedConversationBrowserAssets} from './protected-conversation-browser-assets.mjs';
import {certificateBrowserHeading,certificateBrowserProfile} from './vercel-preview-browser-transport.mjs';
import {announcementEmailBrowserProfile} from './announcement-email-browser-turn.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app';
const revision='6'.repeat(40);
const entry='/assets/index-a2345678.js';
const site='/assets/PublicSite-b2345678.js';
const dtm='/assets/DigitalMaterials-c2345678.js';
const auth='/assets/authClient-d2345678.js';
const records='/assets/useAffairsRecords-e2345678.js';
const research='/assets/researchAssistant-f2345678.js';
const supabase='/assets/supabase-a1a1a1a1.js';
const markdown='/assets/AssistantMarkdown-d1d1d1d1.js';
const runtime='/assets/rolldown-runtime-g2345678.js';
const style='/assets/index-g1g1g1g1.css';
const dtmStyle='/assets/DigitalMaterials-h2345678.css';
const secondStyle='/assets/weekday-style-i2345678.css';
const routeElsewhere='/assets/StudyApp-a1a1a1a1.js';
const signInElsewhere='/assets/SchoolAffairsEntry-a1a1a1a1.js';
const mediaPaths=['/dtm-theme/page.svg','/dtm-theme/url.svg','/dtm-theme/user-small.png','/dtm-theme/open-sans-latin.woff2',
  '/school-assets/2adefcbc041e7d18fcf2.woff2'];
const mime=path=>path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.css')?'text/css':'text/html; charset=utf-8';
const relative=path=>'.'+path.replace(/^\/assets/u,'');
const preloads=(paths)=>'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f='+JSON.stringify(paths.map(path=>path.startsWith('/assets/')?path.slice(1):path))+'))) => i.map(i=>d[i]);';
const lazy=(path,indices)=>'preload(()=>import('+JSON.stringify(relative(path))+'),__vite__mapDeps('+JSON.stringify(indices)+'));';
const shell='<div id="root"><div data-stu-boot>Loading</div></div>';
const makeShell=source=>'<script type="module" src="'+source+'"></script><link rel="modulepreload" href="'+runtime+'"/>'
  +'<link rel="stylesheet" href="'+style+'"/><link rel="icon" href="/favicon.png"/>'+shell;

function fixture(){
  const files=new Map([
    ['/dtm',makeShell(entry)],
    [entry,preloads([site,runtime,routeElsewhere])+lazy(site,[0,1])+lazy(routeElsewhere,[2])],
    [site,'export {default} from '+JSON.stringify(relative(research))+';'+preloads([signInElsewhere,dtm,dtmStyle,markdown])
      +lazy(signInElsewhere,[0])+lazy(dtm,[1,2,3])],
    [dtm,'import '+JSON.stringify(relative(records))+';'+preloads([auth,site,runtime])+lazy(auth,[0,1,2])],
    [records,preloads([auth])+lazy(auth,[0])],
    [research,preloads([supabase])+lazy(supabase,[0])],
    [auth,'export const user=true;'],[supabase,'export const caller=true;'],[runtime,'export const react=true;'],
    [markdown,'export const richText=true;'],[style,'@import "./'+secondStyle.split('/').at(-1)+'";'],
    [dtmStyle,'@font-face{src:url(/dtm-theme/open-sans-latin.woff2)} .dtm-avatar{background:url(data:image/png;base64,AA)}'],
    [secondStyle,'@font-face{src:url("/school-assets/2adefcbc041e7d18fcf2.woff2")}'],
  ]);
  const manifest={version:1,revision,environment:'preview',source:'vercel-git',builtAt:'2026-11-15T06:30:00.000Z'};
  let readManifest=()=>manifest;
  let intercept=()=>null;
  const paths=[];
  let manifests=0;
  const fetchImpl=async(raw,init)=>{
    const {origin:host,pathname,search}=new URL(raw);
    assert.equal(host,origin);
    assert.equal(search,'');
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    assert.equal(init.credentials,'omit');
    assert.equal(init.cache,'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    paths.push(pathname);
    if(pathname==='/release.json')return Response.json(readManifest(++manifests));
    const changed=intercept(pathname,init);
    if(changed)return changed;
    assert.ok(files.has(pathname),'Every requested dependency must be declared in the fixture');
    return new Response(files.get(pathname),{headers:{'content-type':mime(pathname)}});
  };
  return {files,manifest,paths,fetchImpl,
    setManifest:reader=>{readManifest=reader;},setResponse:reader=>{intercept=reader;},
    derive:options=>deriveProtectedConversationBrowserAssets({origin,revision,approvedPreviewOrigin:origin,fetchImpl,...options})};
}

test('the pinned shell, selected lazy preloads, static imports and stylesheet assets produce the browser allowlist',async()=>{
  const f=fixture();
  assert.deepEqual(await f.derive(),{revision,assets:[
    entry,site,dtm,auth,records,research,supabase,markdown,runtime,style,dtmStyle,secondStyle,...mediaPaths,
  ].sort()});
  assert.equal(f.paths[0],'/release.json');
  assert.equal(f.paths.at(-1),'/release.json');
  assert.equal(f.paths.filter(p=>p==='/dtm').length,1);
  assert.equal(f.paths.filter(p=>p===site).length,1,'Cyclic preload relations are deduplicated');
  assert.ok(!f.paths.includes(routeElsewhere)&&!f.paths.includes(signInElsewhere));
  assert.ok(!f.paths.includes('/favicon.png')&&!f.paths.includes('/api/affairs-data'));
});

test('the fixed certificate profile reads the 52-1 shell and admits its declared public icon and heading',async()=>{
  const f=fixture(),certificateRoute='/school-affairs/services/52-1';
  f.files.set(certificateRoute,f.files.get('/dtm'));
  f.files.set(signInElsewhere,'import '+JSON.stringify(relative(auth))+';');
  const result=await f.derive({profile:certificateBrowserProfile});
  assert.deepEqual(result,{revision,assets:[
    entry,site,signInElsewhere,auth,research,supabase,runtime,style,secondStyle,mediaPaths.at(-1),certificateBrowserHeading,'/favicon.png',
  ].sort()});
  assert.deepEqual(f.paths.slice(0,2),['/release.json',certificateRoute]);
  assert.equal(f.paths.at(-1),'/release.json');
  assert.ok(!f.paths.includes('/dtm')&&!f.paths.includes(dtm)&&!f.paths.includes(routeElsewhere)&&!f.paths.includes('/favicon.png'));
  const missing=fixture();
  missing.files.set(certificateRoute,missing.files.get('/dtm'));
  missing.files.set(site,'export default true;');
  await assert.rejects(missing.derive({profile:certificateBrowserProfile}),/missing required certificate route/u);
});

test('the announcement email profile starts at the pinned 2-1 shell and selects School Affairs assets',async()=>{
  const f=fixture(),route='/school-affairs/services/2-1';
  f.files.set(route,f.files.get('/dtm'));
  f.files.set(signInElsewhere,'import '+JSON.stringify(relative(auth))+';');
  const result=await f.derive({profile:announcementEmailBrowserProfile});
  assert.deepEqual(f.paths.slice(0,2),['/release.json',route]);
  assert.equal(f.paths.at(-1),'/release.json');
  assert.ok(result.assets.includes(signInElsewhere)&&result.assets.includes('/favicon.png'));
  assert.ok(!result.assets.includes(certificateBrowserHeading)&&!result.assets.includes(dtm));
});

test('the operator approves the generated origin and the complete manifest before and after discovery',async()=>{
  const invalid=fixture();
  await assert.rejects(invalid.derive({approvedPreviewOrigin:'https://stu.best'}),/invalid discovery target/u);
  await assert.rejects(invalid.derive({fetchImpl:undefined}),/invalid discovery target/u);
  assert.deepEqual(invalid.paths,[]);
  const mismatch=fixture();
  mismatch.setManifest(()=>({...mismatch.manifest,revision:'0'.repeat(40)}));
  await assert.rejects(mismatch.derive(),/revision_mismatch/u);
  assert.deepEqual(mismatch.paths,['/release.json']);
  const changed=fixture();
  changed.setManifest(number=>({...changed.manifest,builtAt:number===1?changed.manifest.builtAt:'2026-11-15T07:00:00.000Z'}));
  await assert.rejects(changed.derive(),/deployment_changed/u);
  assert.equal(changed.paths.at(-1),'/release.json');
});

test('unapproved dependency paths fail before another request can leave the allowed graph',async()=>{
  for(const reference of ['https://elsewhere.invalid/a.js','//elsewhere.invalid/a.js','/api/affairs-data','/assets/x.js?token=secret','./../elsewhere.js','/assets/%2e%2e/new.js']){
    const f=fixture();
    f.files.set('/dtm',makeShell(reference));
    await assert.rejects(f.derive(),/invalid (?:dependency path|shell entry)/u);
    assert.deepEqual(f.paths,['/release.json','/dtm']);
  }
  const f=fixture();
  f.files.set(site,preloads([dtm,'/api/affairs-data'])+lazy(dtm,[0,1]));
  await assert.rejects(f.derive(),/non-generated executable dependency/u);
  assert.ok(!f.paths.includes('/api/affairs-data'));
});

test('a response redirect, wrong MIME or unavailable chunk cannot become asset proof',async()=>{
  const redirect=Response.redirect('https://elsewhere.invalid/asset.js');
  const mismatched=Object.defineProperty(new Response('export default 0',{headers:{'content-type':'text/javascript'}}),'url',
    {value:'https://elsewhere.invalid/asset.js'});
  for(const fault of [redirect,mismatched,new Response('...',{status:404,headers:{'content-type':'text/javascript'}}),
    new Response('<html>Sign In</html>',{headers:{'content-type':'text/html'}})]){
    const f=fixture();
    f.setResponse(path=>path===entry?fault:null);
    await assert.rejects(f.derive(),/unexpected resource response/u);
    assert.ok(!f.paths.includes(site));
  }
  const f=fixture();
  f.setResponse(path=>{if(path===entry)throw Error('Protected browser assets: PRIVATE_PROVIDER_ERROR.');});
  await assert.rejects(f.derive(),error=>/resource could not be read/u.test(error.message)&&!error.message.includes('PRIVATE_'));
});

test('missing or inconsistent preload information fails rather than accepting an incomplete route',async()=>{
  const missing=fixture();
  missing.files.set(site,'export default null;');
  await assert.rejects(missing.derive(),/missing required DTM route/u);
  const index=fixture();
  index.files.set(site,preloads([dtm])+lazy(dtm,[0,1]));
  await assert.rejects(index.derive(),/invalid preload index/u);
  const offOrigin=fixture();
  offOrigin.files.set(site,preloads([dtm,'/assets/file.js#fragment'])+lazy(dtm,[0,1]));
  await assert.rejects(offOrigin.derive(),/invalid dependency path/u);
});

test('resource count and byte caps fail closed before writing or producing an allowlist',async()=>{
  const oversized=fixture();
  oversized.files.set(entry,' '.repeat(4_000_001));
  await assert.rejects(oversized.derive(),/resource byte limit/u);
  const extra=fixture();
  extra.files.set(style,Array.from({length:256},(_,i)=>'.x{background:url(/assets/asset-'+i+'.svg)}').join(''));
  await assert.rejects(extra.derive(),/asset count limit/u);
  const aggregate=fixture(),padding=' '.repeat(3_500_000);
  aggregate.files.set(style,Array.from({length:7},(_,i)=>{
    const path='/assets/large-'+i+'.css';
    aggregate.files.set(path,padding);
    return '@import "'+path+'";';
  }).join(''));
  await assert.rejects(aggregate.derive(),/total byte limit/u);
  assert.equal(aggregate.paths.filter(path=>path==='/release.json').length,1);
});

test('an aborted lookup cannot return an allowlist or read a later dependency',async()=>{
  const f=fixture(),controller=new AbortController();
  f.setResponse(path=>{
    if(path!==entry)return null;
    controller.abort();
    return new Response('export default 0',{headers:{'content-type':'text/javascript'}});
  });
  await assert.rejects(f.derive({signal:controller.signal}),/request deadline|resource could not be read/u);
  assert.ok(!f.paths.includes(site));
});
