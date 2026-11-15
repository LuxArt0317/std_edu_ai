import {clubEquipmentFamily,clubEquipmentRequirement} from './club-equipment-hosted.mjs';
import {tutorEvaluationFamily} from './tutor-evaluation-hosted.mjs';
import {healthMetadataFixtureMode,healthMetadataRequirement} from './health-examination-live.mjs';
import {dtmAssignmentListFixtureMode,dtmAssignmentListRequirement} from './dtm-assignment-list-live.mjs';
import {tuitionLedgerFixtureMode} from './tuition-ledger-preview.mjs';
import {dtmGradePreviewMode} from './dtm-grade-report-preview.mjs';
import {venueProtectedFixtureMode} from './venue-protected-fixture.mjs';
import {certificateAwardPreviewMode} from './certificate-award-preview.mjs';
import {confirmedAssignmentTrackerMode} from './confirmed-assignment-tracker-preview.mjs';
import {facilityRepairCancellationMode} from './facility-repair-cancellation-preview.mjs';
import {learningSupportPreviewMode} from './learning-support-preview.mjs';
import {internshipFixtureMode} from './internship-native-fixture.mjs';
import {dtmTimingFixtureMode} from './dtm-submission-timing-preview.mjs';
import {dtmMaterialPreviewMode} from './dtm-material-preview.mjs';
import {clearanceStatusPreviewMode} from './clearance-status-preview.mjs';
import {academicGradesPreviewMode} from './academic-grades-preview.mjs';
import {dtmStudyPreviewMode} from './dtm-study-preview.mjs';
import {nativeVenueSetupRequired} from './venue-native-runner.mjs';
import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import {isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {LiveFixtureError,attachFixtureSession,assertProtectedOwnerUnchanged,protectedOwnerFingerprintDigest} from './live-fixtures.mjs';
import {feeRemissionRunnerCases} from './run.mjs';
import {buildFeeRemissionFixturePlan,feeRemissionLiveFamilyForCase,feeRemissionLivePlanManifest} from './fee-remission-live-plan.mjs';
import {createFeeRemissionFixtureLifecycle} from './fee-remission-fixture-lifecycle.mjs';
import {readRows as readFeeRows,deleteRows as deleteFeeRows,insertRows as insertFeeRows} from './fee-remission-fixture-sql.mjs';
import {loadOwnAffairsCharges} from '../../server/affairsWorkspace.js';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';

// Actual adapter control flow, real fee validators/SQL builders/session objects,
// injected provider/SQL/filesystem boundaries. This is not a live DB/RLS proof.
const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=end?source.indexOf(end,a):source.length;
  assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ').replaceAll('export function ','function ');};
const code='let state; const diagnostic=()=>""; const FEE_FIXTURE_MODE="fee-remission-only";'
  +section('function signals(','/** Synthetic sessions')
  +section('async function query(','/** Read only the exact configured')
  +section('async function assertNoPendingRecoveryLedgers(','async function readSnapshot(')
  +section('async function createFixtureUser(','function assertSupported(')
  +section('export async function forCase(','/** Deliberately')
  +section('export async function afterCase(','/** Removes only this lifecycle')
  +section('export function reconcileFixtureIdentity(')
  +'\nreturn {prepare,forCase,afterCase,cleanup,state:()=>state};';
const project='xiftudmvxphxcjtmfmib',runId='71000000-0000-4000-8000-000000000001';
const ownerIds=['72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002'];
const program='73000000-0000-4000-8000-000000000001',origin='https://stu-fee-review-v1-d286.vercel.app';
const revision='a'.repeat(40),root='/synthetic-client',privateDir=root+'/artifacts/assistant-evaluation';
const fee='affairs_fee_remission',charges='affairs_charges',ops='private.affairs_fee_remission_operations',audit='affairs_agent_audit';
const rows=()=>({[fee]:[],[charges]:[],[ops]:[],[audit]:[]});
const clone=value=>structuredClone(value);
const fingerprint=()=>({id:'79000000-0000-4000-8000-000000000001',auth_hash:'a'.repeat(32),profile_hash:'b'.repeat(32),identities_hash:'c'.repeat(32)});
const packet=()=>feeRemissionRunnerCases();
const caseBy=suffix=>packet().find(row=>row.id==='account:fee-remission-'+suffix);
const session=user=>{const exp=Math.floor(Date.now()/1000)+3600,claims={sub:user.id,iss:'https://'+project+'.supabase.co/auth/v1',role:'authenticated',aud:'authenticated',session_id:randomUUID(),exp};
  return {user:{id:user.id},token_type:'bearer',expires_at:exp,refresh_token:'SYNTHETIC_REFRESH_'+user.id,
    access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.c3ludGhldGlj'};};

function harness({badSeed=false,extraSeed=false,feeWrongOwner=false,commitUncertain=false}={}){
  const events=[],files=new Map(),identities=new Map(),profiles=new Map(),students=new Map();let tableRows=rows(),transaction=null,locked=false,closed=false,api;
  const fail=(code,message)=>{throw new LiveFixtureError(code,message);};
  const ledger=()=>JSON.parse(files.get(privateDir+'/active-fixtures-'+runId+'.json'));
  const userFor=header=>{const token=String(header).replace(/^Bearer /u,'');const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    assert.ok(identities.has(claims.sub),'Only a fresh synthetic caller is accepted');return identities.get(claims.sub);};
  const exactCurrent=()=>api.state().feeFixture.lifecycle.status().phase;
  const tagged=async(strings,...values)=>{
    if(!Array.isArray(strings)||!strings.raw)return strings;
    assert.equal(closed,false);const q=strings.join('?').replace(/\s+/gu,' ').trim();events.push({kind:'sql',q});
    if(q.includes('pg_try_advisory_lock')){locked=true;return [{held:true}];}
    if(q.includes('pg_advisory_unlock')){locked=false;return [{pg_advisory_unlock:true}];}
    if(q.includes('from pg_locks')){assert.match(q,/classid=23101314 and objid=115100 and objsubid=2 and granted/u);return locked?[{held:1}]:[];}
    if(q.startsWith('select id from auth.users where lower(email)'))return [...identities.values()].filter(row=>row.email===values[0]).map(({id})=>({id}));
    if(q.startsWith('insert into auth.identities')){const row=identities.get(values[1]);assert.ok(row);row.google=true;return [];}
    if(q.includes('raw_user_meta_data')&&q.includes('or id='))return [...identities.values()].filter(row=>row.email===values[0]||row.id===values[1]).map(row=>({id:row.id,email:row.email,run_id:row.runMarker}));
    if(q.includes('from auth.users u where u.id in'))return [...identities.values()].filter(row=>values[0].includes(row.id)&&row.google).map(({id,email,runMarker})=>({id,email,runMarker}));
    if(q.includes('select st.id,st.user_id'))return [...students.values()].filter(row=>values[0].includes(row.user_id)&&profiles.get(row.user_id)?.role==='student').map(({id,user_id})=>({id,user_id}));
    if(q.includes("where code='SAMPLE-GEN'"))return [{id:program}];
    if(q.startsWith('insert into public.affairs_profiles')){assert.equal(profiles.has(values[0]),false);profiles.set(values[0],{user_id:values[0],email:values[1],display_name:values[2],role:'student'});return [];}
    if(q.startsWith('insert into public.affairs_students')){
      assert.ok(profiles.has(values[1]));assert.equal(values[4],program);students.set(values[0],{id:values[0],user_id:values[1]});
      const seed={id:randomUUID(),student_id:values[0],label:'Sample Fall 2026 tuition',amount_due:badSeed?1:28000,amount_paid:5000,currency:'TWD',due_on:'2026-12-15',source_mode:'sample',occurrence_on:null,category:null,contact_unit:null,contact_extension:null,payment_unit:null};
      tableRows[charges].push(seed);if(extraSeed)tableRows[charges].push({...seed,id:randomUUID()});events.push({kind:'student-trigger',studentId:values[0]});return [];
    }
    if(q.includes('from public.affairs_charges where student_id='))return clone(tableRows[charges].filter(row=>row.student_id===values[0]).slice(0,2));
    if(q.startsWith('delete from public.affairs_charges where id=')){
      assert.ok(transaction,'Seed removal is inside bootstrap transaction');const selected=tableRows[charges].filter(row=>row.id===values[0]&&row.student_id===values[1]);
      tableRows[charges]=tableRows[charges].filter(row=>!selected.includes(row));events.push({kind:'seed-delete',id:values[0]});return selected.map(({id})=>({id}));
    }
    if(q.startsWith("select 'auth'"))return values[0].filter(id=>identities.has(id)).map(id=>({kind:'auth',id}));
    if(q.startsWith('select id from')&&q.includes('where user_id in'))return [];
    throw new Error('Unexpected mocked tagged SQL: '+q);
  };
  const sql=(strings,...values)=>Array.isArray(strings)&&strings.raw?tagged(strings,...values):strings;
  sql.json=value=>value;
  sql.unsafe=async(q,params=[])=>{
    assert.equal(closed,false);events.push({kind:'unsafe',q});
    if(q==='begin'){assert.equal(transaction,null);transaction={rows:clone(tableRows),profiles:clone([...profiles]),students:clone([...students])};return [];}
    if(q==='rollback'){if(transaction){tableRows=transaction.rows;profiles.clear();transaction.profiles.forEach(([k,v])=>profiles.set(k,v));students.clear();transaction.students.forEach(([k,v])=>students.set(k,v));transaction=null;}return [];}
    if(q==='commit'){assert.ok(transaction);transaction=null;
      if(commitUncertain&&tableRows[fee].length){commitUncertain=false;throw new Error('SYNTHETIC_COMMIT_RESPONSE_LOST');}return [];}
    if(q.startsWith('select id,user_id from public.affairs_students'))return [...students.values()].filter(row=>params.includes(row.id)).map(({id,user_id})=>({id,user_id}));
    if(q.startsWith('select u.id,u.email'))return [...identities.values()].filter(row=>params.includes(row.id)).map(({id,email,runMarker})=>({id,email,runMarker,role:profiles.get(id)?.role??null}));
    const table=Object.keys(tableRows).find(name=>q.includes('from '+(name.startsWith('private.')?name:'public.'+name)+' '));
    if(q.startsWith('select ')&&table){
      const column=table===charges?'student_id':'user_id';return clone(tableRows[table].filter(row=>params.includes(row[column])||params.includes(row.id)||params.includes(row.actor_id)||params.includes(row.target_id)));
    }
    const insert=/^insert into public\.(affairs_fee_remission|affairs_charges) /u.exec(q);
    if(insert){assert.ok(transaction);assert.equal(params[1],runId);const planned=JSON.parse(params[0]),saved=ledger().feeRemissionFixture.journal;
      assert.equal(saved.phase,'transition-intent');assert.ok(planned.every(row=>saved.recordIds.includes(row.id)));
      const key=insert[1],column=key===charges?'student_id':'user_id';tableRows[key].push(...planned);events.push({kind:'fixture-insert',table:key});return planned.map(row=>({id:row.id,[column]:row[column]}));}
    const deletion=/^delete from public\.(affairs_fee_remission|affairs_charges) as r/u.exec(q);
    if(deletion){assert.ok(transaction);assert.equal(params[1],runId);assert.match(q,/assistant_evaluation_run/u);const key=deletion[1],column=key===charges?'student_id':'user_id',targets=JSON.parse(params[0]);
      const selected=tableRows[key].filter(row=>targets.some(target=>target.id===row.id&&target[column]===row[column]));tableRows[key]=tableRows[key].filter(row=>!selected.includes(row));
      events.push({kind:'fixture-delete',table:key});return selected.map(row=>({id:row.id,[column]:row[column]}));}
    throw new Error('Unexpected mocked raw SQL: '+q);
  };
  sql.release=async()=>{closed=true;events.push({kind:'release'});};
  const fetchImpl=async(input,init={})=>{
    const url=new URL(input);events.push({kind:'http',path:url.pathname,query:url.search});
    if(url.origin===origin&&url.pathname==='/release.json'){
      assert.equal(init.credentials,'omit');assert.equal(new Headers(init.headers).has('authorization'),false);
      return Response.json({version:1,revision,source:'vercel-git',environment:'preview',builtAt:'2026-11-14T00:00:00.000Z'});
    }
    const caller=userFor(new Headers(init.headers).get('authorization'));
    if(url.origin===origin&&url.pathname==='/api/affairs-data'){
      assert.equal(url.search,'?scope=fee-remission');assert.equal(init.redirect,'error');
      const records=tableRows[fee].filter(row=>row.user_id===caller.id&&row.deleted_at===null).sort((a,b)=>a.row_order-b.row_order||a.id.localeCompare(b.id))
        .map(({user_id:_owner,updated_at:_updated,deleted_at:_deleted,...row})=>row);
      events.push({kind:'fee-http',owner:caller.id});return Response.json({userId:feeWrongOwner?ownerIds[1]:caller.id,records});
    }
    assert.equal(url.origin,'https://'+project+'.supabase.co');assert.equal(init.method,'GET');
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+caller.id);assert.equal(url.searchParams.get('select'),'id,user_id');
      return Response.json([...students.values()].filter(row=>row.user_id===caller.id));
    }
    if(url.pathname==='/rest/v1/affairs_charges'){
      const own=[...students.values()].find(row=>row.user_id===caller.id);assert.equal(url.searchParams.get('student_id'),'eq.'+own.id);
      assert.equal(url.searchParams.get('order'),'occurrence_on.desc.nullslast,id.asc');events.push({kind:'charge-rest',owner:caller.id});
      return Response.json(tableRows[charges].filter(row=>row.student_id===own.id));
    }
    throw new Error('Unexpected mocked HTTP request: '+url.pathname);
  };
  const admin={auth:{admin:{
    createUser:async value=>{const saved=ledger();assert.equal(saved.identityRequests.at(-1).state,'pending');
      assert.equal(value.user_metadata.assistant_evaluation_run,runId);const id=ownerIds[identities.size];assert.ok(id);const row={id,email:value.email,runMarker:runId,google:false};identities.set(id,row);events.push({kind:'auth-create',id});return {data:{user:{id,email:row.email}},error:null};},
    deleteUser:async id=>{assert.ok(api.state().users.every(user=>user.token===null));assert.equal(tableRows[fee].length,0);assert.equal(tableRows[charges].length,0);
      assert.ok(ledger().identityRequests.some(row=>row.id===id&&row.runId===runId));identities.delete(id);profiles.delete(id);
      for(const [key,row]of students)if(row.user_id===id)students.delete(key);events.push({kind:'auth-delete',id});return {error:null};},
  }}};
  const dependencies={venueProtectedFixtureMode,certificateAwardPreviewMode,confirmedAssignmentTrackerMode,facilityRepairCancellationMode,learningSupportPreviewMode,internshipFixtureMode,dtmGradePreviewMode,dtmTimingFixtureMode,dtmMaterialPreviewMode,clearanceStatusPreviewMode,academicGradesPreviewMode,dtmStudyPreviewMode,tuitionLedgerFixtureMode,clubEquipmentFamily,clubEquipmentRequirement,tutorEvaluationFamily,healthMetadataFixtureMode,healthMetadataRequirement,dtmAssignmentListFixtureMode,dtmAssignmentListRequirement,nativeVenueSetupRequired,nativeInternshipSetupRequired,nativeStudentLeaveSetupRequired,isElearningPublishedReadbackCase,ROOT:root,PROJECT:project,PRIVATE_DIR:privateDir,UUID:/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu,
    LiveFixtureError,fail,resolve,URL,process:{cwd:()=>root},randomBytes,randomUUID,attachFixtureSession,assertProtectedOwnerUnchanged,protectedOwnerFingerprintDigest,ownTables:[],
    readProtectedOwnerFingerprint:async()=>{events.push({kind:'protected-owner'});return fingerprint();},
    readFile:async path=>{if(path===root+'/deployment.json')return JSON.stringify({repository:'LuxArt0317/std_edu_ai',supabase:{projectRef:project,ownerEmail:'protected@example.invalid'},vercel:{productionUrl:'https://stu.best'}});
      if(path===root+'/.gitignore')return 'artifacts/\n';if(path.endsWith('/prod-ca-2021.crt'))return 'synthetic-ca';throw new Error('Unexpected mocked file read');},
    deploymentEnvironment:()=>{events.push({kind:'environment'});return {SUPABASE_URL:'https://'+project+'.supabase.co',DATABASE_URL:'postgres://postgres:synthetic@db.'+project+'.supabase.co/postgres',SUPABASE_PUBLISHABLE_KEY:'SYNTHETIC_PUBLIC',SUPABASE_SECRET_KEY:'SYNTHETIC_SERVER'};},
    mkdir:async()=>{},chmod:async()=>{},readdir:async()=>[...files.keys()].map(path=>path.slice(privateDir.length+1)),
    open:async(path,flag,mode)=>{assert.equal(mode,0o600);if(flag==='wx'&&files.has(path))throw new Error('exists');files.set(path,'');return {writeFile:async value=>{files.set(path,value);events.push({kind:'ledger'});},sync:async()=>{},close:async()=>{}};},
    rename:async(from,to)=>{files.set(to,files.get(from));files.delete(from);},rm:async path=>{files.delete(path);},
    fetch:fetchImpl,createPinnedDeploymentVerifier:options=>createPinnedDeploymentVerifier({...options,fetchImpl}),
    createClient:(_url,key)=>key==='SYNTHETIC_SERVER'?admin:{auth:{signInWithPassword:async({email})=>{const row=[...identities.values()].find(item=>item.email===email);assert.ok(row?.google);return {data:{session:session(row)},error:null};}}},
    postgres:(_connection,options)=>{assert.equal(options.max,1);assert.equal(options.connection.statement_timeout,15000);return {reserve:async()=>sql,end:async()=>events.push({kind:'end'})};},
    readSnapshot:async()=>assert.fail('Fee mode must never initialize the full workspace or DTM snapshot'),
    buildFeeRemissionFixturePlan,feeRemissionLiveFamilyForCase,feeRemissionLivePlanManifest,createFeeRemissionFixtureLifecycle,readFeeRows,deleteFeeRows,insertFeeRows,
    loadOwnAffairsCharges:async account=>{const previous=globalThis.fetch;globalThis.fetch=fetchImpl;
      try{return await loadOwnAffairsCharges(account);}finally{globalThis.fetch=previous;}},
  };
  // Function evaluation intentionally stays in this realm: production validators
  // reject foreign prototypes, so vm-created plan objects are not representative.
  api=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies));
  const prepare=()=>api.prepare({runId,cases:packet(),now:'2026-11-16T08:00:00.000Z',origin,approvedPreviewOrigin:origin,expectedReleaseRevision:revision,fixtureMode:'fee-remission-only',caseFamily:'fee-remission'});
  const forCase=row=>api.forCase(row,{fixtureMode:'fee-remission-only',fixtureFamily:feeRemissionLiveFamilyForCase(row)});
  const afterCase=(row,envelope)=>api.afterCase(row,envelope,{fixtureMode:'fee-remission-only',fixtureFamily:feeRemissionLiveFamilyForCase(row)});
  return {api,prepare,forCase,afterCase,events,files,identities,profiles,students,rows:()=>tableRows,phase:exactCurrent,
    alter:fn=>fn(tableRows),setWrongOwner:value=>{feeWrongOwner=value;}};
}

test('actual fee prepare skips workspace initialization and transitions A/B native reads with exact unchanged proof',async()=>{
  const h=harness(),prepared=await h.prepare();assert.deepEqual(prepared.supportedDomains,['feeRemission','charges']);
  assert.equal(h.identities.size,2);assert.equal(h.students.size,2);assert.equal(h.rows()[charges].length,0);
  assert.equal(h.events.filter(row=>row.kind==='seed-delete').length,2);
  assert.ok(h.events.findIndex(row=>row.kind==='http'&&row.path==='/release.json')<h.events.findIndex(row=>row.kind==='environment'));
  for(const suffix of ['zero-amount','empty','bounded-omission']){
    const item=caseBy(suffix),context=await h.forCase(item);assert.ok(context.token);const envelope={body:{answer:'Synthetic assistant response'},events:[]};
    await h.afterCase(item,envelope);assert.equal(envelope.fixtureReadback.verified,true);assert.equal(envelope.fixtureReadback.independentGolden,true);
    assert.equal(envelope.stateBefore.ownedRecordsDigest,envelope.stateAfterProposal.ownedRecordsDigest);assert.equal(h.api.state().current,null);
  }
  assert.deepEqual(new Set(h.events.filter(row=>row.kind==='fee-http').map(row=>row.owner)),new Set(ownerIds));
  assert.deepEqual(new Set(h.events.filter(row=>row.kind==='charge-rest').map(row=>row.owner)),new Set(ownerIds));
  const serialized=[...h.files.values()].join('');assert.doesNotMatch(serialized,/SYNTHETIC_REFRESH|SYNTHETIC_SERVER|SYNTHETIC_PUBLIC|access_token|refresh_token|password/u);
  const users=[...h.api.state().users];assert.equal((await h.api.cleanup()).verified,true);assert.ok(users.every(user=>user.token===null));
  assert.equal(h.identities.size,0);assert.equal(h.files.size,0);assert.ok(Object.values(h.rows()).every(items=>items.length===0));
  const deleted=h.events.findIndex(row=>row.kind==='auth-delete'),lastFixtureDelete=h.events.findLastIndex(row=>row.kind==='fixture-delete');assert.ok(deleted>lastFixtureDelete);
});

test('anonymous case returns no token but still proves exact before/after records and both owners',async()=>{
  const h=harness();await h.prepare();const item=caseBy('anonymous');assert.deepEqual(await h.forCase(item),{});
  const envelope={body:{error:'Sign-in required'},events:[]};await h.afterCase(item,envelope);
  assert.equal(envelope.stateBefore.ownedRecordsDigest,envelope.stateAfterProposal.ownedRecordsDigest);
  assert.equal(h.events.filter(row=>row.kind==='fee-http').length,4);await h.api.cleanup();
});

test('afterCase rejects actual row mutation before publishing proof and retains unsafe cleanup state',async()=>{
  const h=harness();await h.prepare();const item=caseBy('zero-amount');await h.forCase(item);
  h.alter(value=>{value[fee][0].amount_text='UNAPPROVED CHANGE';});const envelope={body:{answer:'synthetic'},events:[]};
  await assert.rejects(h.afterCase(item,envelope),error=>error.code==='state_mismatch');assert.equal(envelope.fixtureReadback,undefined);
  await assert.rejects(h.api.cleanup());assert.equal(h.events.some(row=>row.kind==='auth-delete'),false);
  assert.equal(h.files.size,1);assert.ok(h.api.state().users.every(user=>user.token===null));
});

test('afterCase foreign-identity output is redacted; exact scoped response mismatch cannot pass',async()=>{
  for(const wrongNative of [false,true]){
    const h=harness();await h.prepare();const item=caseBy('zero-amount');await h.forCase(item);
    const envelope={body:{answer:wrongNative?'Synthetic response':ownerIds[1]},events:[]};if(wrongNative)h.setWrongOwner(true);
    await assert.rejects(h.afterCase(item,envelope),error=>error.code===(wrongNative?'native_readback_failed':'fixture-isolation'));
    assert.equal(envelope.fixtureReadback,undefined);if(!wrongNative)assert.deepEqual(envelope.body,{error:'Fee fixture account isolation failed.'});
    h.setWrongOwner(false);assert.equal((await h.api.cleanup()).verified,true);
  }
});

test('unknown trigger seed rolls back bootstrap and commit uncertainty reconciles exact persisted fee rows',async()=>{
  for(const options of [{badSeed:true},{extraSeed:true}]){
    const h=harness(options);await assert.rejects(h.prepare(),error=>error.code==='fixture-create');
    assert.equal(h.events.some(row=>row.kind==='fixture-insert'),false);assert.equal(h.events.filter(row=>row.kind==='auth-delete').length,2);
    assert.equal(h.identities.size,0);assert.equal(h.profiles.size,0);assert.equal(h.students.size,0);assert.equal(h.files.size,0);
  }
  const h=harness({commitUncertain:true});await h.prepare();await assert.rejects(h.forCase(caseBy('zero-amount')),error=>error.code==='transaction_failed');
  assert.equal(h.phase(),'recovery-required');assert.ok(h.rows()[fee].length>0);assert.equal(h.api.state().current,null);
  assert.equal((await h.api.cleanup()).verified,true);assert.equal(h.files.size,0);assert.equal(h.identities.size,0);
});
