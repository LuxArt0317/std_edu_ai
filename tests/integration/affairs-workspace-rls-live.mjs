import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';

const env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
const project=JSON.parse(await readFile('deployment.json','utf8')).supabase.projectRef;
assert.ok(connection && (new URL(connection).hostname.endsWith('.supabase.com')||new URL(connection).hostname===`db.${project}.supabase.co`),'Client database connection required');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
let checks={};
try {
  const users=await sql`select distinct u.id from auth.users u join auth.identities i on i.user_id=u.id where i.provider='google' and u.email_confirmed_at is not null limit 2`;
  assert.equal(users.length,2,'Two verified Google identities are needed');
  try {
    await sql.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${users[0].id},true)`;
      const first=await tx`select user_id from public.affairs_initialize_account()`;
      assert.equal(first[0].user_id,users[0].id);
      await tx`select public.dtm_initialize_account()`;
      const firstStudent=await tx`select id from public.affairs_students where user_id=${users[0].id}`;
      const firstCharges=await tx`select label,amount_due,amount_paid from public.affairs_charges where student_id=${firstStudent[0].id}`;
      assert.ok(firstCharges.some(row=>row.label==='Sample Fall 2026 tuition' && Number(row.amount_due)===28000 && Number(row.amount_paid)===5000));
      const firstAssignments=await tx`select id,title from public.affairs_assignments where student_id=${firstStudent[0].id}`;
      assert.ok(firstAssignments.some(row=>row.title==='Student services worksheet'));
      assert.ok(firstAssignments.some(row=>row.title==='Practice reflection'));
      const created=await tx`select public.affairs_execute_action('create_task',${{title:'RLS isolation check'}}::jsonb) as result`;
      const taskId=created[0].result.id;
      const request=await tx`select public.affairs_execute_action('create_service_request',${{title:'RLS sample request',details:'Check account isolation',request_type:'general'}}::jsonb) as result`;
      const requestId=request[0].result.id;
      const own=await tx`select count(*)::int as n from public.affairs_tasks where id=${taskId}`;
      assert.equal(own[0].n,1);
      const ownRequest=await tx`select count(*)::int as n from public.affairs_service_requests where id=${requestId}`;
      assert.equal(ownRequest[0].n,1);
      await tx`select set_config('request.jwt.claim.sub',${users[1].id},true)`;
      const second=await tx`select user_id from public.affairs_initialize_account()`;
      assert.equal(second[0].user_id,users[1].id);
      await tx`select public.dtm_initialize_account()`;
      const other=await tx`select count(*)::int as n from public.affairs_tasks where id=${taskId}`;
      assert.equal(other[0].n,0);
      const otherRequest=await tx`select count(*)::int as n from public.affairs_service_requests where id=${requestId}`;
      assert.equal(otherRequest[0].n,0);
      const students=await tx`select count(*)::int as n from public.affairs_students`;
      assert.equal(students[0].n,1);
      const otherAssignments=await tx`select count(*)::int as n from public.affairs_assignments where id=${firstAssignments[0].id}`;
      assert.equal(otherAssignments[0].n,0);
      const otherCharges=await tx`select count(*)::int as n from public.affairs_charges where student_id=${firstStudent[0].id}`;
      assert.equal(otherCharges[0].n,0);
      await assert.rejects(tx`select public.affairs_execute_action('complete_task',${{task_id:taskId}}::jsonb)`);
      checks={firstGoogleInitialized:true,secondGoogleInitialized:true,sampleFeeSeeded:true,schoolAndDtmAssignmentsSeeded:true,ownTaskVisible:true,otherTaskHidden:true,ownRequestVisible:true,otherRequestHidden:true,otherStudentHidden:true,otherAssignmentsHidden:true,otherChargesHidden:true,otherActionRejected:true};
      throw new Error('ROLLBACK_TEST');
    });
  } catch(error) {if(error.message!=='ROLLBACK_TEST') throw error;}
  try {
    await sql.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${users[1].id},true)`;
      await tx`select user_id from public.affairs_initialize_account()`;
      await assert.rejects(tx`select public.affairs_execute_action('publish_announcement',${{title:'Forbidden notice',body:'Student must not publish this'}}::jsonb)`);
      checks.nonAdminNoticeRejected=true;
      throw new Error('ROLLBACK_TEST');
    });
  } catch(error) {if(error.message!=='ROLLBACK_TEST') throw error;}
  try {
    await sql.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${users[1].id},true)`;
      await tx`select user_id from public.affairs_initialize_account()`;
      await assert.rejects(tx`select public.affairs_manage_record('save_charge',${{student_id:users[0].id,label:'Forbidden fee',amount_due:'100',amount_paid:'0'}}::jsonb)`);
      checks.nonAdminRecordWriteRejected=true;
      throw new Error('ROLLBACK_TEST');
    });
  } catch(error) {if(error.message!=='ROLLBACK_TEST') throw error;}
  console.log(JSON.stringify({status:'ok',checks}));
} finally {await sql.end({timeout:5});}
