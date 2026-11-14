import {createHash,timingSafeEqual} from 'node:crypto';
import {schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';

const address=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const fromPattern=/^[^\r\n<>]{1,80} <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/u;
const hash=value=>createHash('sha256').update(value).digest('hex');
const matches=(provided,secret)=>typeof provided==='string'&&provided.length<=512&&
  typeof secret==='string'&&secret.length>=32&&secret.length<=256&&
  timingSafeEqual(Buffer.from(hash(provided),'hex'),Buffer.from(hash('Bearer '+secret),'hex'));

function deliveryConfiguration(env){
  const from=env.ANNOUNCEMENT_EMAIL_FROM,mailKey=env.ANNOUNCEMENT_EMAIL_RESEND_KEY;
  const dbKey=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const secret=env.CRON_SECRET;
  if(!from||(!address.test(from)&&!fromPattern.test(from))||from.length>254||!mailKey||!dbKey||
    typeof secret!=='string'||secret.length<32||secret.length>256)return null;
  return {from,mailKey,dbKey};
}
export function announcementDeliveryConfigured(env=process.env){return Boolean(deliveryConfiguration(env));}

export function createAnnouncementEmailDelivery({fetchRequest=fetch,env=process.env,database=schoolAffairsDatabaseConfiguration}={}){
  return async function deliver(request,response){
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.setHeader('X-Content-Type-Options','nosniff');
    if(request.method!=='GET'){
      response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed.'});return;
    }
    if(!matches(request.headers.authorization,env.CRON_SECRET)){
      response.status(401).json({error:'Delivery authorization required.'});return;
    }
    if(Object.keys(request.query??{}).length!==1||request.query?.resource!=='announcement-email-delivery'){
      response.status(400).json({error:'Invalid delivery request.'});return;
    }
    const config=deliveryConfiguration(env);
    if(!config){
      response.status(503).json({error:'Announcement delivery is not configured.'});return;
    }
    const {from,mailKey,dbKey}=config;
    const stats={claimed:0,accepted:0,retried:0,failed:0};
    try{
      const {url}=database();
      const rpc=async (name,body)=>{
        const result=await fetchRequest(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',
          signal:AbortSignal.timeout(4000),headers:{apikey:dbKey,...(dbKey.startsWith('eyJ')?{Authorization:'Bearer '+dbKey}:{}),
            'Content-Type':'application/json'},body:JSON.stringify(body)});
        if(!result.ok){
          void result.body?.cancel().catch(()=>{});
          throw new Error('Announcement queue unavailable.');
        }
        return readFeeRemissionJson(result);
      };
      const envelope=hash(JSON.stringify(['resend:v1',from]));
      const deadline=Date.now()+45000;
      while(stats.claimed<20&&Date.now()+13000<deadline){
        const item=await rpc('affairs_claim_announcement_email',{p_envelope_digest:envelope});
        if(item===null)break;
        if(!item||!feeRemissionUuid(item.id)||!feeRemissionUuid(item.lease)||
          typeof item.to!=='string'||item.to.length>254||!address.test(item.to)||
          typeof item.title!=='string'||item.title.length>320||typeof item.body!=='string'||item.body.length>4000)
          throw new Error('Invalid announcement delivery.');
        stats.claimed++;
        const {status,providerId}=await sendAnnouncement(fetchRequest,{item,from,mailKey});
        const finished=await rpc('affairs_finish_announcement_email',{
          p_id:item.id,p_lease:item.lease,p_result:status,p_provider_id:providerId,
        });
        if(finished!==true)throw new Error('Announcement delivery lease expired.');
        stats[status==='retry'?'retried':status]++;
        if(status!=='accepted')break;
      }
      response.status(stats.retried||stats.failed?503:200).json(stats);
    }catch{
      response.status(503).json({error:'Announcement delivery could not be completed.',...stats});
    }
  };
}

async function sendAnnouncement(fetchRequest,{item,from,mailKey}){
  let status='retry',providerId=null;
  try{
    const result=await fetchRequest('https://api.resend.com/emails',{method:'POST',redirect:'error',
      signal:AbortSignal.timeout(4000),headers:{Authorization:'Bearer '+mailKey,'Content-Type':'application/json',
        'Idempotency-Key':'stu-announcement/'+item.id},
      body:JSON.stringify({from,to:[item.to],subject:item.title.replace(/[\r\n]+/gu,' '),text:item.body})});
    if(result.ok){
      const payload=await readFeeRemissionJson(result);
      if(typeof payload?.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/u.test(payload.id)){
        status='accepted';providerId=payload.id;
      }
    }else{
      void result.body?.cancel().catch(()=>{});
      if([400,413,422].includes(result.status))status='failed';
    }
  }catch{/* The database lease and provider idempotency key allow the same attempt to be retried. */}
  return {status,providerId};
}
export const deliverAnnouncementEmail=createAnnouncementEmailDelivery();
