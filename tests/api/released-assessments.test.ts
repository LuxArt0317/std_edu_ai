import test from 'node:test';import assert from 'node:assert/strict';
import {loadOwnReleasedAssessments} from '../../server/affairsWorkspace.js';
const ids=Array.from({length:8},(_,i)=>'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const account={user:{id:ids[0]},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'fixture-key',token:'fixture-token'};
test('released assessment reader queries owned enrollment rows without substituting transcript or final totals',async()=>{
 const saved=globalThis.fetch,calls:URL[]=[];
 globalThis.fetch=async input=>{const url=new URL(String(input));calls.push(url);const table=url.pathname.split('/').at(-1);const rows:Record<string,unknown[]>={affairs_students:[{id:ids[1],user_id:ids[0]}],affairs_enrollments:[{id:ids[2],student_id:ids[1],section_id:ids[3]}],affairs_sections:[{id:ids[3],course_id:ids[4],term_id:ids[5]}],affairs_courses:[{id:ids[4],code:'TEST101',title:'A stored course'}],affairs_terms:[{id:ids[5],label:'Stored term'}],affairs_grade_items:[{id:ids[6],enrollment_id:ids[2],label:'Stored quiz',score:8,maximum:10,released_at:'2026-11-01T00:00:00Z',source_mode:'verified'}]};return Response.json(rows[table!]??[]);};
 try{const value=await loadOwnReleasedAssessments(account);assert.equal(value.grades[0].score,8);assert.equal(value.grades[0].label,'Stored quiz');assert.equal(value.grades[0].sourceMode,'verified');assert.equal(value.grades[0].courseTitle,'A stored course');assert.equal(value.source,'enrollment_assessments');assert.equal(value.complete,true);assert.equal(calls.find(url=>url.pathname.endsWith('affairs_students'))?.searchParams.get('user_id'),'eq.'+ids[0]);assert.equal(calls.find(url=>url.pathname.endsWith('affairs_grade_items'))?.searchParams.get('released_at'),'not.is.null');assert.ok(calls.every(url=>!url.pathname.includes('academic_grade')&&!url.pathname.includes('grade_report')));}finally{globalThis.fetch=saved;}
});
test('released assessment reader rejects foreign student ownership before reading assessments',async()=>{
 const saved=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json([{id:ids[1],user_id:ids[7]}]);};
 try{await assert.rejects(()=>loadOwnReleasedAssessments(account),/ownership/);assert.equal(calls,1);}finally{globalThis.fetch=saved;}
});
