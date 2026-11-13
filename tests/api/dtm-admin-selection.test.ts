import assert from 'node:assert/strict';
import test from 'node:test';
import {AffairsWorkspaceError,loadAffairsSnapshot} from '../../server/affairsWorkspace.js';
const manager='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const student='20000000-0000-4000-8000-000000000001';
const account={user:{id:manager},token:'synthetic-manager-token',key:'synthetic-public-key',url:'https://xiftudmvxphxcjtmfmib.supabase.co'};
const id=(group:number,index:number)=>`${group}0000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
type Call={table:string;query:URLSearchParams};
async function mocked(options:{role?:string;badOwner?:boolean;missingStudent?:boolean},check:(calls:Call[])=>Promise<void>){
  const original=globalThis.fetch,calls:Call[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1)!,query=url.searchParams;calls.push({table,query});
    assert.equal(url.origin,account.url);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);assert.equal(init?.method,'GET');
    if(table==='affairs_profiles')return Response.json(query.has('user_id')?[{user_id:manager,role:options.role??'admin',display_name:'Synthetic manager',email:'manager@example.invalid'}]:[]);
    if(table==='affairs_students')return Response.json(query.has('id')&&!options.missingStudent?[{id:student,user_id:owner,student_number:'SYNTHETIC',full_name:'Synthetic student beyond initial page'}]:[]);
    if(table==='dtm_courses'&&query.has('source_mode')){
      assert.equal(query.get('source_mode'),'in.(sample,personal)');assert.equal(query.get('order'),'user_id.asc,id.asc');assert.equal(query.get('limit'),'500');
      const offset=Number(query.get('offset'));return Response.json(Array.from({length:offset===0?500:1},(_,index)=>({id:id(3,offset+index+1),user_id:options.badOwner?other:owner,source_mode:index%2?'sample':'personal',code:'SYNTHETIC',title:'Synthetic course',term:'Synthetic term'})));
    }
    if(table==='affairs_assignments'&&query.has('source_mode')){
      assert.equal(query.get('source_mode'),'in.(sample,personal)');assert.equal(query.get('order'),'student_id.asc,id.asc');assert.equal(query.get('limit'),'500');
      const offset=Number(query.get('offset'));return Response.json(Array.from({length:offset===0?500:1},(_,index)=>({id:id(4,offset+index+1),student_id:student,dtm_course_id:id(3,offset+index+1),source_mode:index%2?'sample':'personal',title:'Synthetic assignment',details:'',due_at:null,status:'open'})));
    }
    return Response.json([]);
  };
  try{await check(calls);}finally{globalThis.fetch=original;}
}
test('admin DTM selection pages every personal/sample course and assignment and resolves omitted account relations',async()=>{
  await mocked({},async calls=>{
    const result=await loadAffairsSnapshot(account,true,{initialize:false}) as {admin:{dtmCourses:unknown[];assignments:{source_mode:string}[];students:{user_id:string}[]};assignments:unknown[];dtm:{courses:unknown[]}};
    assert.equal(result.admin?.dtmCourses.length,501);assert.equal(result.admin?.assignments.length,501);
    assert.equal(result.admin?.students.length,1);assert.equal(result.admin?.students[0].user_id,owner);
    for(const table of ['dtm_courses','affairs_assignments'])assert.deepEqual(calls.filter(call=>call.table===table&&call.query.has('source_mode')).map(call=>call.query.get('offset')),['0','500']);
    const relation=calls.find(call=>call.table==='affairs_students'&&call.query.has('id'))!;assert.equal(relation.query.get('id'),`in.(${student})`);assert.equal(relation.query.get('order'),'id.asc');
    assert.ok(result.admin?.assignments.some(row=>row.source_mode==='personal'));assert.equal(result.assignments.length,0);
    assert.equal(result.dtm.courses.length,0,'Administrator records remain outside own-course data.');
  });
});
test('student callers cannot start expanded admin course/assignment reads',async()=>{
  await mocked({role:'student'},async calls=>{
    await assert.rejects(loadAffairsSnapshot(account,true,{initialize:false}),error=>error instanceof AffairsWorkspaceError&&error.status===403);
    assert.ok(!calls.some(call=>['dtm_courses','affairs_assignments'].includes(call.table)&&call.query.has('source_mode')));
  });
});
test('missing or inconsistent assignment/student/course ownership fails closed instead of silently omitting review choices',async()=>{
  for(const options of [{badOwner:true},{missingStudent:true}])await mocked(options,async()=>{
    await assert.rejects(loadAffairsSnapshot(account,true,{initialize:false}),/Assignment account relations changed/);
  });
});
test('ordinary personal snapshots never perform administrative pagination or account hydration',async()=>{
  await mocked({role:'student'},async calls=>{
    const result=await loadAffairsSnapshot(account,false,{initialize:false});assert.equal(result.admin,undefined);
    assert.ok(!calls.some(call=>call.query.has('source_mode')||call.table==='affairs_students'&&call.query.has('id')));
  });
});
