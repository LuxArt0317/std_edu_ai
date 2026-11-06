import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {questionKind,publicSchoolQuestion,safeWebSource,searchSchoolWeb} from '../../server/schoolWebSearch.js';
const originalFetch=globalThis.fetch, originalKey=process.env.OPENAI_API_KEY;
after(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;});
const url='https://reg.aca.stu.edu.tw/contact/';
function payload(source=url, cited=source, answer='The registrar contact page provides office details.') {
 return {output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{url:source,title:'Registrar contacts'}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'answered',answer,source_urls:[cited]}),annotations:[{type:'url_citation',url:source,title:'Registrar contacts'}]}]}]};
}
test('school scope supports bilingual campus information but excludes private records and unrelated code',()=>{
 for(const q of ['What are my current subjects?','What is my IM101 class grade?','What does the latest announcement for my app class tell me to bring and where?','What is my class announcement?','Tell me Student A grades','What is their attendance?','我的期中成績？','What is my GPA?','My announcements','Password: abc123','Please find student.qa@gmail.com'])assert.equal(questionKind(q).personal,true,q);
 assert.equal(questionKind('Write a Python script to scrape a shop').irrelevant,true);
 assert.equal(questionKind('Does STU offer Python programming courses?').irrelevant,false);
 assert.equal(questionKind('What is the course code?').irrelevant,false);
 assert.equal(questionKind('有哪些最新公告？').fresh,true);
 assert.equal(questionKind('你好').greeting,true);
 assert.equal(publicSchoolQuestion('My grades?'),null);
 assert.equal(publicSchoolQuestion('What does the latest announcement for my app class tell me to bring and where?'),null);
 const follow=publicSchoolQuestion('And the phone number?',[{role:'user',content:'My grades are 72'},{role:'assistant',content:'Private profile record 12345'},{role:'user',content:'Where is the registrar at STU?'}]);
 assert.match(follow!,/registrar/);assert.doesNotMatch(follow!,/72|12345|Private/);
 assert.equal(publicSchoolQuestion('What are their grades?'),null);
});
test('source validation rejects unsafe/protected destinations and literal IPs',()=>{
 for(const value of ['javascript:alert(1)','http://example.com','https://127.0.0.1','https://[::1]/','https://user:pass@example.com','https://example.com:8443','https://example.com/?access_token=secret','https://example.com/?SAMLRequest=secret','https://stu.best/app','https://stdeduai.vercel.app/app'])assert.equal(safeWebSource(value),null,value);
 assert.equal(safeWebSource(url+'#office'),url);
 assert.equal(safeWebSource(url+'?utm_source=openai&fbclid=abc'),url);
});
test('tracking variants resolve to one source and use the question language for the source label',async()=>{
 process.env.OPENAI_API_KEY='test-openai';
 const tracked=url+'?utm_source=openai';
 const candidate=payload(url,tracked,`The official page is [here](${tracked}).`);
 globalThis.fetch=async()=>Response.json(candidate);
 const result=await searchSchoolWeb('What are the STU registrar contacts?');
 assert.equal(result.result?.citations.length,1);
 assert.match(result.result!.answer,/Web sources: \[1\]/);
 assert.doesNotMatch(result.result!.answer,/utm_source/);
});
test('official web search uses hosted tool metadata and returns visible clickable citations',async()=>{
 process.env.OPENAI_API_KEY='test-openai';let body:any;
 globalThis.fetch=async(_input,init)=>{body=JSON.parse(String(init?.body));return Response.json(payload());};
 const result=await searchSchoolWeb('How do I contact the STU registrar?');
 assert.equal(result.result?.origin,'web');assert.match(result.result!.answer,/\[1\]\(https:\/\/reg.aca.stu.edu.tw\/contact\/\)/);
 assert.deepEqual(body.tools[0].filters.allowed_domains,['stu.edu.tw']);assert.equal(body.tool_choice,'required');assert.equal(body.store,false);assert.deepEqual(body.include,['web_search_call.action.sources']);assert.equal(JSON.parse(body.input).responseLanguage,'English');
 assert.equal(result.result?.citations[0].reviewedAt,null);assert.match(result.result!.citations[0].sourceName,/Live web/);
});
test('live search keeps a sourced partial answer when the exact detail is unavailable',async()=>{
 const partial=payload(url,url,'The official page identifies the registrar, but it does not publish the requested opening time. Check the page for updates.');
 const message=partial.output[1] as {content:Array<{text:string}>};
 message.content[0].text=JSON.stringify({status:'not_found',answer:'The official page identifies the registrar, but it does not publish the requested opening time. Check the page for updates.',source_urls:[url]});
 globalThis.fetch=async()=>Response.json(partial);
 const result=await searchSchoolWeb('What are the current STU registrar opening hours?');
 assert.equal(result.result?.origin,'web');
 assert.match(result.result!.answer,/does not publish the requested opening time/);
 assert.match(result.result!.answer,/\[1\]\(https:\/\/reg.aca.stu.edu.tw\/contact\/\)/);
});
test('a retrieved URL in answer text is cited even if the model omits it from source_urls',async()=>{
 const hours='https://www.lib.stu.edu.tw/service/faq/';
 const answer=`The official library FAQ is available at ${hours}`;
 const candidate=payload(url,url,answer);
 (candidate.output[0] as {action:{sources:Array<{url:string,title:string}>}}).action.sources.push({url:hours,title:'Library FAQ'});
 globalThis.fetch=async()=>Response.json(candidate);
 const result=await searchSchoolWeb('Where is the STU library FAQ?');
 assert.equal(result.result?.origin,'web');
 assert.deepEqual(result.result!.citations.map(c=>c.url),[url,hours]);
});
test('missing official results broaden to other STU sources without relabeling them official',async()=>{
 let calls=0;globalThis.fetch=async(_input,init)=>{calls++;const body=JSON.parse(String(init?.body));if(calls===1){assert.ok(body.tools[0].filters);return Response.json({output:[]});}assert.equal(body.tools[0].filters,undefined);return Response.json(payload('https://www.moe.gov.tw/stu/'));};
 const result=await searchSchoolWeb('STU study opportunities');assert.equal(calls,2);assert.equal(result.result?.officialOnly,false);assert.match(result.result!.citations[0].sourceName,/External source/);
});
test('a model scope mistake cannot veto a school question before broader search',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(calls===1?{output:[{type:'message',content:[{text:JSON.stringify({status:'out_of_scope',answer:'',source_urls:[]})}]}]}:payload('https://www.moe.gov.tw/stu/'));};
 const result=await searchSchoolWeb('Where are the STU admissions details?');assert.equal(calls,2);assert.equal(result.result?.origin,'web');
});
test('model-invented citations, missing completed search and hostile links never become accepted answers',async()=>{
 for(const candidate of [payload(url,'https://invented.example.org/'),payload(url,url,'Click [help](javascript:alert(1))'),payload(url,url,'Open <https://evil.example.org>'),{output:[{type:'message',content:[{text:JSON.stringify({status:'answered',answer:'Invented fact',source_urls:[url]})}]}]}]){
  globalThis.fetch=async()=>Response.json(candidate);assert.equal((await searchSchoolWeb('STU contacts')).result,null);
 }
});
test('School Affairs web answers cannot use Nexus demo catalog facts',async()=>{
 process.env.OPENAI_API_KEY='test-openai';
 globalThis.fetch=async()=>Response.json(payload(url,url,'STU Nexus lists IM101 for Fall Semester 2026.'));
 assert.equal((await searchSchoolWeb('What courses are at Shu-Te University?')).result,null);
});
test('private questions and exhausted deadline perform no web requests',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not request');};
 assert.equal((await searchSchoolWeb('What are my grades?')).attempted,false);
 assert.equal((await searchSchoolWeb('STU contacts',{deadline:Date.now()-1})).attempted,false);assert.equal(calls,0);
});
test('search failures stay bounded and safe without exposing provider errors',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('private provider payload');};
 const result=await searchSchoolWeb('STU contact');assert.equal(calls,2);assert.equal(result.result,null);assert.equal(result.attempted,true);assert.doesNotMatch(JSON.stringify(result),/private provider/);
});
