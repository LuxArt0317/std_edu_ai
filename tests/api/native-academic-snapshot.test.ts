import assert from 'node:assert/strict';
import test from 'node:test';
import {loadAffairsSnapshot,manageAffairsRecord,executeAffairsAction} from '../../server/affairsWorkspace.js';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const account={user:{id:owner},token:'synthetic-caller-token',url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-publishable-key'};
const tables=['affairs_academic_grade_records','affairs_academic_term_summaries','affairs_academic_rankings','affairs_academic_metadata',
  'affairs_graduation_reviews','affairs_academic_attendance_statistics','affairs_academic_attendance_details','affairs_academic_attendance_metadata'];
const grade=(index:number,userId=owner)=>({id:`20000000-0000-4000-8000-${String(index).padStart(12,'0')}`,user_id:userId,
  record_kind:'transcript',academic_year:114,semester:2,course_title:`Synthetic ${index}`,course_code:null,category_text:null,module_name:null,
  required_elective_text:null,credits:index===0?0:null,grade_text:' P ',remark_text:null,row_order:index,
  source_mode:'local_demo',version:1,created_at:'2026-11-12T00:00:00Z',updated_at:'2026-11-12T00:00:00Z'});

test('integrated snapshots page native sources with caller JWT, keep admin rows separate, and hydrate their owners',async()=>{
  const original=globalThis.fetch,seen:URL[]=[];let admin=false;
  const own=Array.from({length:501},(_,index)=>grade(index)),foreign=grade(999,other);
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1)!;seen.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);
    assert.equal(new Headers(init?.headers).get('apikey'),account.key);
    assert.equal(init?.method,'GET','initialize:false must never run a write');
    if(table==='affairs_profiles')return Response.json(url.searchParams.get('user_id')===`in.(${other})`
      ?[{user_id:other,display_name:'Same Name',email:'other@example.invalid',role:'student'}]
      :[{user_id:owner,display_name:'Same Name',email:'own@example.invalid',role:admin?'admin':'student'}]);
    if(tables.includes(table)){
      const scope=url.searchParams.get('user_id');
      if(scope!==null)assert.equal(scope,'eq.'+owner);else assert.equal(admin,true);
      assert.match(url.searchParams.get('order')||'',/id.asc$/);
      const rows=table===tables[0]?(scope?own:[...own,foreign]):[];
      return Response.json(rows.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+500));
    }
    return Response.json([]);
  };
  try{
    const personal:any=await loadAffairsSnapshot(account,false,{initialize:false,deadline:Date.now()+10000});
    assert.equal(personal.academicGrades.records.length,501);assert.equal(personal.admin,undefined);
    assert.equal(personal.academicGrades.records[0].credits,0);assert.equal(personal.academicGrades.records[1].credits,null);
    assert.equal(personal.academicGrades.records[0].gradeText,' P ');
    for(const table of tables)assert.deepEqual(personal.completeness[table],{returned:table===tables[0]?501:0,complete:true});
    assert.deepEqual(personal.graduationReview.reports,[]);assert.deepEqual(personal.academicAttendance.metadata,[]);
    assert.ok(seen.some(url=>url.pathname.endsWith(tables[0])&&url.searchParams.get('offset')==='500'));
    admin=true;
    const managed:any=await loadAffairsSnapshot(account,true,{initialize:false});
    assert.ok(managed.academicGrades.records.every((row:{userId:string})=>row.userId===owner));
    assert.equal(managed.admin.academicGrades.records.length,502);
    assert.equal(managed.admin.profiles.find((row:{user_id:string})=>row.user_id===other)?.email,'other@example.invalid');
  }finally{globalThis.fetch=original;}
});

test('administrator native queries are rejected before reading the unfiltered sources',async()=>{
  const original=globalThis.fetch;let nativeReads=0;
  globalThis.fetch=async input=>{
    const table=new URL(String(input)).pathname.split('/').at(-1);
    if(tables.includes(table||''))nativeReads++;
    return Response.json(table==='affairs_profiles'?[{user_id:owner,role:'student'}]:[]);
  };
  try{
    await assert.rejects(loadAffairsSnapshot(account,true,{initialize:false}),error=>{
      assert.equal((error as {status:number}).status,403);return true;
    });assert.equal(nativeReads,0);
  }finally{globalThis.fetch=original;}
});

test('all native manager kinds use authenticated RPCs with sanitized version conflicts and cannot use the personal-action endpoint',async()=>{
  const routes={save_academic_grade_record:'affairs_manage_academic_grades',save_academic_term_summary:'affairs_manage_academic_grades',
    save_academic_ranking:'affairs_manage_academic_grades',save_academic_metadata:'affairs_manage_academic_grades',
    save_graduation_review:'affairs_manage_graduation_review',save_academic_attendance_statistic:'affairs_manage_academic_attendance',
    save_academic_attendance_detail:'affairs_manage_academic_attendance',save_academic_attendance_metadata:'affairs_manage_academic_attendance'};
  const original=globalThis.fetch;let conflict=false,calls=0;
  const payload={id:owner,user_id:owner,request_id:other,expected_version:1};
  globalThis.fetch=async(input,init)=>{
    calls++;const body=JSON.parse(String(init?.body)),kind=body.p_kind as keyof typeof routes;
    assert.equal(String(input),account.url+'/rest/v1/rpc/'+routes[kind]);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);
    assert.deepEqual(body.p_payload,payload);
    return Response.json(conflict?{message:'PRIVATE SQL DETAIL'}:{id:owner,version:2},{status:conflict?409:200});
  };
  try{
    for(const kind of Object.keys(routes)){
      conflict=false;assert.deepEqual(await manageAffairsRecord(account,kind,payload),{id:owner,version:2});
      const before=calls;await assert.rejects(executeAffairsAction(account,kind,payload),/Unsupported School Affairs action/);assert.equal(calls,before);
      conflict=true;await assert.rejects(manageAffairsRecord(account,kind,payload),error=>{
        assert.equal((error as {status:number}).status,409);assert.match((error as Error).message,/Refresh and try again/);
        assert.doesNotMatch((error as Error).message,/PRIVATE SQL DETAIL/);return true;
      });
    }
  }finally{globalThis.fetch=original;}
});
