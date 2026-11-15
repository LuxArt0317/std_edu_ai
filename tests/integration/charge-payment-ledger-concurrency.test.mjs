import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import postgres from 'postgres';

const socket=process.env.STU_PAYMENT_TEST_PG_SOCKET;
const migration=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');

function gate(){
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  return {pending,release};
}

async function blockingConnection(observe,waiter,expectedBlocker){
  const deadline=Date.now()+2500;
  do{
    const [{blocking,locks}]=await observe`select pg_blocking_pids(${waiter}::integer) as blocking,
      array(select locktype from pg_locks where pid=${waiter} and not granted) as locks`;
    if(blocking.includes(expectedBlocker))return locks;
    await delay(15);
  }while(Date.now()<deadline);
  assert.fail('The second PostgreSQL transaction never waited for the first backend.');
}

test('dated charge writes serialize across independent PostgreSQL backends', {skip:!socket,timeout:30000},async t=>{
  assert.match(socket,/^\/private\/var\/tmp\/stu100-payment-pg\.[A-Za-z0-9]{6}\/socket$/u);
  const directory=await lstat(socket),socketFile=await lstat(join(socket,'.s.PGSQL.5432'));
  assert.equal(await realpath(socket),socket);
  assert.equal(directory.uid,process.getuid());
  assert.equal(directory.mode&0o777,0o700);
  assert.equal(socketFile.uid,process.getuid());
  assert.ok(socketFile.isSocket());
  const open=database=>postgres({host:socket,user:'postgres',database,port:5432,max:1,ssl:false,connect_timeout:3,
    connection:{application_name:'stu-payment-concurrency-local',statement_timeout:6500},onnotice:()=>{}});
  const bootstrap=open('postgres');
  let databaseCreated=false;
  const name='payment_qa_'+randomUUID().replaceAll('-','');
  const connections=[];
  t.after(async()=>{
    try{
      await Promise.all(connections.map(sql=>sql.end({timeout:3})));
      if(databaseCreated)await bootstrap.unsafe('drop database '+name);
    }finally{await bootstrap.end({timeout:3});}
  });
  assert.deepEqual(Array.from(await bootstrap`show listen_addresses`),[{listen_addresses:''}]);
  assert.deepEqual(Array.from(await bootstrap`show data_directory`),[{data_directory:join(dirname(socket),'data')}]);
  await bootstrap.unsafe('create database '+name);
  databaseCreated=true;
  const [observe,first,second]=[open(name),open(name),open(name)];
  connections.push(observe,first,second);
  await observe.unsafe(`
    do $$begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end$$;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated;
  `);
  for(const file of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
    '20261112080000_pending_fees.sql','20261116000000_charge_payment_history.sql'])
    await observe.unsafe(await migration(file));
  const ownerEmail=JSON.parse(await readFile(new URL('../../deployment.json',import.meta.url),'utf8')).supabase.ownerEmail;
  const actor=randomUUID(),caller=randomUUID(),student=randomUUID();
  for(const [id,email,role] of [[actor,ownerEmail,'admin'],[caller,'payment-fixture@example.invalid','student']]){
    await observe`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(${id},${email},now(),'{}')`;
    await observe`insert into auth.identities(provider_id,user_id,identity_data,provider)
      values(${id},${id},'{"email_verified":true}','google')`;
    await observe`insert into public.affairs_profiles(user_id,email,display_name,role) values(${id},${email},'Synthetic QA',${role})`;
  }
  await observe`insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level)
    select ${student},${caller},'SYNTHETIC-PAYMENT-QA','Synthetic QA',id,1 from public.affairs_programs where code='SAMPLE-GEN'`;
  const paidOn='2026-01-02';
  const seed=async amount=>{
    const charge=randomUUID();
    await observe`insert into public.affairs_charges(id,student_id,label,amount_due,amount_paid)
      values(${charge},${student},'Synthetic tuition',100.00,${amount})`;
    return charge;
  };
  const record=(charge,amount,request=randomUUID())=>({request_id:request,student_id:student,charge_id:charge,
    paid_on:paidOn,currency:'TWD',amount});
  async function snapshot(charge){
    const [state]=await observe`select amount_due::text,amount_paid::text,legacy_amount_paid::text from public.affairs_charges where id=${charge}`;
    const entries=await observe`select id,amount::text,entry_kind from public.affairs_charge_payment_entries where charge_id=${charge} order by id`;
    const [{audits}]=await observe`select count(*)::integer as audits from public.affairs_agent_audit
      where user_id=${actor} and target_id in (select id from public.affairs_charge_payment_entries where charge_id=${charge})`;
    const receipts=await observe`select request_id,receipt from private.affairs_charge_payment_operations
      where actor_id=${actor} and payload->>'charge_id'=${charge} order by request_id`;
    return {state,entries:Array.from(entries),audits,receipts:Array.from(receipts)};
  }
  async function settle(left,right){
    const lock=gate(),firstRead=gate(),secondStarted=gate();
    const outcomes=[];
    const request=async(tx,payload)=>{
      const [{receipt}]=await tx`select public.affairs_change_charge_payment('record_charge_payment',${tx.json(payload)}) as receipt`;
      return receipt;
    };
    const login=async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      const [{pid}]=await tx`select pg_backend_pid() as pid`;
      return pid;
    };
    const a=first.begin(async tx=>{
      const pid=await login(tx),receipt=await request(tx,left);
      firstRead.release({pid,receipt});
      await lock.pending;
      return receipt;
    });
    const recordA=a.then(value=>({value}),error=>({error}));
    outcomes.push(recordA);
    let locks;
    try{
      const {pid:leader}=await Promise.race([firstRead.pending,recordA.then(({error})=>{if(error)throw error;assert.fail('First transaction exited before the barrier.');})]);
      const b=second.begin(async tx=>{
        const pid=await login(tx);
        secondStarted.release(pid);
        return request(tx,right);
      });
      const recordB=b.then(value=>({value}),error=>({error}));
      outcomes.push(recordB);
      const waiter=await Promise.race([secondStarted.pending,recordB.then(({error})=>{if(error)throw error;assert.fail('Second request exited before its backend was identified.');})]);
      assert.notEqual(leader,waiter,'Both requests must run in separate server processes.');
      locks=await blockingConnection(observe,waiter,leader);
    }finally{
      lock.release();
      await Promise.all(outcomes);
    }
    const [winner,other]=await Promise.all(outcomes);
    if(winner.error)throw winner.error;
    return {winner:winner.value,other,locks};
  }

  await t.test('concurrent identical requests produce one exact receipt and one mutation',async()=>{
    const charge=await seed('12.34'),payload=record(charge,'23.45');
    const {winner,other,locks}=await settle(payload,payload);
    assert.ok(locks.includes('advisory'),'The request identity lock must block the replay.');
    assert.deepEqual(other,{value:winner});
    const saved=await snapshot(charge);
    assert.deepEqual(saved.state,{amount_due:'100.00',amount_paid:'35.79',legacy_amount_paid:'12.34'});
    assert.deepEqual(saved.entries,[{id:winner.id,amount:'23.45',entry_kind:'payment'}]);
    assert.equal(saved.audits,1);
    assert.deepEqual(saved.receipts,[{request_id:payload.request_id,receipt:winner}]);
  });
  await t.test('distinct simultaneous requests serialize and the latter rejects an overpayment',async()=>{
    const charge=await seed('15.00'),left=record(charge,'60.00'),right=record(charge,'40.00');
    const {winner,other,locks}=await settle(left,right);
    assert.ok(locks.some(type=>type==='transactionid'||type==='tuple'),'The distinct request must wait on the charge row.');
    assert.equal(other.error?.code,'PT409');
    assert.match(other.error?.message??'',/exceeds the charge balance/u);
    const saved=await snapshot(charge);
    assert.deepEqual(saved.state,{amount_due:'100.00',amount_paid:'75.00',legacy_amount_paid:'15.00'});
    assert.deepEqual(saved.entries,[{id:winner.id,amount:'60.00',entry_kind:'payment'}]);
    assert.equal(saved.audits,1);
    assert.deepEqual(saved.receipts,[{request_id:left.request_id,receipt:winner}]);
  });
  await t.test('distinct simultaneous requests within the cap retain both amounts exactly',async()=>{
    const charge=await seed('5.10'),left=record(charge,'10.12'),right=record(charge,'0.03');
    const {winner,other,locks}=await settle(left,right);
    assert.ok(locks.some(type=>type==='transactionid'||type==='tuple'));
    assert.equal(winner.amountPaid,'15.22');
    assert.equal(other.value?.amountPaid,'15.25');
    const saved=await snapshot(charge);
    assert.deepEqual(saved.state,{amount_due:'100.00',amount_paid:'15.25',legacy_amount_paid:'5.10'});
    assert.deepEqual(saved.entries.map(row=>row.amount).sort(),['0.03','10.12']);
    assert.equal(saved.audits,2);
    assert.deepEqual(saved.receipts.map(row=>row.request_id).sort(),[left.request_id,right.request_id].sort());
  });
});
