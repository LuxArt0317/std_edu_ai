import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const billingFields='id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit';
function target(table,query){
  const url=new URL('/rest/v1/'+table,origin);
  url.search=new URLSearchParams(query).toString();
  return url;
}

export async function observeVenueBilling(sql,plan,{users,publishable,fetchImpl,readResponse,signal}){
  const {student}=plan.billing;
  const [own,peer]=users;
  check(own.id===student.user_id&&peer.id===plan.owners.B.id,'wrong fixture caller');
  const rows=await sql`select id,student_id,label,amount_due::int,amount_paid::int,currency,due_on::text,source_mode,occurrence_on::text,
    category,contact_unit,contact_extension,payment_unit from public.affairs_charges where student_id=${student.id} order by id limit 2`;
  const [charge]=rows;
  check(rows.length===1&&charge.student_id===student.id&&charge.label==='Sample Fall 2026 tuition'
    &&charge.amount_due===28000&&charge.amount_paid===5000&&charge.currency==='TWD'&&charge.source_mode==='sample','wrong fixture caller');
  const studentUrl=target('affairs_students',{select:'id,user_id',user_id:'eq.'+own.id,limit:'1'});
  const chargeUrl=target('affairs_charges',{select:billingFields,student_id:'eq.'+student.id,
    order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0'});
  const read=async (url,user)=>readResponse(await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',signal,
    headers:{apikey:publishable,Authorization:'Bearer '+user.token}}),url,16384);
  const [ownStudent,ownCharges,crossedStudent,crossedCharges]=await Promise.all([
    read(studentUrl,own),read(chargeUrl,own),read(studentUrl,peer),read(chargeUrl,peer),
  ]);
  check(isDeepStrictEqual(ownStudent,[{id:student.id,user_id:student.user_id}])&&isDeepStrictEqual(ownCharges,[{...charge}])
    &&isDeepStrictEqual(crossedStudent,[])&&isDeepStrictEqual(crossedCharges,[]),'wrong fixture caller');
  const readDigests=[[studentUrl,ownStudent],[chargeUrl,ownCharges]].map(([url,rows])=>digest({method:'GET',url:url.href,ownerId:own.id,rows}));
  const {id,label,amount_due:amountDue,amount_paid:amountPaid,currency,source_mode:sourceMode}=charge;
  return {proof:{readDigests,rowsDigest:digest([{id,label,amountDue,amountPaid,currency,sourceMode}])},
    label,amountDue,amountPaid,remaining:amountDue-amountPaid,currency,chargeId:id};
}
