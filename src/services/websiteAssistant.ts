import {askCampusAssistant,type AssistantProgress,type AssistantResponse} from './researchAssistant';
import {askSchoolAffairsAssistant} from './schoolAffairsAssistant';
import type {AssistantTransport} from './assistantTransport';

/** The single chat entry point used by both the website and Answer Lab. */
export function askWebsiteAssistant({userId,question,history=[],signal,images=[],route='',onProgress,transport}: {
 userId?:string|null; question:string;history?:Array<{role:string;content:string}>;signal?:AbortSignal;
 images?:Array<{name:string;dataUrl:string}>;route?:string;onProgress?:(step:AssistantProgress)=>void;transport?:AssistantTransport;
}):Promise<AssistantResponse>{
 return userId
   ? askSchoolAffairsAssistant(userId,question,history,signal,images,route,onProgress,transport)
   : askCampusAssistant(question,history,signal,images,route,onProgress,transport);
}
