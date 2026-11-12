import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';

const env = deploymentEnvironment();
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
const project = JSON.parse(await readFile('deployment.json', 'utf8')).supabase.projectRef;
const target = connection && new URL(connection);
assert.ok(target && (target.hostname === `db.${project}.supabase.co` ||
  target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.' + project)),
  'Use the database connection for the project in deployment.json.');
const sql = postgres(connection, {
  max:1, ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')},
});
const rollback = Symbol('rollback fixture');
const denied = (tx, statement, code = '42501') =>
  assert.rejects(tx.savepoint(statement), {code});
const role = async (tx, userId) => {
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await tx`select public.affairs_initialize_account()`;
  await tx`select public.dtm_initialize_account()`;
};
const dtm = async (tx, kind, data) => (await tx`select public.dtm_manage_record(${kind},${tx.json(data)}) as result`)[0].result;
const service = async (tx, kind, data) => (await tx`select public.affairs_manage_service_record(${kind},${tx.json(data)}) as result`)[0].result;

try {
  await sql.begin(async tx => {
    if (process.argv.includes('--preflight')) {
      await tx.unsafe(await readFile('supabase/migrations/20261112010000_student_workspace.sql','utf8'));
    }
    const user = randomUUID();
    const other = randomUUID();
    for (const id of [user,other]) {
      const email = `student-workspace-qa-${id}@example.invalid`;
      await tx`insert into auth.users
        (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email}, now(),
          '{"provider":"google","providers":["google"]}', '{"full_name":"Student Workspace QA"}', now(), now())`;
      await tx`insert into auth.identities (provider_id, user_id, identity_data, provider)
        values (${id}, ${id}, ${tx.json({sub:id,email,email_verified:true})}, 'google')`;
    }
    await role(tx,user);
    const [sample] = await tx`select id from public.dtm_courses where source_mode='sample'`;
    assert.ok(sample.id);
    assert.equal((await tx`select id from public.affairs_assignments where dtm_course_id=${sample.id}`).length,1);
    await denied(tx,point=>dtm(point,'delete_dtm_course',{id:sample.id}));

    const course = {id:randomUUID(),code:'QA100',title:'Systems Design',term:'115學年度第1學期'};
    const secondCourse = {...course,id:randomUUID(),code:'QA101'};
    await dtm(tx,'save_dtm_course',course);
    await dtm(tx,'save_dtm_course',secondCourse);
    await dtm(tx,'save_dtm_course',{...course,title:'Information Systems'});
    const meeting = {id:randomUUID(),course_id:course.id,meeting_on:'2026-11-11',starts_at:'09:00',title:'Indexes',attendance:'absent'};
    const assignment = {id:randomUUID(),course_id:course.id,meeting_id:meeting.id,title:'Design worksheet',status:'open',due_at:'2026-11-15T07:00:00Z'};
    const grade = {id:randomUUID(),course_id:course.id,label:'Practice exam',score:32,maximum:40};
    const material = {id:randomUUID(),course_id:course.id,title:'Course notes',kind:'page',source_url:'https://dtm.stu.edu.tw/mod/page/view.php?id=123'};
    await dtm(tx,'save_dtm_meeting',meeting);
    await dtm(tx,'save_dtm_assignment',assignment);
    await dtm(tx,'save_dtm_grade',grade);
    await dtm(tx,'save_dtm_material',material);
    await denied(tx,point=>dtm(point,'save_dtm_grade',{...grade,score:41}),'23514');
    await denied(tx,point=>dtm(point,'save_dtm_assignment',{...assignment,id:randomUUID(),course_id:secondCourse.id}),'23503');
    const deadline = {title:'Calendar deadline',due_at:'2026-11-20T01:30:00Z',import_key:'a'.repeat(64)};
    const calendar = {course_id:course.id,events:[deadline]};
    assert.equal((await dtm(tx,'import_dtm_deadlines',calendar)).imported,1);
    assert.equal((await dtm(tx,'import_dtm_deadlines',calendar)).imported,0);
    await dtm(tx,'save_dtm_assignment',{...assignment,status:'submitted'});
    const [saved] = await tx`select status, submitted_at, meeting_id from public.affairs_assignments where id=${assignment.id}`;
    assert.equal(saved.meeting_id,meeting.id);
    assert.equal(saved.status,'submitted');
    assert.ok(saved.submitted_at);
    assert.equal((await tx`select id from public.dtm_meetings where attendance='absent'`).length,1);
    assert.equal((await tx`select id from public.dtm_grade_items where score=32`).length,1);
    assert.equal((await tx`select title from public.dtm_courses where id=${course.id}`)[0].title,'Information Systems');
    const leave = {id:randomUUID(),service_key:'leave',record_type:'leave',title:'Class absence',status:'draft',
      starts_on:'2026-11-11',ends_on:'2026-11-11',leave_category:'personal',periods:'2–3',notes:'Keep these notes private'};
    const internship = {id:randomUUID(),service_key:'internship',record_type:'self_assessment',title:'Placement assessment',status:'draft'};
    await service(tx,'save_service_record',leave);
    await service(tx,'save_service_record',internship);
    await service(tx,'save_service_record',{...leave,status:'filed'});
    assert.equal((await tx`select status from public.affairs_service_records where id=${leave.id}`)[0].status,'filed');
    await service(tx,'submit_service_record_for_review',leave);
    await service(tx,'submit_service_record_for_review',leave);
    const [review] = await tx`select r.id, r.details, r.status from public.affairs_service_requests r
      join public.affairs_service_records s on s.review_request_id=r.id where s.id=${leave.id}`;
    assert.equal(review.status,'open');
    assert.match(review.details,/2026-11-11.*2026-11-11/);
    assert.match(review.details,/Class periods: 2–3/);
    assert.doesNotMatch(review.details,/Keep these notes private/);
    assert.equal((await tx`select id from public.affairs_service_requests where title='Student Leave: Class absence'`).length,1);

    await role(tx,other);
    for (const rows of await Promise.all([
      tx`select id from public.dtm_courses where id=${course.id}`,
      tx`select id from public.dtm_meetings where id=${meeting.id}`,
      tx`select id from public.dtm_materials where id=${material.id}`,
      tx`select id from public.dtm_grade_items where id=${grade.id}`,
      tx`select id from public.affairs_assignments where id=${assignment.id}`,
      tx`select id from public.affairs_service_records where id=${leave.id}`,
      tx`select id from public.affairs_service_requests where id=${review.id}`,
    ])) assert.equal(rows.length,0);
    await denied(tx,point=>dtm(point,'save_dtm_course',{...course,title:'Other account edit'}));
    await denied(tx,point=>dtm(point,'delete_dtm_assignment',assignment));
    await denied(tx,point=>service(point,'save_service_record',{...leave,title:'Other account edit'}));
    await denied(tx,point=>service(point,'delete_service_record',internship));
    await denied(tx,point=>service(point,'submit_service_record_for_review',leave));

    await role(tx,user);
    await dtm(tx,'delete_dtm_meeting',meeting);
    assert.equal((await tx`select meeting_id from public.affairs_assignments where id=${assignment.id}`)[0].meeting_id,null);
    await service(tx,'delete_service_record',leave);
    assert.equal((await tx`select id from public.affairs_service_records where id=${leave.id}`).length,0);
    await dtm(tx,'delete_dtm_course',course);
    assert.equal((await tx`select id from public.dtm_grade_items where id=${grade.id}`).length,0);
    assert.equal((await tx`select id from public.affairs_assignments where dtm_course_id=${course.id}`).length,0);

    await tx.unsafe('set local role anon');
    await tx`select set_config('request.jwt.claim.sub', '', true)`;
    await denied(tx,point=>point`select id from public.affairs_service_records`);
    await denied(tx,point=>dtm(point,'save_dtm_course',course));
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log('Student workspace passed: saves, updates, review requests, deletion, calendar deduplication, same-course constraints and account isolation. Fixtures rolled back.');
} finally {
  await sql.end({timeout:5});
}
