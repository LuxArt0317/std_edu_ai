import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment(),deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
let target;
try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;
assert.equal(project,'xiftudmvxphxcjtmfmib','Use the client checkout only.');
assert.ok(target.hostname===`db.${project}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+project),'Use only the exact client database.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback course-selection fixtures'),preflight=process.argv.includes('--preflight');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,id,initialize=false)=>{
  await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;
  if(initialize)await tx`select public.affairs_initialize_account()`;
};
const save=async(tx,payload,kind='save_course_selection')=>(await tx`select public.affairs_manage_course_selection(${kind},${tx.json(payload)}) as result`)[0].result;
const operation=payload=>({...payload,request_id:randomUUID()});
const migration='supabase/migrations/20261112100000_course_selection_history.sql';
const one=randomUUID(),two=randomUUID(),recordId=randomUUID();
let rolledBack=false;
try {
  await sql.begin(async tx=>{
    if(preflight)await tx.unsafe(await readFile(migration,'utf8'));
    // Never initialize or change a real administrator's auth identity/profile.
    const [owner]=await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Existing verified Google admin identity and profile are required; this test will not create or alter them.');
    for(const id of [one,two]){
      const email='course-selection-qa-'+id+'@example.invalid';
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Course Selection QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
    }
    await role(tx,one,true);await role(tx,two,true);await role(tx,owner.id);
    const payload=operation({id:recordId,user_id:one,expected_version:'0',academic_year:'115',semester:'1',selection_phase:'add_drop',
      term_course_code:'LOCAL-QA-115',course_title:'Synthetic selection course',required_elective_text:'選修',credits:'3.5',
      instructor_one:'Synthetic teacher',remark_text:'Y(W)',row_order:2,timetable_included:true,
      meetings:[{weekday:1,period:'1',room:'Synthetic 101'},{weekday:3,period:'午',room:''},{weekday:5,period:'D',room:'Synthetic night'}]});
    await denied(tx,point=>save(point,payload,null),'22023');
    await denied(tx,point=>save(point,{...payload,private_identity:'DO-NOT-STORE'}),'22023');
    await denied(tx,point=>save(point,{...payload,remark_text:{private_identity:'DO-NOT-STORE'}}),'22023');
    const invalid=[
      {id:null},{user_id:'not-a-uuid'},{request_id:7},{expected_version:-1},{expected_version:1.5},{academic_year:0},{academic_year:10000},
      {semester:0},{semester:4},{selection_phase:'enrolled'},{selection_phase:null},{term_course_code:''},{term_course_code:'x'.repeat(81)},
      {course_title:' '},{course_title:'x'.repeat(161)},{required_elective_text:'x'.repeat(31)},{credits:'NaN'},{credits:'Infinity'},
      {credits:-1},{credits:1000},{credits:'3.456'},{instructor_one:'x'.repeat(161)},{remark_text:'x'.repeat(301)},
      {row_order:-1},{row_order:1000000},{row_order:1.1},{timetable_included:'false'},{timetable_included:null},
      {meetings:null},{meetings:{}},{meetings:['1']},{meetings:[{weekday:0,period:'1',room:''}]},
      {meetings:[{weekday:8,period:'1',room:''}]},{meetings:[{weekday:'1',period:'1',room:''}]},
      {meetings:[{weekday:1.5,period:'1',room:''}]},{meetings:[{weekday:1,period:'9',room:''}]},
      {meetings:[{weekday:1,period:1,room:''}]},{meetings:[{weekday:1,period:'1'}]},
      {meetings:[{weekday:1,period:'1',room:null}]},{meetings:[{weekday:1,period:'1',room:'x'.repeat(81)}]},
      {meetings:[{weekday:1,period:'1',room:'',private_identity:'DO-NOT-STORE'}]},
      {meetings:[{weekday:1,period:'1',room:''},{weekday:1,period:'1',room:'Different room'}]},
      {meetings:Array.from({length:99},()=>({weekday:1,period:'1',room:''}))},
    ];
    for(const patch of invalid)await denied(tx,point=>save(point,{...operation(payload),...patch}),'22023');
    const periods=['1','2','3','4','午','5','6','7','8','傍','A','B','C','D'];
    const allSlots=Array.from({length:7},(_,day)=>periods.map(period=>({weekday:day+1,period,room:''}))).flat();
    await denied(tx,point=>save(point,operation({...payload,meetings:allSlots.map(slot=>({...slot,room:'室'.repeat(80)}))})),'22023');
    await denied(tx,point=>save(point,operation({...payload,user_id:randomUUID()})));
    const first=await save(tx,payload);assert.equal(first.version,1);assert.deepEqual(await save(tx,payload),first);
    await denied(tx,point=>save(point,operation(payload)),'PT409');
    const [initial]=await tx`select * from public.affairs_course_selection_records where id=${recordId}`;
    assert.equal(initial.user_id,one);assert.equal(initial.selection_phase,'add_drop');assert.equal(Number(initial.credits),3.5);
    assert.equal(initial.timetable_included,true);assert.equal(initial.remark_text,'Y(W)');assert.deepEqual(initial.meetings,payload.meetings);
    assert.equal(initial.source_mode,'local_demo');
    const edited=operation({...payload,expected_version:1,credits:0,required_elective_text:'',instructor_one:null,remark_text:'A',timetable_included:false,meetings:[]});
    assert.equal((await save(tx,edited)).version,2);assert.deepEqual(await save(tx,payload),first,'Late retries must not overwrite later edits.');
    const [after]=await tx`select * from public.affairs_course_selection_records where id=${recordId}`;
    assert.equal(after.version,2);assert.equal(Number(after.credits),0);assert.equal(after.required_elective_text,null);assert.equal(after.instructor_one,null);
    assert.equal(after.remark_text,'A');assert.equal(after.timetable_included,false);assert.deepEqual(after.meetings,[]);
    await denied(tx,point=>save(point,{...edited,course_title:'Changed on reused request'}),'PT409');
    await denied(tx,point=>save(point,operation({...edited,expected_version:1})),'PT409');
    await denied(tx,point=>save(point,operation({...edited,expected_version:2,user_id:two})));
    const [ownerRowId,secondOwnerId,initialPhaseId]=[randomUUID(),randomUUID(),randomUUID()];
    await save(tx,operation({...payload,id:ownerRowId,timetable_included:true,meetings:[]}));
    await save(tx,operation({...payload,id:secondOwnerId,user_id:two,meetings:allSlots}));
    await save(tx,operation({...payload,id:initialPhaseId,selection_phase:'initial',remark_text:'Y',row_order:0}));
    await role(tx,one);
    const visible=await tx`select id from public.affairs_course_selection_records where id in (${recordId},${ownerRowId},${secondOwnerId},${initialPhaseId})`;
    assert.deepEqual(visible.map(row=>row.id).sort(),[recordId,ownerRowId,initialPhaseId].sort());
    assert.equal((await tx`select id from public.affairs_course_selection_records where user_id=${one} and academic_year=115 and semester=1 and selection_phase='initial'`).length,1);
    assert.equal((await tx`select id from public.affairs_course_selection_records where user_id=${one} and academic_year=114`).length,0);
    await denied(tx,point=>save(point,operation({...edited,expected_version:2})));
    await denied(tx,point=>point`insert into public.affairs_course_selection_records(user_id,academic_year,semester,selection_phase,term_course_code,course_title,credits,row_order,timetable_included)
      values(${one},115,1,'initial','LOCAL-QA','Synthetic',3,0,true)`);
    await denied(tx,point=>point`update public.affairs_course_selection_records set remark_text='Student edit' where id=${recordId}`);
    await denied(tx,point=>point`delete from public.affairs_course_selection_records where id=${recordId}`);
    await denied(tx,point=>point`select request_id from private.affairs_course_selection_operations`);
    await role(tx,two);
    assert.equal((await tx`select id from public.affairs_course_selection_records where id=${recordId}`).length,0);
    assert.equal((await tx`select id from public.affairs_course_selection_records where id=${secondOwnerId}`).length,1);
    await denied(tx,point=>save(point,operation({...edited,expected_version:2,user_id:two})));
    await role(tx,owner.id);
    assert.equal((await tx`select id from public.affairs_course_selection_records where id in (${recordId},${secondOwnerId})`).length,2);
    await denied(tx,point=>point`update public.affairs_course_selection_records set remark_text='Direct admin edit' where id=${recordId}`);
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,point=>point`select id from public.affairs_course_selection_records`);await denied(tx,point=>save(point,payload));
    await tx.unsafe('reset role');
    const [audit]=await tx`select count(*)::int as n from public.affairs_agent_audit where target_id=${recordId} and action_kind='save_course_selection'`;
    const [receipts]=await tx`select count(*)::int as n from private.affairs_course_selection_operations where payload->>'id'=${recordId}`;
    assert.equal(audit.n,2);assert.equal(receipts.n,2,'Rejected fields and duplicate attempts must not leave receipts.');
    assert.equal((await tx`select request_id from private.affairs_course_selection_operations where payload::text like '%DO-NOT-STORE%'`).length,0);
    const [ownerAfter]=await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${owner.id}`;
    assert.deepEqual(ownerAfter,owner,'Existing owner auth, identities and profile must be unchanged.');
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;rolledBack=true;}
finally{
  try{
    if(rolledBack){
      assert.equal((await sql`select id from auth.users where id in (${one},${two})`).length,0,'Synthetic accounts must have rolled back.');
      if(preflight)assert.equal((await sql`select to_regclass('public.affairs_course_selection_records') as table_name`)[0].table_name,null,'Preflight migration must have rolled back.');
      console.log('Course-selection history passed: owner/anonymous RLS, strict field/slot/value/size rejection, phase filtering, all98 slots, explicit timetable inclusion, unscheduled records, immutable ownership, direct/student write denial, stable/late receipts, stale/reused conflicts, exact audit count, and unchanged owner identity/profile. Migration and synthetic fixtures rolled back.');
    }
  }finally{await sql.end({timeout:5});}
}
