import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment();
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
const target=connection&&new URL(connection),project=deployment.supabase.projectRef;
assert.ok(target&&(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project)),
  'Use only the database in deployment.json.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=Symbol('rollback pending-fee fixtures');
const denied=(tx,action,code='42501')=>assert.rejects(tx.savepoint(action),{code});
const role=async(tx,user,initialize=true)=>{
  await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${user},true)`;
  if(initialize)await tx`select public.affairs_initialize_account()`;
};
const call=async(tx,kind,payload)=>(await tx`select public.affairs_manage_record(${kind},${tx.json(payload)}) as result`)[0].result;

try {
  await sql.begin(async tx=>{
    if(process.argv.includes('--preflight'))await tx.unsafe(await readFile('supabase/migrations/20261112080000_pending_fees.sql','utf8'));
    const one=randomUUID(),two=randomUUID();
    for(const id of [one,two]) {
      const email=`pending-fees-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
          '{"provider":"google","providers":["google"]}','{"full_name":"Pending Fee QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider)
        values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
      await role(tx,id);await tx.unsafe('reset role');
    }
    const [student]=await tx`select id from public.affairs_students where user_id=${one}`;
    const [otherStudent]=await tx`select id from public.affairs_students where user_id=${two}`;
    const [owner]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(owner,'Admin checks unavailable: the configured owner must already have a verified Google identity and admin profile; this test never creates or changes either.');
    await role(tx,owner.id,false);
    const payload={student_id:student.id,label:'Synthetic pending fee',amount_due:'1200.75',amount_paid:'200.25',due_on:'2026-12-31'};
    const initial=await call(tx,'save_charge',payload);
    const read=async id=>(await tx`select *,occurrence_on::text as occurred,due_on::text as due from public.affairs_charges where id=${id}`)[0];
    let row=await read(initial.id);
    assert.equal(row.source_mode,'sample');assert.equal(row.currency,'TWD');assert.equal(row.due,'2026-12-31');
    for(const key of ['occurrence_on','category','contact_unit','contact_extension','payment_unit'])assert.equal(row[key],null,key+' stays unknown');
    const edited={...payload,id:initial.id,occurrence_on:'2026-11-12',category:' 示範費用 ',contact_unit:' 示範單位 ',contact_extension:' 2131、2132 ',payment_unit:' 示範收款單位 '};
    await call(tx,'save_charge',edited);row=await read(initial.id);
    assert.equal(row.occurred,'2026-11-12');assert.equal(row.due,'2026-12-31');assert.equal(row.category,'示範費用');
    assert.equal(row.contact_unit,'示範單位');assert.equal(row.contact_extension,'2131、2132');assert.equal(row.payment_unit,'示範收款單位');
    assert.equal(Number(row.amount_due)-Number(row.amount_paid),1000.5);
    await call(tx,'save_charge',{...payload,id:initial.id,amount_paid:'300.25'});
    row=await read(initial.id);assert.equal(row.occurred,'2026-11-12');assert.equal(row.contact_unit,'示範單位','older admin forms preserve omitted metadata');
    await call(tx,'save_charge',{...payload,id:initial.id,occurrence_on:null,category:'  ',contact_unit:null,contact_extension:'',payment_unit:null});
    row=await read(initial.id);
    for(const key of ['occurrence_on','category','contact_unit','contact_extension','payment_unit'])assert.equal(row[key],null,key+' can be explicitly cleared');
    assert.equal(row.due,'2026-12-31','clearing occurrence never clears/substitutes the due date');
    const bounded={...payload,id:initial.id,occurrence_on:'1900-01-01',category:'類'.repeat(80),contact_unit:'聯'.repeat(160),
      contact_extension:'1'.repeat(40),payment_unit:'繳'.repeat(160),amount_due:'9999999999.99',amount_paid:'9999999999.99'};
    await call(tx,'save_charge',bounded);assert.equal((await read(initial.id)).occurred,'1900-01-01');
    await call(tx,'save_charge',{...bounded,occurrence_on:'2100-12-31',amount_due:0,amount_paid:0});
    assert.equal(Number((await read(initial.id)).amount_due),0);
    await call(tx,'save_charge',{...payload,id:initial.id,amount_due:'.50',amount_paid:'.25'});
    assert.equal(Number((await read(initial.id)).amount_due),0.5,'valid decimal input without a leading zero remains supported');
    const badFields=[
      {national_id:'must-not-be-retained'},{source_mode:'verified'},{user_id:two},{currency:'USD'},
      {student_id:null},{label:null},{label:'   '},{label:'ab'},{label:'x'.repeat(161)},
      {amount_due:null},{amount_paid:null},{amount_due:'NaN'},{amount_paid:'NaN'},{amount_due:'Infinity'},{amount_paid:'Infinity'},
      {amount_due:'-1'},{amount_paid:'-1'},{amount_due:'1.001'},{amount_due:'10000000000'},
      {amount_paid:'1200.76'},{amount_due:true},{category:{}},{contact_extension:1234},
      {category:'x'.repeat(81)},{contact_unit:'x'.repeat(161)},{contact_extension:'x'.repeat(41)},{payment_unit:'x'.repeat(161)},
      {occurrence_on:'1899-12-31'},{occurrence_on:'2101-01-01'},{occurrence_on:'infinity'},
      {occurrence_on:'11/12/2026'},{due_on:'December 31, 2026'},
    ];
    for(const bad of badFields)await denied(tx,p=>call(p,'save_charge',{...edited,...bad}),'22023');
    for(const bad of [{amount_due:''},{amount_paid:' '}])await denied(tx,p=>call(p,'save_charge',{...edited,...bad}),'22P02');
    await denied(tx,p=>call(p,'save_charge',{...edited,occurrence_on:'2026-02-30'}),'22008');
    await denied(tx,p=>call(p,'save_charge',{...edited,due_on:'2026-02-30'}),'22008');
    await denied(tx,p=>call(p,'save_charge',{...edited,student_id:otherStudent.id}),'22023');
    assert.equal((await read(initial.id)).student_id,student.id,'an existing charge cannot move accounts');
    await denied(tx,p=>call(p,'delete_charge',{id:initial.id,student_id:otherStudent.id}),'22023');
    await tx.unsafe('reset role');
    const verified=randomUUID();
    await tx`insert into public.affairs_charges(id,student_id,label,amount_due,amount_paid,source_mode)
      values(${verified},${student.id},'Verified fixture charge',100,0,'verified')`;
    await role(tx,owner.id,false);
    await denied(tx,p=>call(p,'save_charge',{...payload,id:verified}),'22023');
    await denied(tx,p=>call(p,'delete_charge',{id:verified}),'22023');
    await tx.unsafe('reset role');await tx`update public.affairs_students set source_mode='verified' where id=${otherStudent.id}`;
    await role(tx,owner.id,false);
    await denied(tx,p=>call(p,'save_charge',{...payload,student_id:otherStudent.id}),'22023');
    await role(tx,one);
    assert.equal((await tx`select id from public.affairs_charges where id=${initial.id}`).length,1);
    await denied(tx,p=>call(p,'save_charge',{...edited,contact_unit:'Student attempt'}));
    await denied(tx,p=>call(p,'delete_charge',{id:initial.id}));
    await denied(tx,p=>p`update public.affairs_charges set category='Direct attempt' where id=${initial.id}`);
    await denied(tx,p=>p`delete from public.affairs_charges where id=${initial.id}`);
    await denied(tx,p=>p`insert into public.affairs_charges(student_id,label,amount_due) values(${student.id},'Direct attempt',1)`);
    await role(tx,two);
    assert.equal((await tx`select id from public.affairs_charges where id=${initial.id}`).length,0);
    await denied(tx,p=>call(p,'save_charge',edited));
    await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
    await denied(tx,p=>p`select id from public.affairs_charges where id=${initial.id}`);
    await denied(tx,p=>call(p,'save_charge',payload));
    await role(tx,owner.id,false);
    await call(tx,'delete_charge',{id:initial.id});
    assert.equal((await tx`select id from public.affairs_charges where id=${initial.id}`).length,0);
    const audits=await tx`select action_kind,summary from public.affairs_agent_audit where target_id=${initial.id}`;
    assert.equal(audits.length,8,'seven successful saves and one delete, no audit for rejected writes');
    assert.equal(audits.filter(item=>item.action_kind==='save_charge').length,7);
    assert.ok(audits.every(item=>!item.summary.includes('must-not-be-retained')));
    throw rollback;
  });
}catch(error){
  if(error!==rollback)throw error;
  console.log('Pending-fee SQL passed: distinct occurrence/due dates, nullable metadata, preserved omitted fields, explicit clearing, text/date/money boundaries, unknown fields, immutable account ownership, verified-provenance protection, audit counts, own/cross/anonymous reads and direct-write/student-RPC denial. All changes rolled back.');
}finally{await sql.end({timeout:5});}
