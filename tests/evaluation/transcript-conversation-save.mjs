import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[a-f0-9]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
};
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function verifyTranscriptConversationRow(commitment,rows){
  if(!uuid(commitment?.ownerId)||!uuid(commitment?.conversationId)||typeof commitment.title!=='string'
    ||!Number.isInteger(commitment.expectedVersion)||commitment.expectedVersion<1||commitment.expectedVersion>4
    ||!/^[a-f0-9]{64}$/u.test(commitment.messageDigest??'')||!Array.isArray(rows)||rows.length!==1)
    fail('reconciliation_required');
  const [row]=rows;
  if(row?.id!==commitment.conversationId||row.user_id!==commitment.ownerId||row.title!==commitment.title
    ||row.version!==commitment.expectedVersion||!Array.isArray(row.messages)||row.messages.length!==2*commitment.expectedVersion
    ||digest(row.messages)!==commitment.messageDigest)fail('reconciliation_required');
  return true;
}
export class TranscriptSaveError extends Error {
  constructor(code){super('Saved transcript conversation: '+code);this.name='TranscriptSaveError';this.code=code;}
}
const fail=code=>{throw new TranscriptSaveError(code);};

/**
 * Save one exact transcript transition through the verified caller session.
 * The caller must bind transport to an approved Preview and own the fixture
 * lifecycle. The injected journal must durably retain pending entries before
 * returning. Keep uncertainty for independent DB reconciliation; never replay.
 */
export function createTranscriptConversationSave({transport,ownerId,conversationId,title,journal}={}){
  if(!uuid(ownerId)||!uuid(conversationId)||ownerId===conversationId||typeof title!=='string'
    ||title!==title.trim()||!title||title.length>100||typeof transport?.saveConversation!=='function'
    ||typeof transport?.readConversation!=='function'||typeof journal?.pending!=='function'||typeof journal?.received!=='function')
    fail('invalid_configuration');
  const save=transport.saveConversation.bind(transport),read=transport.readConversation.bind(transport);
  const pending=journal.pending.bind(journal),recordReceipt=journal.received.bind(journal);
  let version=0,prior=[],stopped=false,busy=false,initialized=false;
  const verify=(receipt,operation,messages,expectedVersion)=>{
    const {body}=receipt??{};
    if(receipt?.statusCode!==200||receipt.operation!==operation||receipt.deploymentVerified!==true
      ||body?.id!==conversationId||body.title!==title||body.version!==expectedVersion
      ||!isDeepStrictEqual(body.messages,messages))fail('readback_mismatch');
  };
  return Object.freeze({
    status:()=>Object.freeze({version,persistedMessages:prior.length,stopped,initialized}),
    async append({token,user,assistant}={}){
      if(stopped||busy)fail('invalid_state');
      if(prior.length>=8||user?.role!=='user'||assistant?.role!=='assistant'||assistant.phase!=='complete'
        ||user.id!=='turn-'+(prior.length/2+1)+':user'||assistant.id!=='turn-'+(prior.length/2+1)+':assistant'
        ||typeof user.content!=='string'||!user.content.trim()||typeof assistant.content!=='string'||!assistant.content.trim()
        ||assistant.content!==assistant.result?.answer||assistant.result?.proposedAction)
        fail('invalid_turn');
      const messages=JSON.parse(JSON.stringify(sanitizeStoredConversation([...prior,user,assistant])));
      if(messages.length!==prior.length+2||!isDeepStrictEqual(messages.slice(0,-2),prior)
        ||messages.at(-2)?.content!==user.content||messages.at(-1)?.content!==assistant.content||!messages.at(-1)?.result)
        fail('truncated_turn');
      const expectedVersion=version+1;
      const operation=Object.freeze({ownerId,conversationId,title,expectedVersion,messageDigest:digest(messages)});
      busy=true;
      try{
        if(!initialized){
          const original=await read({token,id:conversationId});
          if(original?.statusCode!==404||original.operation!=='conversation_read'||original.deploymentVerified!==true)fail('conversation_already_exists');
          initialized=true;
        }
        let committed;
        const receipt=await save({token,payload:{id:conversationId,title,version,messages},beforeSend:async commitment=>{
          if(committed||commitment.operation!=='conversation_save'||!/^[a-f0-9]{64}$/u.test(commitment.requestHash)
            ||!Number.isSafeInteger(commitment.requestIndex)||commitment.requestIndex<1||!/^[a-f0-9]{40}$/u.test(commitment.sourceRevision))
            fail('invalid_commitment');
          await pending({...operation,...commitment});
          committed={requestHash:commitment.requestHash,sourceRevision:commitment.sourceRevision};
        }});
        if(!committed||receipt?.requestHash!==committed.requestHash||receipt.sourceRevision!==committed.sourceRevision)fail('invalid_commitment');
        verify(receipt,'conversation_save',messages,expectedVersion);
        const readback=await read({token,id:conversationId});
        verify(readback,'conversation_read',messages,expectedVersion);
        if(receipt.sourceRevision!==readback.sourceRevision)fail('readback_mismatch');
        await recordReceipt({...operation,requestHash:receipt.requestHash,sourceRevision:readback.sourceRevision});
        version=expectedVersion;
        prior=messages;
        return {version,messages:structuredClone(prior),messageDigest:operation.messageDigest};
      } catch(error) {
        stopped=true;
        if(error instanceof TranscriptSaveError)throw error;
        fail('reconciliation_required');
      } finally {busy=false;}
    },
  });
}
