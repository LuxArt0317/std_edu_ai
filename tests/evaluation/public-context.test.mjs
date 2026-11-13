import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import {isPublicPageQuestion,loadPublicPageContext,normalizePublicPageRoute,publicPageCandidate,publicPageForRoute} from '../../server/publicPageContext.js';
import {answerLinksSupported,snapshotProvenanceSupported,validEvidence} from '../../server/answerVerificationModel.js';

const html='<html><head><title>Verified campus guide</title></head><body><main><h1>Services</h1><p>The library help desk opens at 08:30.</p></main></body></html>';
const fixture=(body=html,extra={})=>({source:'https://www.stu.edu.tw/guide/',title:'Campus guide',route:'/guide/',file:'/school-pages/0123456789abcdef0123.html',checksum:createHash('sha256').update(body).digest('hex'),capturedOn:'2026-11-03',...extra});
const load=(page=fixture(),body=html,extra={})=>loadPublicPageContext(page.route,Date.now()+10000,{captures:[page],fetchCapture:async()=>new Response(body),...extra});

test('every manifest route has exact public context, including encoding, archives and query identities',()=>{
  assert.equal(captures.length,395);
  for(const page of captures) {
    assert.equal(normalizePublicPageRoute(page.route),page.route,page.route);
    assert.equal(normalizePublicPageRoute(decodeURI(page.route)),page.route,'decoded '+page.route);
    assert.equal(normalizePublicPageRoute(page.route+'#content'),page.route);
    assert.equal(publicPageForRoute(page.route)?.source,page.source);
  }
  const queries=captures.filter(page=>page.route.includes('?'));
  assert.ok(queries.length>40);
  for(const page of queries)assert.equal(normalizePublicPageRoute(page.route+'&unknown=1'),'');
  assert.notEqual(normalizePublicPageRoute('/latestnews-single/?id=212034'),normalizePublicPageRoute('/latestnews-single/?id=234368'));
});

test('unlisted, private, external, traversal and credential-bearing routes are not evidence or fetch targets',async()=>{
  let calls=0;
  for(const route of ['/app','/app/knowledge','/dtm/course/1','/school-affairs','/school-affairs/menu/sao/all','/student-sso','/signin','/guide/private',
    'https://stu.best/在校學生/','https://evil.invalid/','//127.0.0.1/private','/../在校學生/','/%2e%2e/在校學生/','/x/../在校學生/','/%2f在校學生/','/%252e%252e/在校學生/','/在校學生/%00','/在校學生/\\x','/在校學生/\n',
    '/在校學生/?access_token=secret','/latestnews-single/?id=212034&id=234368','/latestnews-single/?id=212034&redirect=https://evil.invalid/']) {
    assert.equal(normalizePublicPageRoute(route),'',route);
    assert.equal(await loadPublicPageContext(route,Date.now()+10000,{fetchCapture:async()=>{calls++;throw new Error('No fetch authorized');}}),null,route);
  }
  assert.equal(calls,0);
});

test('capture metadata cannot introduce a private source, unsafe file or ambiguous normalized route',async()=>{
  for(const extra of [{file:'/../../.env'},{file:'https://evil.invalid/'},{source:'https://127.0.0.1/private'},
    {source:'https://www.stu.edu.tw/login/index.php'},{source:'https://info.stu.edu.tw/auth/callback'},
    {source:'https://www.stu.edu.tw/?token=secret'},{source:'http://www.stu.edu.tw/guide/'},
    {source:'https://user:pass@www.stu.edu.tw/guide/'},{source:'https://www.stu.edu.tw:8443/guide/'},
    {checksum:'invalid'},{capturedOn:'unknown'},{route:'/dtm/profile'}]) {
    const page=fixture(html,extra);
    assert.equal(await load(page,html,{fetchCapture:async()=>{throw new Error('Must not fetch');}}),null,JSON.stringify(extra));
  }
  const one=fixture(html,{route:'/知識/'}),two=fixture(html,{route:'/%E7%9F%A5%E8%AD%98/'});
  assert.equal(publicPageForRoute(one.route,[one,two]),null);
});

test('only checksum-pinned local HTML becomes content with explicit dated provenance',async()=>{
  const calls=[];
  const context=await load(fixture(),html,{fetchCapture:async(url,init)=>{
    calls.push({url,init});return new Response(html);
  }});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://stu.best/school-pages/0123456789abcdef0123.html');
  assert.equal(calls[0].init.redirect,'error');assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(context.contentAvailable,true);
  const data=JSON.parse(context.evidence.content);
  assert.equal(data.pageTitle,'Campus guide');assert.equal(data.localUrl,'/guide/');
  assert.equal(data.capturedOn,'2026-11-03');assert.equal(data.contentStatus,'verified_snapshot');
  assert.match(data.excerpt,/library help desk opens at 08:30/);assert.match(data.provenance,/not a live/);
  const candidate=publicPageCandidate(context,'What is this page about?');
  assert.ok(answerLinksSupported(candidate.answer,[context.evidence]));
  assert.ok(snapshotProvenanceSupported(candidate,[context.evidence]));
  assert.ok(validEvidence([context.evidence]));
  assert.equal(candidate.proposedAction,undefined);
});

test('failed, changed, redirected, oversized or unreadable snapshots remain metadata-only',async()=>{
  const replies=[()=>new Response('unavailable',{status:503}),()=>new Response(html+'<p>Unverified mutation</p>'),
    ()=>new Response(html,{headers:{'content-length':'4000001'}}),()=>new Response(null,{status:204}),
    ()=>{const response=new Response(html);Object.defineProperty(response,'url',{value:'https://evil.invalid/'});return response;},
    ()=>{const response=new Response(html);Object.defineProperty(response,'redirected',{value:true});return response;},
    ()=>{throw new Error('network failure');}];
  for(const reply of replies) {
    const context=await load(fixture(),html,{fetchCapture:async()=>reply()});
    const data=JSON.parse(context.evidence.content);
    assert.equal(context.contentAvailable,false);assert.equal(data.contentStatus,'metadata_only');assert.equal(data.excerpt,'');
    assert.equal(data.totalCharacters,null);assert.equal(data.includedCharacters,0);
    assert.doesNotMatch(context.evidence.content,/Unverified mutation|network failure|evil.invalid/);
    assert.match(publicPageCandidate(context,'What is this page?').answer,/text is unavailable/);
  }
  const unreadable='<html><head><title>Title</title></head><body><script>secret()</script></body></html>';
  assert.equal((await load(fixture(unreadable),unreadable)).contentAvailable,false);
});

test('stream size is enforced even when content length is absent or dishonest',async()=>{
  let canceled=false;
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(2_100_000));},cancel(){canceled=true;}});
  const context=await load(fixture(),html,{fetchCapture:async()=>new Response(body,{headers:{'content-length':'20'}})});
  assert.equal(context.contentAvailable,false);assert.equal(canceled,true);
});

test('an exhausted deadline permits metadata but does not start a network request',async()=>{
  let calls=0;
  const context=await loadPublicPageContext('/guide/',Date.now()-1,{captures:[fixture()],fetchCapture:async()=>{calls++;return new Response(html);}});
  assert.equal(calls,0);assert.equal(context.contentAvailable,false);
  assert.equal(JSON.parse(context.evidence.content).contentStatus,'metadata_only');
});

test('long excerpts carry truncation and counts rather than silently implying full-page coverage',async()=>{
  const body='<html><body><main><p>'+('An independently recorded public detail. '.repeat(1000))+'</p><p>TAIL_FACT</p></main></body></html>';
  const context=await load(fixture(body),body),data=JSON.parse(context.evidence.content);
  assert.equal(context.contentAvailable,true);assert.equal(data.excerptTruncated,true);
  assert.equal(data.includedCharacters,18000);assert.ok(data.totalCharacters>18000);
  assert.equal(data.excerpt.includes('TAIL_FACT'),false);
  assert.ok(validEvidence([context.evidence]));
});

test('blank manifest titles are resolved only by verified markup or explicitly remain unavailable',async()=>{
  const page=fixture(html,{title:''});
  const context=await load(page),data=JSON.parse(context.evidence.content);
  assert.equal(context.page.title,'Verified campus guide');assert.equal(data.titleSource,'verified_snapshot');
  const unavailable=await load(page,'CHANGED');
  assert.equal(unavailable.page.title,'');assert.equal(JSON.parse(unavailable.evidence.content).titleSource,'unavailable');
  assert.match(publicPageCandidate(unavailable,'What is this page?').answer,/No page title is available/);
  assert.doesNotMatch(publicPageCandidate(unavailable,'What is this page?').answer,/I can verify the page title/);
  assert.doesNotMatch(publicPageCandidate(unavailable,'What is this page?').answer,/Campus guide/);
});

test('real checked-in capture bytes can supply text without calling an original school site',async()=>{
  const page=captures.find(item=>item.title&&item.source.includes('/application-process/'));
  const context=await loadPublicPageContext(page.route,Date.now()+10000,{fetchCapture:async(url)=>{
    assert.equal(url,'https://stu.best'+page.file);
    return new Response(await readFile(new URL('../../public'+page.file,import.meta.url)));
  }});
  assert.equal(context.contentAvailable,true);assert.equal(context.page.title,page.title);
  assert.ok(JSON.parse(context.evidence.content).includedCharacters>50);
});

test('English and Traditional Chinese page references are recognized without hijacking unrelated questions',()=>{
  for(const question of ['What is this page about?','Summarize the current webpage.','Explain the page I am viewing.','What is on the page I opened?','這頁是什麼？','請介紹目前的頁面。','本網頁的內容是什麼？'])assert.equal(isPublicPageQuestion(question),true,question);
  for(const question of ['What is my next class?','Where is the library?','Show my grades.','解釋學費。'])assert.equal(isPublicPageQuestion(question),false,question);
});
