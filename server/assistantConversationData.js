import {boundedAssistantActivity,boundedAssistantText,boundedConversationMessages} from '../src/services/assistantActivityBudget.js';

const text=boundedAssistantText;
const url=value=>typeof value==='string'&&/^(?:https?:\/\/|\/(?!\/))/.test(value)?text(value,2000):'';
function activity(value){return boundedAssistantActivity([],value);}
function result(value){
  if(!value||!['answered','clarification','abstained','handoff'].includes(value.status)||typeof value.answer!=='string')return undefined;
  return {answer:text(value.answer,8000),status:value.status,
    citations:Array.isArray(value.citations)?value.citations.slice(0,12).filter(row=>row&&url(row.url)).map(row=>({chunkId:text(row.chunkId,200),claim:text(row.claim,300),title:text(row.title,200),sourceName:text(row.sourceName,160),url:url(row.url),locator:text(row.locator,500)||null,effectiveAt:text(row.effectiveAt,50)||null,reviewedAt:text(row.reviewedAt,50)||null})):[],
    suggestedQuestions:Array.isArray(value.suggestedQuestions)?value.suggestedQuestions.slice(0,3).map(item=>text(item,180)):[],activity:activity(value.activity),
    ...(value.grounding?{grounding:{source:text(value.grounding.source,80),checkedAt:text(value.grounding.checkedAt,50),webSearched:value.grounding.webSearched===true,degraded:value.grounding.degraded===true}}:{}),
    ...(value.verification&&['verified','unverified'].includes(value.verification.status)?{verification:{status:value.verification.status,attempts:Math.max(0,Math.min(3,Number(value.verification.attempts)||0))}}:{}),
    ...(Array.isArray(value.views)?{views:value.views.slice(0,3).filter(view=>view&&/^\/(?!\/)/.test(view.url)&&Array.isArray(view.columns)&&Array.isArray(view.rows)).map(view=>({id:text(view.id,60),title:text(view.title,100),url:url(view.url),columns:view.columns.slice(0,5).map(item=>text(item,100)),rows:view.rows.slice(0,12).filter(Array.isArray).map(row=>row.slice(0,5).map(item=>text(item,200))),total:Math.max(0,Number(view.total)||0),checkedAt:text(view.checkedAt,60),note:text(view.note,400)}))}:{}),
  };
}
/** A server-side allowlist; never persist execution payloads or image bytes. */
export function sanitizeStoredConversation(messages){
  return Array.isArray(messages)?boundedConversationMessages(messages.filter(message=>message&&['user','assistant'].includes(message.role)&&typeof message.id==='string'&&typeof message.content==='string').map(message=>({
    id:text(message.id,100),role:message.role,content:text(message.content,8000),
    ...(message.role==='assistant'?{phase:['working','complete','error'].includes(message.phase)?message.phase:'complete',activity:activity(message.activity),result:result(message.result),actionExpired:message.actionExpired===true||Boolean(message.result?.proposedAction)}:{}),
    ...(message.role==='user'&&Array.isArray(message.images)?{images:message.images.slice(0,2).map(image=>({name:text(image?.name,120)}))}:{}),
  }))):[];
}
