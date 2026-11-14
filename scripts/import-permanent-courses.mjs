import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {deploymentEnvironment} from './deployment-env.mjs';
import {permanentCourseSource} from '../server/permanentCourseSource.js';

const [path,mode] = process.argv.slice(2);
if (!path || !['--rollback','--apply'].includes(mode)) throw new Error('Pass the capture path and --rollback or --apply.');
const capture = JSON.parse(await readFile(path,'utf8'));
const {kinds,divisions,groups,defaults,descriptions,capturedAt} = capture;
if (capture.source!==permanentCourseSource || !Number.isFinite(Date.parse(capturedAt)) ||
    !Array.isArray(kinds) || !Array.isArray(divisions) || !Array.isArray(groups) ||
    !Array.isArray(defaults) || !Array.isArray(descriptions) || defaults.length!==50)
  throw new Error('Invalid catalog snapshot.');
const expected = new Set(kinds.flatMap(({value})=>divisions.map(division=>value+'/'+division.value)));
const defaultOrder = new Map(defaults.map((row,index)=>[row.code,index+1]));
const rows = groups.flatMap(group => {
  if (!expected.delete(group.kind+'/'+group.division)) throw new Error('Duplicate or unknown group.');
  return group.rows.map((row,index)=>{
    if (row.kind!==group.kind || row.sequence!==index+1) throw new Error('Invalid course group.');
    return {code:row.code,title:row.title,english_title:row.englishTitle,requirement:row.requirement,credits:row.credits,
      kind:row.kind,division:group.division,department:row.department,duration:row.duration,category_code:row.categoryCode,
      sequence:row.sequence,default_sequence:defaultOrder.get(row.code)??null};
  });
});
const codes = new Set(rows.map(row=>row.code));
if (expected.size || codes.size!==rows.length || defaultOrder.size!==50 || [...defaultOrder.keys()].some(code=>!codes.has(code)) ||
    rows.length<1000 || descriptions.some(row=>!codes.has(row.code)))
  throw new Error('Incomplete permanent course snapshot.');
const detailRows = descriptions.map(row=>({code:row.code,title:row.title,english_title:row.englishTitle,requirement:row.requirement,
  credits:row.credits,college:row.college,department:row.department,description:row.description,english_description:row.englishDescription}));
const config=JSON.parse(await readFile('deployment.json','utf8'));
const env=deploymentEnvironment();
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
const project=config.supabase.projectRef;
if (new URL(url).hostname!==project+'.supabase.co' ||
    !(new URL(connection).hostname==='db.'+project+'.supabase.co' || new URL(connection).username==='postgres.'+project))
  throw new Error('Database target does not match the client project.');
const sql=postgres(connection,{max:1,connect_timeout:15,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const rollback=new Error('catalog preflight rollback');
try {
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('stu-client-migrations'))`;
    if (mode==='--rollback') {
      const [installed]=await tx`select to_regclass('public.affairs_permanent_courses') as table_name`;
      if (!installed.table_name) await tx.unsafe(await readFile('supabase/migrations/20261114160000_permanent_course_catalog.sql','utf8'));
    }
    const [previous]=await tx`select captured_at::text from public.affairs_permanent_course_catalog where id for update`;
    if (previous && Date.parse(previous.captured_at)>Date.parse(capturedAt)) throw new Error('This capture is older than the current catalog.');
    if (previous && Date.parse(previous.captured_at)===Date.parse(capturedAt) && mode==='--apply') {
      console.log(JSON.stringify({status:'already imported',project,capturedAt}));
      return;
    }
    await tx`create temporary table permanent_course_stage (like public.affairs_permanent_courses including all) on commit drop`;
    for(let offset=0; offset<rows.length; offset+=500) {
      await tx`insert into permanent_course_stage ${tx(rows.slice(offset,offset+500))}`;
    }
    // Serialize against description writes while refreshing the course foreign keys.
    await tx`lock table public.affairs_permanent_courses,public.affairs_permanent_course_descriptions in share row exclusive mode`;
    await tx`update public.affairs_permanent_courses set sequence=sequence+1000000,default_sequence=null`;
    await tx`insert into public.affairs_permanent_courses select * from permanent_course_stage
      on conflict(code) do update set title=excluded.title,english_title=excluded.english_title,requirement=excluded.requirement,
      credits=excluded.credits,kind=excluded.kind,division=excluded.division,department=excluded.department,duration=excluded.duration,
      category_code=excluded.category_code,sequence=excluded.sequence,default_sequence=excluded.default_sequence`;
    await tx`delete from public.affairs_permanent_courses c where not exists(select 1 from permanent_course_stage s where s.code=c.code)`;
    await tx`insert into public.affairs_permanent_course_catalog (id,captured_at,kinds,divisions) values (true,${capturedAt},${tx.json(kinds)},${tx.json(divisions)})
      on conflict(id) do update set captured_at=excluded.captured_at,kinds=excluded.kinds,divisions=excluded.divisions`;
    if (detailRows.length) {
      await tx`insert into public.affairs_permanent_course_descriptions ${tx(detailRows)}
        on conflict(code) do update set title=excluded.title,english_title=excluded.english_title,requirement=excluded.requirement,
        credits=excluded.credits,college=excluded.college,department=excluded.department,description=excluded.description,
        english_description=excluded.english_description,captured_at=now()`;
    }
    await tx`set local role anon`;
    const [first]=await tx`select public.affairs_permanent_course_search() as result`;
    const [exact]=await tx`select public.affairs_permanent_course_search(p_code=>${defaults[0].code}) as result`;
    const [count]=await tx`select count(*)::int as rows from public.affairs_permanent_courses`;
    const [access]=await tx`select has_table_privilege('public.affairs_permanent_courses','INSERT') as can_insert,
      has_table_privilege('public.affairs_permanent_course_descriptions','UPDATE') as can_update`;
    if (first.result?.total!==50 || exact.result?.rows[0]?.code!==defaults[0].code || count.rows!==rows.length || access.can_insert || access.can_update)
      throw new Error('Catalog row or access verification failed.');
    console.log(JSON.stringify({status:mode==='--rollback'?'verified in rollback':'verified for commit',project,capturedAt,groups:groups.length,rows:count.rows,defaultRows:first.result.total,descriptions:detailRows.length}));
    if (mode==='--rollback') throw rollback;
  });
} catch(error) {
  if (error!==rollback) throw error;
} finally {await sql.end();}
