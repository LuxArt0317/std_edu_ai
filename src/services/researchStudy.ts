export type PublicStudy={code:string;title:string;purpose:string;retentionDays:number;version:number;versionId:string;consentText:string;taskCount:number;instruments:string[]};
export type StudyTask={id:string;key:string;domain:string;promptCurrent:string;promptEnhanced:string;maxSeconds:number;ordinal:number};
export type StudyAttempt={taskId:string;condition:"current_site"|"enhanced_platform";success:string;durationMs:number;seqScore:number|null;createdAt:string};
export type StudyItem={id:string;key:string;ordinal:number;prompt:string;responseType:"likert5"|"likert7"|"text"|"boolean"};
export type StudyQuestionnaire={id:string;instrument:string;version:string;perCondition:boolean;items:StudyItem[]};
export type StudySession={participantCode:string;participantStatus:string;sessionId:string;sessionStatus:string;sequence:"AB"|"BA";study:{code:string;title:string;purpose:string;version:number};tasks:StudyTask[];attempts:StudyAttempt[];questionnaires:StudyQuestionnaire[]};
const headers={"Content-Type":"application/json","X-STU-Research":"1"};
async function payload(response:Response){const value=await response.json().catch(()=>({error:"Invalid research response."}));if(!response.ok)throw new Error(typeof value.error==="string"?value.error:"The research request failed.");return value;}
export async function getPublicStudy(code:string,language:string,signal?:AbortSignal):Promise<PublicStudy>{return payload(await fetch(`/api/research-session?study=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}`,{signal})) as Promise<PublicStudy>;}
export async function getStudySession(language:string,signal?:AbortSignal):Promise<StudySession>{return payload(await fetch(`/api/research-session?language=${encodeURIComponent(language)}`,{signal})) as Promise<StudySession>;}
async function action(input:Record<string,unknown>){return payload(await fetch("/api/research-session",{method:"POST",headers,body:JSON.stringify(input)}));}
export async function startStudy(input:{studyCode:string;studyVersionId:string;populationRole:string;familiarityLevel:string;consent:boolean}){return action({action:"start",...input});}
export async function submitAttempt(taskId:string,condition:string,metrics:Record<string,unknown>){return action({action:"attempt",taskId,condition,metrics});}
export async function submitResponse(itemId:string,condition:string|null,numericValue:number|null,textValue:string|null){return action({action:"response",itemId,condition,numericValue,textValue});}
export async function changeStudyStatus(status:"pause"|"resume"|"complete"){return action({action:status});}
export async function withdrawStudy(deleteNow:boolean){return action({action:"withdraw",deleteNow});}
