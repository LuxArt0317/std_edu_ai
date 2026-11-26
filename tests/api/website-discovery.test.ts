import test from 'node:test';import assert from 'node:assert/strict';
import {searchWebsite,readWebsitePage,websiteDiscoveryStats} from '../../server/websiteDiscovery.js';
import {answerWithApplicationApis} from '../../server/applicationApiAgent.js';
const decision=(kind:string,fields:Record<string,unknown>={})=>({kind,operationId:'',queryJson:'{}',bodyJson:'{}',searchQuery:'',answer:'',sourceIds:[],...fields});
test('website search retrieves actual calendar text and exposes only registered source IDs',async()=>{
 assert.ok(websiteDiscoveryStats().sources>300);
 const results=await searchWebsite('Commencement Ceremony 2027',{semantic:false});
 const calendar=results.results.find(row=>row.url==='/school-assets/37d6b8aa4582665ff784.pdf');assert.ok(calendar);
 const evidence=readWebsitePage(calendar!.id);assert.match(evidence.id,/^public-page:/);assert.match(evidence.content,/2027|Commencement/);assert.throws(()=>readWebsitePage('https://example.invalid/private'));
});
test('semantic query expansion finds the source despite absent original topic words',async()=>{
 const results=await searchWebsite('Which day will they hand out the caps and gowns?',{decide:async(name:string)=>name==='website_search_expansion'?{queries:['Commencement Ceremony 2027']}:{ids:[]}});
 // A semantic reranker may correctly return no match; do not silently promote discarded leads.
 assert.equal(results.strategy,'lexical+semantic-rerank');assert.deepEqual(results.results,[]);
 const expanded=await searchWebsite('Which day will they hand out the caps and gowns?',{decide:async(name:string)=>{if(name==='website_search_expansion')return {queries:['Commencement Ceremony 2027']};throw Error('reranker unavailable');}});
 assert.ok(expanded.results.some(row=>row.url.endsWith('.pdf')));assert.equal(expanded.strategy,'semantic-expansion+lexical');
});
test('public graph discovers, reads and verifies website content with no account access',async()=>{
 const source={id:'site:fixture',title:'Public source',url:'/school-assets/fixture.pdf'};
 const steps=[decision('search_website',{searchQuery:'ceremony date'}),decision('read_page',{operationId:source.id}),decision('answer',{answer:'The ceremony is on the source date.',sourceIds:['public-page:fixture']})];let reads=0;
 const result=await answerWithApplicationApis({account:null,question:'When will the ceremony take place?',deadline:Date.now()+60000},{unified:true,checkCoverage:async()=>({complete:true,nextSourceId:''}),compose:async(input:any)=>input.candidate,operations:()=>[],decide:async(_n:string,_s:unknown,_i:string,input:any)=>{assert.equal(input.signedIn,false);assert.deepEqual(input.catalog,[]);return steps.shift();},siteSearch:async()=>({results:[source],strategy:'fixture'}),siteRead:async()=>{reads++;return {...source,id:'public-page:fixture',content:'The ceremony is on the source date.'};},invoke:async()=>assert.fail('No private API call'),verify:async()=>({ok:true})});
 assert.equal(reads,1);assert.equal(result?.verification?.status,'verified');assert.equal(result?.grounding?.source,'public-page-context');
});
test('public graph cannot invoke account APIs or read an unsearched source',async()=>{
 let calls=0;const result=await answerWithApplicationApis({account:null,question:'Show my details',deadline:Date.now()+60000},{operations:()=>[],decide:async()=>decision('read',{operationId:'affairs-data.get'}),invoke:async()=>{calls++;assert.fail();}});
 assert.equal(calls,0);assert.equal(result?.status,'handoff');assert.match(result?.answer??'',/sign in/i);
 const unknown=await answerWithApplicationApis({account:null,question:'Read a page',deadline:Date.now()+60000},{maxSteps:1,operations:()=>[],decide:async()=>decision('read_page',{operationId:'unknown'}),siteRead:async()=>assert.fail('Unsearched source cannot be read')});assert.equal(unknown,null);
});
test('coverage review follows an unread source before accepting a premature unavailable answer',async()=>{
 const leads=[{id:'first',title:'Directory',url:'/directory'},{id:'second',title:'Published hours',url:'/hours'}];
 const steps=[decision('search_website',{searchQuery:'observatory hours'}),decision('read_page',{sourceId:'first'}),decision('answer',{answer:'The hours are unavailable.',sourceIds:['public-page:first']}),decision('answer',{answer:'The observatory opens at nine.',sourceIds:['public-page:second']})];const reads:string[]=[];
 const result=await answerWithApplicationApis({account:null,question:'When can I visit the observatory?',deadline:Date.now()+60000},{unified:true,operations:()=>[],decide:async()=>steps.shift(),siteSearch:async()=>({results:leads,strategy:'fixture'}),siteRead:async(id:string)=>{reads.push(id);return {id:'public-page:'+id,title:id,url:'/'+id,content:id==='first'?'See hours document.':'The observatory opens at nine.'};},checkCoverage:async()=>({complete:false,nextSourceId:'second'}),compose:async(input:any)=>input.candidate,verify:async()=>({ok:true})});
 assert.deepEqual(reads,['first','second']);assert.equal(result?.answer,'The observatory opens at nine.');assert.ok(result?.activity?.some(step=>step.kind==='source-coverage'));
});
