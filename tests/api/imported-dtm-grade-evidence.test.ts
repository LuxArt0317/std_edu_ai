import {test} from 'node:test';import assert from 'node:assert/strict';
import {readImportedDtmGradeEvidence} from '../../server/local-dtm/gradeEvidence.js';
const owner={user:{id:'10000000-0000-4000-8000-000000000001',email:'owner@example.test'}} as never;
const library={enabled:true,counts:{pages:2,activities:0,gradeRows:4},pages:[],courses:[
 {id:'1',title:'Database - DB1 - Teacher',code:'DB1',term:'115-1',instructor:'Teacher',gradeText:'166.00',rangeText:'0–200',percentageText:'83.00 %',rankText:'9/33',url:'/dtm/course/import-1/grades'},
 {id:'2',title:'Projects - PJ2 - Teacher',code:'PJ2',term:'115-1',instructor:'Teacher',gradeText:'-',rangeText:'0–0',percentageText:'-',rankText:'-',url:'/dtm/course/import-2/grades'}]};
test('imported source returns all literal scores and percentages without converting blank marks to zero',async()=>{
 const old=process.env.LOCAL_DTM_DATABASE,vercel=process.env.VERCEL,env=process.env.VERCEL_ENV;process.env.LOCAL_DTM_DATABASE='/unused-test.sqlite';delete process.env.VERCEL;process.env.VERCEL_ENV='development';
 try{const calls:unknown[]=[];const r=await readImportedDtmGradeEvidence(owner,{question:'check all my scores of my subjects in the moodle'},async(a,q)=>{assert.equal(a,owner);calls.push(q);return library;});assert.equal(r?.readState,'ok');const body=JSON.parse(r!.evidence.content);assert.equal(body.courses.length,2);assert.deepEqual(body.courses.map((c:{gradeText:string})=>c.gradeText),['166.00','-']);assert.equal(body.courses[0].percentageText,'83.00 %');assert.equal(body.complete,true);assert.equal(r?.evidence.provenance,'imported');assert.deepEqual(calls,[{view:'grades'}]);assert.doesNotMatch(r!.evidence.content,/owner@example|10000000|not official|demonstration/);
 assert.equal(await readImportedDtmGradeEvidence({user:{id:'guest'}} as never,{},async()=>{assert.fail('Guest read');return library;}),null);
 assert.equal(await readImportedDtmGradeEvidence(owner,{route:'/dtm/course/20000000-0000-4000-8000-000000000001/grades'},async()=>{assert.fail('Wrong source read');return library;}),null);
 }finally{for(const [k,v]of Object.entries({LOCAL_DTM_DATABASE:old,VERCEL:vercel,VERCEL_ENV:env})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
