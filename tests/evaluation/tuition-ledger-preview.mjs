import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const tuitionLedgerFixtureMode='tuition-ledger-student-preview';
export const tuitionLedgerPreviewDates=Object.freeze({from:'2026-09-01',through:'2026-09-30'});
export const tuitionLedgerHistoryPath='/school-affairs/services/39-1/payment-history';
export const tuitionLedgerPreviewQuestion='How much tuition did I pay in September 2026?';

const uuid4=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const newest=(a,b)=>b.paidOn.localeCompare(a.paidOn)||b.id.localeCompare(a.id);
const byId=(a,b)=>a.id.localeCompare(b.id);
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>
  item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort()):item)).digest('hex');

export class TuitionLedgerPreviewAssertion extends Error {
  constructor(stage,failedFields=[]){
    super('Tuition ledger Preview failed at '+stage+'.');
    this.name='TuitionLedgerPreviewAssertion';
    this.stage=stage;
    this.failedFields=failedFields;
  }
}

const need=(condition,stage)=>{if(!condition)throw new TuitionLedgerPreviewAssertion(stage);};

export function tuitionLedgerPlan({runId,owners}){
  need(uuid4(runId)&&Array.isArray(owners)&&owners.length===2
    &&owners.every(owner=>uuid4(owner.userId)&&uuid4(owner.studentId))
    &&new Set([runId,...owners.flatMap(owner=>[owner.userId,owner.studentId])]).size===5,'disposable identities');
  const suffix=runId.replaceAll('-','').slice(0,12);
  const accounts=owners.map(({userId,studentId},index)=>{
    const chargeId=randomUUID();
    const chargeLabel='QA tuition '+(index===0?'A ':'B ')+suffix;
    const entry=(paidOn,amount,reversesPaymentId=null)=>Object.freeze({
      id:randomUUID(),studentId,chargeId,paidOn,amount,
      entryKind:reversesPaymentId===null?'payment':'reversal',reversesPaymentId,currency:'TWD',sourceMode:'local_recorded',
    });
    const first=entry('2026-09-01',index===0?'13.25':'72.36');
    const entries=index===0?[first,entry('2026-09-20','29.80'),entry('2026-09-30','13.25',first.id)]:[first];
    const legacy=index===0?'4.00':'0.00';
    const amountDue='120.00', amountPaid=index===0?'33.80':'72.36';
    return Object.freeze({userId,studentId,chargeId,chargeLabel,legacy,amountDue,amountPaid,entries:Object.freeze(entries)});
  });
  return Object.freeze({runId,accounts:Object.freeze(accounts)});
}

export async function assertTuitionLedgerOwners(sql,plan){
  const userIds=plan.accounts.map(account=>account.userId);
  const rows=await sql`select u.id as "userId",s.id as "studentId",p.role,
    u.raw_user_meta_data->>'assistant_evaluation_run' as "runId",
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as "google"
    from auth.users u join public.affairs_profiles p on p.user_id=u.id join public.affairs_students s on s.user_id=u.id
    where u.id in ${sql(userIds)} limit 3`;
  need(rows.length===2&&plan.accounts.every(account=>rows.some(row=>row.userId===account.userId
    &&row.studentId===account.studentId&&row.runId===plan.runId&&row.role==='student'&&row.google===true)),'independent disposable owner binding');
}

export async function readTuitionLedgerPreviewState(sql,plan){
  const chargeIds=plan.accounts.map(account=>account.chargeId);
  const eventIds=plan.accounts.flatMap(account=>account.entries.map(entry=>entry.id));
  const charges=await sql`select id,student_id as "studentId",label,category,amount_due::text as "amountDue",
    amount_paid::text as "amountPaid",legacy_amount_paid::text as "legacy",currency,source_mode as "sourceMode",
    due_on::text as "dueOn",occurrence_on::text as "occurrenceOn",contact_unit as "contactUnit",
    contact_extension as "contactExtension",payment_unit as "paymentUnit"
    from public.affairs_charges where id in ${sql(chargeIds)} order by id`;
  const entries=await sql`select id,student_id as "studentId",charge_id as "chargeId",entry_kind as "entryKind",
    to_char(paid_on,'YYYY-MM-DD') as "paidOn",amount::text,currency,source_mode as "sourceMode",reverses_payment_id as "reversesPaymentId"
    from public.affairs_charge_payment_entries where charge_id in ${sql(chargeIds)} or id in ${sql(eventIds)} order by id limit 7`;
  const audits=await sql`select id from public.affairs_agent_audit where target_id in ${sql(eventIds)} limit 1`;
  const receipts=await sql`select request_id from private.affairs_charge_payment_operations
    where payload->>'charge_id' in ${sql(chargeIds)} or receipt->>'id' in ${sql(eventIds)} limit 1`;
  return {charges:[...charges],entries:[...entries],audits:[...audits],receipts:[...receipts]};
}

export async function readTuitionLedgerAccountScopes(sql,plan){
  const studentIds=plan.accounts.map(account=>account.studentId);
  const {from,through}=tuitionLedgerPreviewDates;
  const rows=await sql`select s.id as "studentId",exists(select 1 from public.affairs_charges c
      where c.student_id=s.id and coalesce(c.legacy_amount_paid,c.amount_paid)>0) as "hasUndatedPaidAmount",
    (select count(*)::integer from public.affairs_charge_payment_entries e
      where e.student_id=s.id and e.paid_on between ${from}::date and ${through}::date) as "total"
    from public.affairs_students s where s.id in ${sql(studentIds)} order by s.id`;
  return [...rows];
}

export const isEmptyTuitionLedgerPreviewState=state=>Object.values(state).every(rows=>rows.length===0);

function expectedState(plan){
  return {
    charges:plan.accounts.map(a=>({id:a.chargeId,studentId:a.studentId,label:a.chargeLabel,category:'Tuition',
      amountDue:a.amountDue,amountPaid:a.amountPaid,legacy:a.legacy,currency:'TWD',sourceMode:'sample',
      dueOn:null,occurrenceOn:null,contactUnit:null,contactExtension:null,paymentUnit:null})).sort(byId),
    entries:plan.accounts.flatMap(a=>a.entries).sort(byId),audits:[],receipts:[],
  };
}

// Call inside the existing reserved connection transaction after journaling the plan.
export async function seedTuitionLedgerPreviewState(sql,plan){
  await assertTuitionLedgerOwners(sql,plan);
  need(isEmptyTuitionLedgerPreviewState(await readTuitionLedgerPreviewState(sql,plan)),'empty reserved ledger');
  for(const account of plan.accounts){
    const {chargeId,studentId,chargeLabel,amountDue,legacy,amountPaid,entries}=account;
    await sql`insert into public.affairs_charges (id,student_id,label,category,amount_due,amount_paid,currency,source_mode)
      values (${chargeId},${studentId},${chargeLabel},'Tuition',${amountDue},${legacy},'TWD','sample')`;
    for(const row of entries){
      await sql`insert into public.affairs_charge_payment_entries
        (id,charge_id,student_id,entry_kind,paid_on,amount,currency,source_mode,reverses_payment_id)
        values(${row.id},${chargeId},${studentId},${row.entryKind},${row.paidOn},${row.amount},${row.currency},${row.sourceMode},${row.reversesPaymentId})`;
    }
    await sql`update public.affairs_charges set legacy_amount_paid=${legacy},amount_paid=${amountPaid}
      where id=${chargeId} and student_id=${studentId}`;
  }
  need(isDeepStrictEqual(await readTuitionLedgerPreviewState(sql,plan),expectedState(plan)),'exact seeded ledger');
}

export async function deleteTuitionLedgerPreviewState(sql,plan){
  const before=await readTuitionLedgerPreviewState(sql,plan);
  if(isEmptyTuitionLedgerPreviewState(before))return;
  await assertTuitionLedgerOwners(sql,plan);
  need(isDeepStrictEqual(before,expectedState(plan)),'cleanup ownership and full fingerprint');
  for(const account of plan.accounts){
    const {chargeId,studentId}=account;
    // The original entry remains referenced until its reversal is removed.
    for(const row of [...account.entries].reverse()){
      const removed=await sql`delete from public.affairs_charge_payment_entries
        where id=${row.id} and charge_id=${chargeId} and student_id=${studentId} returning id`;
      need(removed.length===1&&removed[0].id===row.id,'exact ledger event removal');
    }
    const removed=await sql`delete from public.affairs_charges where id=${chargeId} and student_id=${studentId}
      and label=${account.chargeLabel} and source_mode='sample' returning id`;
    need(removed.length===1&&removed[0].id===chargeId,'exact charge removal');
  }
  need(isEmptyTuitionLedgerPreviewState(await readTuitionLedgerPreviewState(sql,plan)),'ledger cleanup readback');
}

function expectedHistory(account,foreign){
  const rows=foreign?[]:[...account.entries].sort(newest).map(({studentId:_studentId,...row})=>
    ({...row,chargeLabel:account.chargeLabel,chargeCategory:'Tuition'}));
  return {userId:account.userId,studentRecordFound:true,rows,total:rows.length,hasUndatedPaidAmount:!foreign&&account.legacy!=='0.00'};
}

export async function checkTuitionLedgerPreview({plan,observe,observeAccountScopes,history,ask}){
  const baseline=await observe();
  need(isDeepStrictEqual(baseline,expectedState(plan)),'independent ledger baseline');
  const accountScopes=await observeAccountScopes();
  const scopesByStudent=new Map(accountScopes.map(scope=>[scope.studentId,scope]));
  need(accountScopes.length===plan.accounts.length&&plan.accounts.every(account=>{
    const scope=scopesByStudent.get(account.studentId);
    return typeof scope?.hasUndatedPaidAmount==='boolean'&&scope.total===account.entries.length;
  }),'exact unfiltered account scope and independent dated rows');
  const [a,b]=plan.accounts;
  const sides=[['A',a,b,'43.05','13.25','29.80'],['B',b,a,'72.36','0.00','72.36']];
  const expectedUrl=tuitionLedgerHistoryPath+'?'+new URLSearchParams(tuitionLedgerPreviewDates);
  const correlationIds=[];
  for(const [side,account,foreign,gross,reversed,net] of sides){
    const own=await history(side,account.chargeId);
    const crossed=await history(side,foreign.chargeId);
    need(own.status===200&&isDeepStrictEqual(own.body,expectedHistory(account,false)),side+' own ledger HTTP');
    need(crossed.status===200&&isDeepStrictEqual(crossed.body,expectedHistory(account,true)),side+' foreign charge HTTP');
    const reply=await ask(side,tuitionLedgerPreviewQuestion);
    const {body,status,correlationId}=reply;
    const answer=typeof body?.answer==='string'?body.answer:'';
    const checks={
      httpStatus:status===200,
      requestCorrelation:uuid4(correlationId)&&!correlationIds.includes(correlationId),
      resultStatus:body?.status==='answered',
      verified:body?.verification?.status==='verified',
      verificationAttempts:Number.isInteger(body?.verification?.attempts)&&body.verification.attempts>=1,
      privateGrounding:body?.grounding?.webSearched===false,
      exactCitation:Array.isArray(body?.citations)&&body.citations.some(cite=>cite?.chunkId==='account:paymentHistory'&&cite.url===expectedUrl),
      grossAmount:answer.includes('Recorded payments: TWD '+gross),
      reversalAndNet:reversed==='0.00'?!answer.includes('Reversals:'):answer.includes('Reversals: TWD '+reversed+' · Net recorded change: TWD '+net),
      chargeLabel:answer.includes(account.chargeLabel),
      undatedBalanceDisclosure:answer.includes('Some saved paid amounts have no payment date')===scopesByStudent.get(account.studentId).hasUndatedPaidAmount,
    };
    const failedFields=Object.keys(checks).filter(field=>!checks[field]);
    if(failedFields.length)throw new TuitionLedgerPreviewAssertion(side+' monthly assistant grounding',failedFields);
    need(![foreign.chargeLabel,foreign.userId,foreign.studentId,foreign.chargeId,...foreign.entries.map(row=>row.id),
      account.userId,account.studentId,account.chargeId,...account.entries.map(row=>row.id)]
      .some(value=>JSON.stringify(body).includes(value)),side+' assistant data boundary');
    correlationIds.push(correlationId);
  }
  const guest=await ask('guest',tuitionLedgerPreviewQuestion);
  need(guest.status===401&&!guest.body?.answer,'anonymous assistant denial');
  need(isDeepStrictEqual(await observe(),baseline),'student reads left ledger, audits and receipts unchanged');
  need(isDeepStrictEqual(await observeAccountScopes(),accountScopes),'student reads left account scope unchanged');
  return {passed:true,ownHistoryReads:2,crossedHistoryReads:2,verifiedMonthlyAnswers:2,anonymousDenial:true,
    readbackDigest:digest({baseline,accountScopes}),staffHttpVerified:false};
}
