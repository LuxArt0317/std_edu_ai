import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {validateDtmSubmissionPayload} from '../../server/dtmSubmissions.js';

// Revised after the first rollback preflight hit Supabase's direct-delete guard;
// this revision is prepared, not run. Requires serialized database authorization.
// All rows and optional migration roll back. Storage objects contain synthetic
// metadata only. Delete authorization is checked through the policy helper, never
// DELETE storage.objects or guard bypass. Physical deletion, post-delete ACK and
// simultaneous transactions require the separate real Storage/race harness.
const preflight=process.argv.includes('--preflight');
const arg=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const expectedMigrations=Number(arg('--expected-migrations')),expectedRls=Number(arg('--expected-rls'));
if(preflight)assert.ok(Number.isInteger(expectedMigrations)&&expectedMigrations>0&&Number.isInteger(expectedRls)&&expectedRls>0,
  'Preflight requires --expected-migrations=N and --expected-rls=N.');
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
const project=deployment.supabase.projectRef;assert.equal(project,'xiftudmvxphxcjtmfmib');
assert.ok(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+project),'Exact client database required.');
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const one=randomUUID(),two=randomUUID(),course=randomUUID(),assignment=randomUUID(),secondAssignment=randomUUID();
const rollback=Symbol('rollback DTM submission fixtures'),operation=payload=>({...payload,request_id:randomUUID()});
const role=async(tx,id)=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;};
const reset=tx=>tx.unsafe('reset role');
const denied=(tx,fn,code='42501')=>assert.rejects(tx.savepoint(fn),{code});
const action=async(tx,kind,payload,verified=null)=>(await tx`select public.dtm_submission_action(${kind},${tx.json(payload)},${verified===null?null:tx.json(verified)}) as result`)[0].result;
const workspace=async(tx,id=assignment)=>(await tx`select public.dtm_submission_workspace(${id}) as result`)[0].result;
const objectAccess=async(tx,path,operation)=>(await tx`select private.dtm_submission_object_access(${path},${operation}) as allowed`)[0].allowed;
const baseline=async tx=>(await tx`select (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables`)[0];
const fingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
const begin=operation({assignment_id:assignment,expected_version:0,filename:'Synthetic private homework.txt',size_bytes:12,content_type:'text/plain'});
const commitPayload=(reservation,version)=>operation({assignment_id:assignment,upload_id:reservation.uploadId,expected_version:version});
async function fakeUpload(tx,reservation,size=12){
  const id=randomUUID();
  await tx`insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(${id},'dtm-submissions',${reservation.path},${one},${tx.json({size,mimetype:'text/plain',eTag:'synthetic-'+id})})`;
  return {id,size_bytes:size,content_type:'text/plain',etag:'synthetic-'+id};
}
let before,owner,rolledBack=false;
try{
  before=await baseline(sql);if(preflight)assert.deepEqual(before,{migrations:expectedMigrations,rls_tables:expectedRls});
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='8s'");await tx.unsafe("set local statement_timeout='20s'");
    if(preflight){
      assert.equal((await tx`select to_regclass('public.dtm_assignment_submissions') as name`)[0].name,null);
      await tx.unsafe(await readFile('supabase/migrations/20261112150000_dtm_submissions.sql','utf8'));
      assert.equal((await baseline(tx)).rls_tables,before.rls_tables+2);
    }
    const [administrator]=await tx`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Existing verified Google administrator required; no real identity/profile is created or changed.');owner=await fingerprint(tx,administrator.id);
    for(const id of [one,two]){
      const email=`dtm-submission-qa-${id}@example.invalid`;
      await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),'{"provider":"google","providers":["google"]}','{"full_name":"Synthetic Submission QA"}',now(),now())`;
      await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},'google')`;
      await role(tx,id);await tx`select public.affairs_initialize_account()`;await reset(tx);
    }
    for(const payload of [begin,{...begin,size_bytes:0},{...begin,size_bytes:10485760},{...begin,filename:'界'.repeat(85)},
      ...['\u00a0Synthetic homework.txt\u3000','\ufeffSynthetic.txt','合成\u3000作業.txt'].map(filename=>({...begin,filename}))]){
      assert.equal(validateDtmSubmissionPayload('begin_dtm_submission_upload',payload),null);
      assert.equal((await tx`select private.dtm_submission_payload_valid('begin_dtm_submission_upload',${tx.json(payload)}) as ok`)[0].ok,true);
    }
    for(const patch of [{extra:'DO-NOT-STORE'},{user_id:two},{size_bytes:10485761},{size_bytes:-1},{size_bytes:'12'},{size_bytes:.5},{filename:'../bad'},
      {filename:'a\\b'},{filename:'\n'},{filename:'界'.repeat(86)},{content_type:'text/plain; charset=utf-8'},{expected_version:'0'},{expected_version:999999999}]){
      const payload={...begin,...patch};assert.ok(validateDtmSubmissionPayload('begin_dtm_submission_upload',payload));
      assert.equal((await tx`select private.dtm_submission_payload_valid('begin_dtm_submission_upload',${tx.json(payload)}) as ok`)[0].ok,false);
    }
    const whitespace=[0x9,0xa,0xb,0xc,0xd,0x20,0xa0,0x1680,...Array.from({length:11},(_,index)=>0x2000+index),0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff].map(code=>String.fromCodePoint(code));
    for(const filename of [...whitespace,whitespace.join(''),'\u00a0\u3000',' \u00a0 \ufeff\u3000 ']){
      const payload={...begin,filename};assert.equal(filename.trim(),'');assert.ok(validateDtmSubmissionPayload('begin_dtm_submission_upload',payload));
      assert.equal((await tx`select private.dtm_submission_payload_valid('begin_dtm_submission_upload',${tx.json(payload)}) as ok`)[0].ok,false,'SQL/JS Unicode whitespace parity');
    }
    await role(tx,one);
    await tx`select public.dtm_manage_record('save_dtm_course',${tx.json({id:course,code:'LOCAL-QA',title:'Synthetic submission course',term:'Synthetic term'})})`;
    for(const id of [assignment,secondAssignment])await tx`select public.dtm_manage_record('save_dtm_assignment',${tx.json({id,course_id:course,title:'Synthetic assignment',details:'',due_at:null,status:'open',meeting_id:null})})`;
    for(const filename of ['\u00a0','\u3000','\u00a0\u3000',' \u00a0 \ufeff\u3000 '])
      await denied(tx,p=>action(p,'begin_dtm_submission_upload',operation({...begin,filename})),'22023');
    const first=await action(tx,'begin_dtm_submission_upload',begin);assert.deepEqual(await action(tx,'begin_dtm_submission_upload',begin),first);
    await denied(tx,p=>action(p,'begin_dtm_submission_upload',operation(begin)),'PT409');
    await denied(tx,p=>action(p,'begin_dtm_submission_upload',{...begin,filename:'Changed same request'}),'PT409');
    await denied(tx,p=>p`update public.dtm_assignment_submissions set user_id=${two} where id=${first.submissionId}`);
    await denied(tx,p=>p`select * from private.dtm_submission_uploads`);
    const firstCommit=commitPayload(first,0);
    await denied(tx,p=>action(p,'commit_dtm_submission_upload',firstCommit),'PT409');
    const object=await fakeUpload(tx,first);
    assert.equal(await objectAccess(tx,first.path,'delete'),false,'Pending file cannot be deleted during commit.');
    assert.equal(await objectAccess(tx,first.path,'insert'),true,'Only the live pending reservation permits upload.');
    assert.equal((await tx`select id from storage.objects where id=${object.id}`).length,1,'Owner can inspect pending metadata.');
    assert.equal((await tx`update storage.objects set metadata='{}'::jsonb where id=${object.id} returning id`).length,0,'No overwrite/upsert policy.');
    await denied(tx,p=>action(p,'commit_dtm_submission_upload',firstCommit,{...object,size_bytes:11}),'PT409');
    const saved=await action(tx,'commit_dtm_submission_upload',firstCommit,object);assert.equal(saved.version,1);
    assert.equal(await objectAccess(tx,first.path,'delete'),false,'Current files remain protected.');
    assert.equal(await objectAccess(tx,first.path,'insert'),false,'Saved files cannot be uploaded again.');
    assert.equal((await tx`select id from storage.objects where id=${object.id}`).length,1,'Owner can read saved metadata.');
    assert.deepEqual(await action(tx,'commit_dtm_submission_upload',firstCommit),saved);
    await denied(tx,p=>action(p,'cancel_dtm_submission_upload',operation(firstCommit)),'PT409');
    assert.equal((await workspace(tx)).files[0].filename,begin.filename);
    assert.equal((await tx`select status,submitted_at from public.affairs_assignments where id=${assignment}`)[0].status,'open','Tracker status is independent.');
    await denied(tx,p=>p`select public.dtm_manage_record('delete_dtm_assignment',${p.json({id:assignment,course_id:course})})`);
    await denied(tx,p=>p`select public.dtm_manage_record('delete_dtm_course',${p.json({id:course})})`);
    await role(tx,two);
    assert.equal((await tx`select id from public.dtm_assignment_submissions where id=${first.submissionId}`).length,0);
    assert.equal((await tx`select id from storage.objects where id=${object.id}`).length,0);
    assert.equal(await objectAccess(tx,first.path,'delete'),false,'Another account cannot delete the saved file.');
    await denied(tx,p=>workspace(p));await denied(tx,p=>action(p,'begin_dtm_submission_upload',operation(begin)));
    await denied(tx,p=>action(p,'cancel_dtm_submission_upload',operation(firstCommit)));
    await denied(tx,p=>p`insert into storage.objects(bucket_id,name,metadata) values('dtm-submissions',${one+'/'+randomUUID()+'/'+randomUUID()},'{}'::jsonb)`);
    await tx.unsafe('set local role anon');await denied(tx,p=>p`select id from public.dtm_assignment_submissions`);await denied(tx,p=>workspace(p));
    await role(tx,one);
    const grade=operation({assignment_id:assignment,upload_id:first.uploadId,expected_version:0,status:'graded',grade_text:'P',feedback:null});
    await denied(tx,p=>action(p,'save_dtm_submission_review',grade));
    await reset(tx);await tx`update public.dtm_courses set role='teacher' where id=${course}`;await role(tx,one);
    await denied(tx,p=>action(p,'save_dtm_submission_review',grade),'42501');
    await role(tx,two);await denied(tx,p=>action(p,'save_dtm_submission_review',grade),'42501');
    await role(tx,administrator.id);const graded=await action(tx,'save_dtm_submission_review',grade);assert.equal(graded.version,1);
    assert.deepEqual(await action(tx,'save_dtm_submission_review',grade),graded);
    await denied(tx,p=>action(p,'save_dtm_submission_review',operation(grade)),'PT409');
    await denied(tx,p=>action(p,'save_dtm_submission_review',{...grade,feedback:'Changed same request'}),'PT409');
    await denied(tx,p=>action(p,'save_dtm_submission_review',operation({...grade,assignment_id:secondAssignment})),'42501');
    const clearedGrade=operation({...grade,expected_version:1,status:'not_graded',grade_text:null,feedback:''});
    assert.equal((await action(tx,'save_dtm_submission_review',clearedGrade)).version,2);
    assert.deepEqual(await action(tx,'save_dtm_submission_review',grade),graded,'An old grade receipt cannot overwrite a newer cleared review.');
    const regraded=operation({...grade,expected_version:2,grade_text:'0',feedback:' Revised literal feedback '});
    const latestGrade=await action(tx,'save_dtm_submission_review',regraded);assert.equal(latestGrade.version,3);
    const afterReview=await workspace(tx);
    assert.equal(afterReview.reviews[0].grade_text,'0');assert.equal(afterReview.reviews[0].feedback,' Revised literal feedback ');
    assert.equal(afterReview.reviews[0].version,3);assert.equal(afterReview.submission.version,1);
    assert.equal(afterReview.submission.submitted_at,saved.submittedAt);assert.equal(afterReview.submission.content_modified_at,saved.contentModifiedAt);
    await role(tx,one);
    const replacement=await action(tx,'begin_dtm_submission_upload',operation({...begin,expected_version:1}));
    assert.equal((await workspace(tx)).submission.current_upload_id,first.uploadId,'Pending replacement preserves saved file.');
    await role(tx,administrator.id);await denied(tx,p=>action(p,'save_dtm_submission_review',operation({...grade,upload_id:replacement.uploadId})),'PT409');await role(tx,one);
    const cancellation=commitPayload(replacement,1);const cancelled=await action(tx,'cancel_dtm_submission_upload',cancellation);
    assert.equal(cancelled.cancelled,true);assert.equal((await workspace(tx)).submission.current_upload_id,first.uploadId);
    await role(tx,administrator.id);await denied(tx,p=>action(p,'save_dtm_submission_review',operation({...grade,upload_id:replacement.uploadId})),'PT409');await role(tx,one);
    await denied(tx,p=>fakeUpload(p,replacement));await denied(tx,p=>action(p,'commit_dtm_submission_upload',operation(cancellation),object),'PT409');
    const third=await action(tx,'begin_dtm_submission_upload',operation({...begin,expected_version:1,size_bytes:0}));
    const thirdObject=await fakeUpload(tx,third,0);const thirdCommit=commitPayload(third,1);
    const replaced=await action(tx,'commit_dtm_submission_upload',thirdCommit,thirdObject);assert.equal(replaced.version,2);
    assert.deepEqual(await action(tx,'commit_dtm_submission_upload',firstCommit),saved,'Old commit receipt stays stable after replacement.');
    assert.deepEqual(await action(tx,'cancel_dtm_submission_upload',cancellation),cancelled,'Old cancel receipt cannot change the new revision.');
    const after=await workspace(tx);assert.equal(after.files.length,2);assert.equal(after.reviews[0].upload_id,first.uploadId);assert.equal(after.files.find(f=>f.state==='current').sizeBytes,0);
    assert.equal(await objectAccess(tx,first.path,'delete'),false,'Reviewed retired revision remains protected.');
    await role(tx,administrator.id);await denied(tx,p=>action(p,'save_dtm_submission_review',operation({...grade,expected_version:1})),'PT409');
    await role(tx,one);
    const fourth=await action(tx,'begin_dtm_submission_upload',operation({...begin,expected_version:2}));const fourthObject=await fakeUpload(tx,fourth);
    await action(tx,'commit_dtm_submission_upload',commitPayload(fourth,2),fourthObject);
    for(const invalidLimit of [null,0,-1,101])await denied(tx,p=>p`select public.dtm_submission_cleanup_batch(${invalidLimit})`,'42501');
    const boundedQueue=(await tx`select public.dtm_submission_cleanup_batch(1) as result`)[0].result;assert.equal(boundedQueue.length,1);
    const queued=(await tx`select public.dtm_submission_cleanup_batch(25) as result`)[0].result;
    assert.ok(queued.some(row=>row.path===third.path));assert.ok(!queued.some(row=>row.path===first.path));
    await denied(tx,p=>p`select public.dtm_submission_cleanup_ack(${third.path})`,'PT409');
    assert.equal(await objectAccess(tx,third.path,'delete'),true,'Queued unreviewed revision authorizes Storage API deletion.');
    assert.equal((await tx`select id from storage.objects where id=${thirdObject.id}`).length,1,'Synthetic object stays present; no physical deletion is claimed.');
    assert.ok(queued.some(row=>row.path===replacement.path),'Never-uploaded cancellation is queued.');
    assert.equal(await objectAccess(tx,replacement.path,'delete'),true);
    assert.equal((await tx`select id from storage.objects where bucket_id='dtm-submissions' and name=${replacement.path}`).length,0);
    await tx`select public.dtm_submission_cleanup_ack(${replacement.path})`;
    const afterAck=(await tx`select public.dtm_submission_cleanup_batch(25) as result`)[0].result;
    assert.ok(!afterAck.some(row=>row.path===replacement.path),'ACK removes only the never-uploaded cancelled path.');
    assert.ok(afterAck.some(row=>row.path===third.path),'An existing object remains queued until real Storage deletion.');
    await reset(tx);
    await denied(tx,p=>p`update public.affairs_assignments set dtm_course_id=null,enrollment_id=(select id from public.affairs_enrollments where student_id=(select id from public.affairs_students where user_id=${one}) limit 1) where id=${assignment}`);
    const expired=await (async()=>{await role(tx,one);return action(tx,'begin_dtm_submission_upload',operation({...begin,expected_version:3}));})();
    await reset(tx);await tx`update private.dtm_submission_uploads set expires_at=now()-interval '1 second' where id=${expired.uploadId}`;
    await role(tx,one);await denied(tx,p=>fakeUpload(p,expired));await denied(tx,p=>action(p,'commit_dtm_submission_upload',commitPayload(expired,3),fourthObject),'PT409');
    await tx`select public.dtm_submission_cleanup_batch(25)`;
    await reset(tx);
    assert.equal((await tx`select count(*)::int as n from private.dtm_submission_operations where payload::text like '%DO-NOT-STORE%'`)[0].n,0);
    await tx`delete from auth.users where id=${one}`;
    assert.ok((await tx`select object_path from private.dtm_submission_cleanup where user_id=${one}`).some(row=>row.object_path===fourth.path),'Cleanup survives deleted owner.');
    assert.deepEqual(await fingerprint(tx,administrator.id),owner,'Existing administrator identity/profile unchanged.');
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;rolledBack=true;}
finally{
  try{if(rolledBack){assert.deepEqual(await baseline(sql),before);assert.equal((await sql`select id from auth.users where id in (${one},${two})`).length,0);assert.deepEqual(await fingerprint(sql,owner.id),owner);}}
  finally{await sql.end({timeout:5});}
}
assert.ok(rolledBack);console.log(JSON.stringify({passed:true,preflight,rolledBack:true,syntheticStorageMetadataOnly:true,deletePolicyHelperOnly:true,actualObjectDeletionVerified:false,actualUploadAndParallelRacesVerified:false}));
