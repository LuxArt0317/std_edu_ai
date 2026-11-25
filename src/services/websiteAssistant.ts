import {askCampusAssistant,type AssistantProgress,type AssistantResponse} from './researchAssistant';
import {askSchoolAffairsAssistant} from './schoolAffairsAssistant';
import {assistantFetch,type AssistantTransport} from './assistantTransport';
import {sanitizeAssistantPreferences,type AssistantPreferences} from './assistantPreferences.js';

/** The single chat entry point used by both the website and Answer Lab. */
export function askWebsiteAssistant({userId,question,history=[],signal,images=[],route='',onProgress,transport,preferences}: {
 userId?:string|null; question:string;history?:Array<{role:string;content:string}>;signal?:AbortSignal;
 images?:Array<{name:string;dataUrl:string}>;route?:string;onProgress?:(step:AssistantProgress)=>void;transport?:AssistantTransport;preferences?:AssistantPreferences;
}):Promise<AssistantResponse>{
 const ask=(selectedTransport?:AssistantTransport)=>userId
   ? askSchoolAffairsAssistant(userId,question,history,signal,images,route,onProgress,selectedTransport)
   : askCampusAssistant(question,history,signal,images,route,onProgress,selectedTransport);
 if(!preferences)return ask(transport);
 let confirmed:AssistantPreferences|undefined;
 const selected:AssistantTransport={fetch:async(input,init)=>{
  const headers=new Headers(init?.headers);
  headers.set('X-STU-Assistant-Model',preferences.model);headers.set('X-STU-Assistant-Thinking',preferences.thinking);
  const response=await assistantFetch(input,{...init,headers},transport);
  if(response.ok){
   const model=response.headers?.get?.('x-stu-assistant-model'),thinking=response.headers?.get?.('x-stu-assistant-thinking');
   if(preferences.model!=='auto'&&model!==preferences.model||preferences.thinking!=='auto'&&thinking!==preferences.thinking)
    throw Error('The server did not confirm the selected model settings. Please try Auto or reload.');
   confirmed=sanitizeAssistantPreferences({model:model||preferences.model,thinking:thinking||preferences.thinking})||undefined;
  }
  return response;
 }};
 return ask(selected).then(answer=>({...answer,...(confirmed?{modelSettings:confirmed}:{})}));
}
