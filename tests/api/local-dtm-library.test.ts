import {readSupplementalLookups} from '../../server/accountSupplementalLookup.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import {importLibrary,readLibrary,sourceKey,validateImport} from '../../server/local-dtm/store.js';
const owner={user:{id:'10000000-0000-4000-8000-000000000001',email:'owner@example.test'},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'fixture-key',token:'fixture-token'} as never;
const stranger={user:{id:'stranger',email:'stranger@example.test'}} as never;
const course={id:'12',title:'Real course',term:'115學年度第1學期',code:'C12',instructor:'Teacher'};
const page={url:'https://dtm.stu.edu.tw/course/view.php?id=12',courseId:'12',title:'Real course',text:'Course contents',activities:[{id:'module-123',title:'Essay',kind:'assign',section:'作業區',description:'Write an essay',availability:'',url:'https://dtm.stu.edu.tw/mod/assign/view.php?id=123'}],tables:[],links:[]};
test('local Moodle import persists and isolates callers, upserts, and disables on Vercel',async()=>{
 const old={path:process.env.LOCAL_DTM_DATABASE,email:process.env.LOCAL_DTM_IMPORT_EMAIL,vercel:process.env.VERCEL,env:process.env.VERCEL_ENV};const directory=mkdtempSync(join(tmpdir(),'moodle-library-'));
 process.env.LOCAL_DTM_DATABASE=join(directory,'db.sqlite');process.env.LOCAL_DTM_IMPORT_EMAIL='owner@example.test';delete process.env.VERCEL;process.env.VERCEL_ENV='development';
 try{await importLibrary(owner,{courses:[course],pages:[page]});const first=await readLibrary(owner);assert.equal(first.courses.length,1);const viaAssistant=await readDtmGradeReportEvidence(owner,{question:'Show all my Moodle grades'});assert.equal(viaAssistant.readState,'ok');assert.equal(viaAssistant.evidence.provenance,'imported');const throughPipeline=await readSupplementalLookups({tools:['dtmGradeReport'],question:'Show all my Moodle grades',route:'/',history:[],snapshot:{} as never,deadline:Date.now()+10000,readers:{dtmGradeReport:async()=>viaAssistant}});assert.equal(throughPipeline[0].readState,'ok');assert.equal(JSON.parse(viaAssistant.evidence.content).courses.length,1);assert.equal(first.counts.activities,1);assert.equal(first.pending,undefined);assert.equal((await readLibrary(owner,{view:'coverage'})).pending?.length,1);assert.equal(statSync(process.env.LOCAL_DTM_DATABASE).mode&0o777,0o600);
 const detail=await readLibrary(owner,{course_id:'12'});assert.equal(detail.pages[0].text,'Course contents');assert.equal((await readLibrary(stranger,{course_id:'12'})).pages.length,0);assert.equal((await readLibrary(stranger)).courses.length,0);
 await assert.rejects(importLibrary(stranger,{courses:[course],pages:[page]}),/cannot import/);await assert.rejects(readLibrary({} as never),/Sign in/);
 await importLibrary(owner,{courses:[course],pages:[{...page,text:'Updated contents'}]});assert.equal((await readLibrary(owner,{q:'Updated'})).pages[0].text,'Updated contents');assert.equal((await readLibrary(owner)).counts.pages,1);
 await assert.rejects(importLibrary(owner,{courses:[course],pages:[{...page,url:'https://evil.test/course/view.php?id=12'}]}));assert.equal((await readLibrary(owner)).counts.pages,1);
 process.env.VERCEL='1';assert.equal((await readLibrary(owner)).enabled,false);await assert.rejects(importLibrary(owner,{courses:[course],pages:[page]}),/disabled/);
 }finally{for(const [key,value]of Object.entries({LOCAL_DTM_DATABASE:old.path,LOCAL_DTM_IMPORT_EMAIL:old.email,VERCEL:old.vercel,VERCEL_ENV:old.env})){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(directory,{recursive:true});}
});
test('source allowlist rejects credentials, control pages and bad activities',()=>{
 for(const url of ['https://dtm.stu.edu.tw/login/logout.php?sesskey=secret','https://dtm.stu.edu.tw/course/view.php?id=1&token=secret','https://evil.test/course/view.php?id=1','https://u:p@dtm.stu.edu.tw/course/view.php?id=1'])assert.throws(()=>sourceKey(url));
 assert.throws(()=>validateImport({courses:[course],pages:[{...page,links:[{title:'Unsafe',url:'javascript:alert(1)'}]}]}));
 assert.throws(()=>validateImport({courses:[course],pages:[{...page,courseId:'99'}]}));
});

test('course discovery, term selection and structured activity/grade reads share exact owned UI links',async()=>{
 const previous={LOCAL_DTM_DATABASE:process.env.LOCAL_DTM_DATABASE,LOCAL_DTM_IMPORT_EMAIL:process.env.LOCAL_DTM_IMPORT_EMAIL,VERCEL:process.env.VERCEL,VERCEL_ENV:process.env.VERCEL_ENV};
 const directory=mkdtempSync(join(tmpdir(),'moodle-course-api-'));process.env.LOCAL_DTM_DATABASE=join(directory,'db.sqlite');process.env.LOCAL_DTM_IMPORT_EMAIL='owner@example.test';delete process.env.VERCEL;process.env.VERCEL_ENV='development';
 try{
 const other={...course,id:'13',term:'114學年度第2學期'};
 const report={...page,url:'https://dtm.stu.edu.tw/grade/report/user/index.php?id=12',text:'Grade report',activities:[],tables:[[['項目','權重','成績','範圍','百分比'],['課程總分','','85','0–100','85%']]]};
 const activities=Array.from({length:52},(_,i)=>({...page.activities[0],id:'module-'+(123+i),url:'https://dtm.stu.edu.tw/mod/assign/view.php?id='+(123+i)}));
 await importLibrary(owner,{courses:[course,other],pages:[{...page,activities},report]});
 const matches=await readLibrary(owner,{view:'courses',q:'C12',term:course.term});assert.equal(matches.courses.length,1);assert.equal(matches.pages.length,0);assert.equal(matches.courses[0].courseUrl,'/dtm/course/import-12');assert.equal(matches.courses[0].url,'/dtm/course/import-12/grades');assert.equal(matches.courses[0].gradeReportAvailable,true);assert.equal(matches.courses[0].gradeText,'85');
 const detail=await readLibrary(owner,{view:'grades',course_id:'12'});assert.equal(detail.pages.length,1);assert.equal(detail.pages[0].localUrl,matches.courses[0].url);assert.deepEqual(detail.pages[0].tables,report.tables);
 const list=await readLibrary(owner,{view:'activities',course_id:'12'});assert.equal(list.activities?.length,50);assert.equal(list.activityPage?.nextOffset,50);assert.equal(list.activities?.[0].detailAvailable,false);assert.equal(list.activities?.[0].url,matches.courses[0].courseUrl);assert.equal((await readLibrary(owner,{view:'activities',course_id:'12',offset:'50'})).activities?.length,2);
 assert.equal((await readLibrary(owner,{view:'courses',term:other.term})).courses[0].gradeReportAvailable,false);
 assert.equal((await readLibrary(stranger,{view:'activities',course_id:'12'})).activities?.length,0);assert.equal((await readLibrary(owner,{course_id:'12',term:other.term})).pages.length,0);
 for(const query of [{course_id:'bad'},{term:['bad']},{offset:'-1'},{offset:'1e2'}])await assert.rejects(readLibrary(owner,query),/Invalid|Choose/);
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(directory,{recursive:true});}
});
