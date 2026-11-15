import {dtmAssignmentListFixtureMode,dtmAssignmentListRequirement} from './dtm-assignment-list-live.mjs';
import {nativeVenueSetupRequired} from './venue-native-runner.mjs';
import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import {isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {test} from 'node:test';
import vm from 'node:vm';
import {LiveFixtureError,readProtectedOwnerFingerprint,assertProtectedOwnerUnchanged,protectedOwnerFingerprintDigest} from './live-fixtures.mjs';

const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{
  const a=source.indexOf(start),b=end?source.indexOf(end,a):source.length;
  assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ').replaceAll('export function ','function ');
};
const lifecycleSource=section('function checkedProtectedOwnerFingerprint(','/** Read only the exact configured')
  +section('async function assertNoPendingRecoveryLedgers(','async function readSnapshot(')
  +section('async function createFixtureUser(','/** No mutation occurs')
  +section('export async function prepare(','function assertSupported(')
  +section('export function reconcileFixtureIdentity(')
  +'\n({assertNoPendingRecoveryLedgers,reserveLedger,saveLedger,createFixtureUser,prepare,cleanup});';
const runId='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000001';
const email='evaluation.student@example.invalid',ledger='/synthetic/active-fixtures-'+runId+'.json';
const ownRow=()=>({id:userId,email,run_id:runId});
const protectedOwnerEmail='protected-admin@example.invalid';
const protectedFingerprint=()=>({id:'90000000-0000-4000-8000-000000000001',auth_hash:'a'.repeat(32),profile_hash:'b'.repeat(32),identities_hash:'c'.repeat(32)});

function lifecycle({requests=[],users=[],rows=[],owned=true,locked=true,files:initialFiles,deleteFails=false,releaseFails=false,closeFails=false}={}){
  const events=[],deleted=[],records=new Map(rows.map(row=>[row.id,{...row}]));
  const files=new Map(initialFiles??(owned?[[ledger,'initial owned ledger']]:[]));
  let connectionClosed=false,authCreate=async()=>{throw new Error('PROVIDER_SECRET_BODY');};
  const sql=(strings,...values)=>{
    if(!Array.isArray(strings)||!strings.raw)return strings;
    if(connectionClosed)throw new Error('CLOSED_CONNECTION_SECRET');
    const statement=strings.join('?');events.push({kind:'query',statement});
    if(statement.includes('as auth_hash')){events.push({kind:'owner-read'});return Promise.resolve([protectedFingerprint()]);}
    if(statement.includes('raw_user_meta_data')){
      assert.match(statement,/or id=/,'Known IDs must be reconciled even if their email changed.');
      return Promise.resolve([...records.values()].filter(row=>row.email.toLowerCase()===values[0].toLowerCase()||row.id===values[1]));
    }
    if(statement.includes('select id from auth.users where lower(email)'))return Promise.resolve([...records.values()].filter(row=>row.email.toLowerCase()===values[0].toLowerCase()).map(({id})=>({id})));
    if(statement.includes("select 'auth'"))return Promise.resolve([...records.values()].filter(row=>values[0].includes(row.id)).map(({id})=>({kind:'auth',id})));
    return Promise.resolve([]);
  };
  sql.release=async()=>{events.push({kind:'release'});connectionClosed=true;if(releaseFails)throw new Error('RELEASE_SECRET');};
  const state={runId,origin:'https://synthetic.invalid',startedAt:'2026-11-13T00:00:00Z',identityRequests:requests,users,
    protectedOwnerEmail,protectedOwnerBefore:protectedFingerprint(),
    recordIds:new Set(),ledger,ledgerOwned:owned,ledgerTempOwned:false,locked,closing:false,closed:false,sql,
    db:{end:async()=>{events.push({kind:'end'});if(closeFails)throw new Error('CLOSE_SECRET');}},
    admin:{auth:{admin:{createUser:async payload=>{
      const saved=JSON.parse(files.get(ledger));assert.equal(saved.identityRequests.at(-1).state,'pending');
      assert.equal(saved.identityRequests.at(-1).runId,runId);assert.doesNotMatch(files.get(ledger),/PASSWORD_SECRET/);
      events.push({kind:'create'});return authCreate(payload);
    },deleteUser:async id=>{
      const saved=JSON.parse(files.get(ledger));assert.ok(saved.fixtureUserIds.includes(id));
      assert.ok(saved.identityRequests.some(request=>request.id===id&&request.runId===runId&&request.state==='created'));
      events.push({kind:'delete',id});deleted.push(id);
      if(deleteFails)throw new Error('PROVIDER_SECRET_BODY');records.delete(id);return {error:null};
    }}}}};
  const context={dtmAssignmentListFixtureMode,dtmAssignmentListRequirement,nativeVenueSetupRequired,nativeInternshipSetupRequired,nativeStudentLeaveSetupRequired,isElearningPublishedReadbackCase,state,PROJECT:'synthetic-project',UUID:/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    PRIVATE_DIR:'/synthetic',readdir:async directory=>{assert.equal(directory,'/synthetic');events.push({kind:'scan'});return [...files.keys()].filter(path=>path.startsWith(directory+'/')).map(path=>path.slice(directory.length+1));},
    LiveFixtureError,readProtectedOwnerFingerprint,assertProtectedOwnerUnchanged,protectedOwnerFingerprintDigest,ownTables:[],fail:(code,message)=>{throw new LiveFixtureError(code,message);},query:async work=>work(),
    randomBytes:()=>({toString:()=> 'PASSWORD_SECRET'}),
    open:async(path,flag,mode)=>{
      assert.equal(mode,0o600);events.push({kind:'open',path,flag});
      if(flag==='wx'&&files.has(path))throw Object.assign(new Error('PRIVATE_EXISTING_LEDGER'),{code:'EEXIST'});
      files.set(path,'');return {
        writeFile:async value=>{files.set(path,value);events.push({kind:'write',path});},
        sync:async()=>events.push({kind:'sync',path}),close:async()=>events.push({kind:'file-close',path}),
      };
    },
    rename:async(from,to)=>{assert.ok(files.has(from));files.set(to,files.get(from));files.delete(from);events.push({kind:'rename',from,to});},
    chmod:async(path,mode)=>{assert.ok(files.has(path));assert.equal(mode,0o600);},
    rm:async path=>{files.delete(path);events.push({kind:'rm',path});},
  };
  const api=vm.runInNewContext(lifecycleSource,context);
  return {api,context,files,events,deleted,records,sql,admin:state.admin,db:state.db,setCreate:fn=>{authCreate=fn;}};
}

test('startup scans filenames under the held lock and refuses every current or older recovery ledger',async()=>{
  const older='30000000-0000-4000-8000-000000000003';
  for(const name of ['active-fixtures-'+runId+'.json','active-fixtures-'+older+'.json','active-fixtures-'+older+'.json.tmp']){
    const path='/synthetic/'+name,life=lifecycle({owned:false,files:[[path,'DO_NOT_READ_OR_DELETE']]});
    await assert.rejects(life.api.assertNoPendingRecoveryLedgers(),/explicit manual recovery/);
    assert.equal(life.files.get(path),'DO_NOT_READ_OR_DELETE');
    assert.deepEqual(life.events.map(event=>event.kind),['scan']);
  }
  const unlocked=lifecycle({owned:false,locked:false});
  await assert.rejects(unlocked.api.assertNoPendingRecoveryLedgers(),/lock must be held/);
  assert.equal(unlocked.events.length,0);
  const safe=lifecycle({owned:false,files:[['/synthetic/finished-evaluation.json','unrelated report']]});
  await safe.api.assertNoPendingRecoveryLedgers();
  const unreadable=lifecycle({owned:false});
  unreadable.context.readdir=async()=>{throw new Error('PRIVATE_DIRECTORY_DETAIL');};
  await assert.rejects(unreadable.api.assertNoPendingRecoveryLedgers(),error=>{
    assert.equal(error.code,'fixture-ledger');assert.match(error.message,/could not be checked/);
    assert.doesNotMatch(error.message,/PRIVATE_DIRECTORY_DETAIL/);return true;
  });
  assert.equal(unreadable.files.size,0);assert.equal(unreadable.deleted.length,0);
});

test('actual prepare refuses an older recovery ledger before reserving a new ledger or invoking Auth',async()=>{
  const prior='/synthetic/active-fixtures-30000000-0000-4000-8000-000000000003.json.tmp';
  const life=lifecycle({owned:false,locked:false,files:[[prior,'OLD_RECOVERY_CONTENT_MUST_NOT_BE_READ']]});
  const project='xiftudmvxphxcjtmfmib',root='/synthetic-checkout';let ledgerReads=0;
  const tagged=(strings,...values)=>Array.isArray(strings)&&strings.raw&&strings.join('?').includes('pg_try_advisory_lock')
    ? Promise.resolve([{held:true}]):life.sql(strings,...values);
  tagged.release=life.sql.release;
  Object.assign(life.context,{
    state:undefined,ROOT:root,PROJECT:project,resolve,URL,process:{cwd:()=>root},
    deploymentEnvironment:()=>({SUPABASE_URL:'https://'+project+'.supabase.co',DATABASE_URL:'postgres://postgres:synthetic@db.'+project+'.supabase.co/postgres',SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',SUPABASE_SECRET_KEY:'synthetic-service-key'}),
    readFile:async path=>{
      if(path===root+'/deployment.json')return JSON.stringify({repository:'LuxArt0317/std_edu_ai',supabase:{projectRef:project},vercel:{productionUrl:'https://synthetic.invalid'}});
      if(path===root+'/.gitignore')return 'artifacts/\n';
      if(path===root+'/supabase/certs/prod-ca-2021.crt')return 'synthetic certificate';
      ledgerReads++;throw new Error('Recovery contents must not be read.');
    },
    mkdir:async()=>{},chmod:async()=>{},createClient:()=>life.admin,
    postgres:()=>({reserve:async()=>tagged,end:life.db.end}),
    fetch:async()=>{throw new Error('Network is forbidden.');},
  });
  await assert.rejects(life.api.prepare({runId,cases:[{id:'synthetic-case'}],now:'2026-11-13T00:00:00Z',origin:'https://synthetic.invalid'}),error=>{
    assert.equal(error.code,'fixture-ledger');assert.match(error.message,/explicit manual recovery/);return true;
  });
  assert.equal(ledgerReads,0);assert.equal(life.files.get(prior),'OLD_RECOVERY_CONTENT_MUST_NOT_BE_READ');
  assert.equal(life.files.size,1);assert.equal(life.events.filter(event=>['open','write','rename','rm','create','delete'].includes(event.kind)).length,0);
  assert.equal(life.events.filter(event=>event.kind==='scan').length,1);assert.equal(life.context.state,undefined);
});

test('actual prepare captures the fixed owner baseline before ledger/Auth writes and baseline failure creates nothing',async()=>{
  for(const baselineFails of [false,true]){
    const life=lifecycle({owned:false}),root='/synthetic',project='xiftudmvxphxcjtmfmib';
    const tagged=(strings,...values)=>Array.isArray(strings)&&strings.raw&&strings.join('?').includes('pg_try_advisory_lock')
      ? Promise.resolve([{held:true}]):life.sql(strings,...values);
    tagged.release=life.sql.release;
    Object.assign(life.context,{
      state:undefined,ROOT:root,PROJECT:project,resolve,URL,process:{cwd:()=>root},
      deploymentEnvironment:()=>({SUPABASE_URL:'https://'+project+'.supabase.co',DATABASE_URL:'postgres://postgres:synthetic@db.'+project+'.supabase.co/postgres',SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',SUPABASE_SECRET_KEY:'synthetic-service-key'}),
      readFile:async path=>{
        if(path===root+'/deployment.json')return JSON.stringify({repository:'LuxArt0317/std_edu_ai',supabase:{projectRef:project,ownerEmail:protectedOwnerEmail},vercel:{productionUrl:'https://synthetic.invalid'}});
        if(path===root+'/.gitignore')return 'artifacts/\n';
        if(path===root+'/supabase/certs/prod-ca-2021.crt')return 'synthetic certificate';
        throw new Error('Unexpected file read.');
      },
      mkdir:async()=>{},chmod:async()=>{},createClient:()=>life.admin,
      postgres:(_connection,options)=>{
        assert.equal(options.max,1);assert.equal(options.connection.statement_timeout,15000);assert.equal(options.connection.lock_timeout,3000);
        return {reserve:async()=>tagged,end:life.db.end};
      },
      fetch:async()=>{throw new Error('Network is forbidden.');},
      readProtectedOwnerFingerprint:async(sql,email)=>{
        assert.equal(email,protectedOwnerEmail);assert.equal(sql,tagged);
        if(baselineFails)throw new LiveFixtureError('fixture-protected-owner','Protected owner is unavailable.');
        return readProtectedOwnerFingerprint(sql,email);
      },
    });
    await assert.rejects(life.api.prepare({runId,cases:[{id:'synthetic-case'}],now:'2026-11-13T00:00:00Z',origin:'https://synthetic.invalid'}),error=>error.code===(baselineFails?'fixture-protected-owner':'fixture-create'));
    assert.equal(life.deleted.length,0);
    if(baselineFails){
      assert.equal(life.files.size,0);assert.equal(life.events.filter(event=>['open','write','create','delete'].includes(event.kind)).length,0);
    }else{
      const first=kind=>life.events.findIndex(event=>event.kind===kind);
      assert.ok(first('scan')<first('owner-read'));assert.ok(first('owner-read')<first('open'));assert.ok(first('open')<first('create'));
      assert.equal(life.events.filter(event=>event.kind==='owner-read').length,2,'Cleanup also compares the owner after the ambiguous create.');
      const saved=JSON.parse(life.files.get(ledger));assert.deepEqual(saved.protectedOwner,{version:1,fingerprint:protectedOwnerFingerprintDigest(protectedFingerprint())});
      assert.doesNotMatch(life.files.get(ledger),/protected-admin|90000000|auth_hash|profile_hash|identities_hash|synthetic-service-key/);
      assert.equal(saved.identityRequests[0].state,'uncertain');
    }
  }
});

test('preview setup verifies the exact origin and current revision before credentials or ledger access',async()=>{
  const root='/synthetic',life=lifecycle({owned:false}),project='xiftudmvxphxcjtmfmib';
  const origin='https://stdedu-example-v1-d286.vercel.app',expectedReleaseRevision='a'.repeat(40);
  let pinAttempts=0,credentialReads=0;
  Object.assign(life.context,{
    state:undefined,ROOT:root,PROJECT:project,resolve,URL,process:{cwd:()=>root},
    readFile:async()=>JSON.stringify({repository:'LuxArt0317/std_edu_ai',supabase:{projectRef:project},vercel:{productionUrl:'https://stu.best'}}),
    deploymentEnvironment:()=>{credentialReads++;throw new Error('No credentials should be read');},
    createPinnedDeploymentVerifier:(value)=>{
      assert.equal(value.origin,origin);assert.equal(value.approvedPreviewOrigin,origin);
      assert.equal(value.expectedRevision,expectedReleaseRevision);
      return {pin:async()=>{pinAttempts++;throw new Error('fixture mismatch');}};
    },
  });
  const params={runId,cases:[{id:'synthetic-case'}],now:'2026-11-14T00:00:00Z',origin,expectedReleaseRevision};
  await assert.rejects(life.api.prepare(params),{code:'fixture-target'});
  await assert.rejects(life.api.prepare({...params,approvedPreviewOrigin:origin}),{code:'fixture-target'});
  assert.equal(pinAttempts,1);
  assert.equal(credentialReads,0);
  assert.deepEqual(life.events,[]);
});

test('an exclusively reserved intent survives ambiguous Auth create without persisting credentials or provider bodies',async()=>{
  const life=lifecycle({owned:false});
  await life.api.reserveLedger();
  await assert.rejects(life.api.createFixtureUser(0),error=>error.code==='fixture-create');
  const saved=JSON.parse(life.files.get(ledger));
  assert.equal(saved.identityRequests.length,1);assert.equal(saved.identityRequests[0].state,'uncertain');
  assert.doesNotMatch(life.files.get(ledger),/PASSWORD_SECRET|PROVIDER_SECRET|access_token|serviceKey/);
  assert.ok(life.events.findIndex(event=>event.kind==='sync')<life.events.findIndex(event=>event.kind==='create'));
  await assert.rejects(life.api.cleanup(),/still uncertain/);
  assert.ok(life.files.has(ledger));assert.equal(life.deleted.length,0);
});

test('pending cleanup stays unverified and a second call explicitly requires recovery without touching a closed connection',async()=>{
  const life=lifecycle({requests:[{email,runId,state:'uncertain'}]});
  await assert.rejects(life.api.cleanup(),/still uncertain/);
  const queryCount=life.events.filter(event=>event.kind==='query').length;
  assert.equal(life.context.state.closed,true);assert.ok(life.files.has(ledger));
  life.records.set(userId,ownRow()); // The remote create may commit after closure.
  await assert.rejects(life.api.cleanup(),/connection is closed.*explicit recovery/);
  assert.equal(life.events.filter(event=>event.kind==='query').length,queryCount);
  assert.equal(life.deleted.length,0);assert.ok(life.files.has(ledger));
});

test('a reused run ledger is never overwritten or removed after reservation or lease failure',async()=>{
  for(const locked of [false,true]){
    const life=lifecycle({owned:false,locked,files:[[ledger,'FOREIGN_RECOVERY_LEDGER'],[ledger+'.tmp','FOREIGN_RECOVERY_TEMP']]});
    if(locked)await assert.rejects(life.api.reserveLedger(),/already exists/);
    const result=await life.api.cleanup();
    assert.equal(result.verified,true);assert.equal(result.createdUsers,0);
    assert.equal(life.files.get(ledger),'FOREIGN_RECOVERY_LEDGER');assert.equal(life.files.get(ledger+'.tmp'),'FOREIGN_RECOVERY_TEMP');
    assert.equal(life.events.filter(event=>event.kind==='write'||event.kind==='rm').length,0);assert.equal(life.deleted.length,0);
  }
});

test('an existing foreign temporary ledger is neither overwritten nor removed',async()=>{
  const life=lifecycle({owned:false,files:[[ledger+'.tmp','FOREIGN_RECOVERY_TEMP']]});
  await life.api.reserveLedger();
  await assert.rejects(life.api.saveLedger(),/PRIVATE_EXISTING_LEDGER/);
  await assert.rejects(life.api.cleanup(),/Cleanup could not be verified/);
  assert.equal(life.files.get(ledger+'.tmp'),'FOREIGN_RECOVERY_TEMP');assert.equal(life.deleted.length,0);
  assert.equal(life.events.filter(event=>event.kind==='rm').length,0);
});

test('known IDs with changed email or run marker are rejected before any Auth deletion',async()=>{
  for(const patch of [{email:'foreign@example.invalid'},{run_id:'foreign-run-marker'}]){
    const life=lifecycle({requests:[{email,runId,state:'created',id:userId}],users:[{id:userId,token:'SESSION_SECRET'}],rows:[{...ownRow(),...patch}]});
    await assert.rejects(life.api.cleanup(),error=>{
      assert.equal(error.code,'fixture-cleanup');assert.match(error.message,/ownership/);
      assert.doesNotMatch(error.message,/foreign@example|foreign-run-marker|SESSION_SECRET/);return true;
    });
    assert.equal(life.deleted.length,0);assert.ok(life.files.has(ledger));assert.ok(life.records.has(userId));
    assert.equal(life.context.state.users[0].token,null);
  }
});

test('an untracked known identity cannot authorize deletion and a truly absent known ID is not deleted',async()=>{
  const untracked=lifecycle({users:[{id:userId}],rows:[ownRow()]});
  await assert.rejects(untracked.api.cleanup(),/could not be reconciled/);assert.equal(untracked.deleted.length,0);
  const absent=lifecycle({requests:[{email,runId,state:'created',id:userId}],users:[{id:userId}],rows:[]});
  assert.equal((await absent.api.cleanup()).verified,true);assert.equal(absent.deleted.length,0);assert.ok(!absent.files.has(ledger));
});

test('a late committed owned identity is recorded before deletion and its absence is verified before ledger removal',async()=>{
  const life=lifecycle({requests:[{email,runId,state:'uncertain'}],rows:[ownRow()]});
  const result=await life.api.cleanup();assert.equal(result.verified,true);assert.equal(result.createdUsers,1);
  assert.deepEqual(life.deleted,[userId]);assert.equal(life.records.size,0);assert.ok(!life.files.has(ledger));
  assert.ok(life.events.findIndex(event=>event.kind==='rename')<life.events.findIndex(event=>event.kind==='delete'));
  assert.ok(life.events.findIndex(event=>event.kind==='end')<life.events.findIndex(event=>event.kind==='rm'));
  assert.equal(life.context.state,undefined);
});

test('Auth deletion and connection-close failures retain owned recovery records without secrets',async()=>{
  for(const option of [{deleteFails:true},{closeFails:true}]){
    const life=lifecycle({requests:[{email,runId,state:'created',id:userId}],users:[{id:userId,token:'SESSION_SECRET'}],rows:[ownRow()],...option});
    await assert.rejects(life.api.cleanup(),error=>{
      assert.equal(error.code,'fixture-cleanup');assert.doesNotMatch(error.message,/SECRET/);return true;
    });
    assert.ok(life.files.has(ledger));assert.doesNotMatch(life.files.get(ledger),/SESSION_SECRET|PROVIDER_SECRET|CLOSE_SECRET/);
    assert.equal(life.events.filter(event=>event.kind==='rm').length,0);
    assert.equal(life.context.state.closed,true);
    assert.ok(life.context.state.users.every(user=>user.token===null));
  }
});

test('pool end is attempted when reserved release fails, retaining the first safe error and recovery state',async()=>{
  for(const closeFails of [false,true]){
    const life=lifecycle({requests:[{email,runId,state:'created',id:userId}],users:[{id:userId,token:'SESSION_SECRET'}],rows:[ownRow()],releaseFails:true,closeFails});
    await assert.rejects(life.api.cleanup(),error=>{
      assert.equal(error.code,'fixture-cleanup');assert.match(error.message,/release the reserved fixture database connection/);
      assert.doesNotMatch(error.message,/RELEASE_SECRET|CLOSE_SECRET|SESSION_SECRET/);return true;
    });
    const release=life.events.findIndex(event=>event.kind==='release'),end=life.events.findIndex(event=>event.kind==='end');
    assert.ok(release>=0&&end>release);assert.ok(life.files.has(ledger));
    assert.equal(life.context.state.closed,true);assert.ok(life.context.state.users.every(user=>user.token===null));
    assert.equal(life.events.filter(event=>event.kind==='rm').length,0);
  }
});
