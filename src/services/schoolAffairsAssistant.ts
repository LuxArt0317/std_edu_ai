import type { AssistantResponse } from './researchAssistant';
import { affairsClient } from '@/features/public/affairs/authClient';

/** Uses only School Affairs credentials; never imports the Nexus client. */
export async function askSchoolAffairsAssistant(question: string, history: Array<{role:string;content:string}>, signal?: AbortSignal): Promise<AssistantResponse> {
  if (!affairsClient) throw new Error('School Affairs sign-in is not configured.');
  const {data,error} = await affairsClient.auth.getSession();
  if (error || !data.session) throw new Error('Your School Affairs session expired. Please sign in again.');
  const response = await fetch('/api/school-assistant', {
    method:'POST', signal, headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({message:question.trim(),mode:'qa',history:history.slice(-6).map(item=>({role:item.role,content:item.content.slice(0,2000)})),context:{view:'school-affairs'}}),
  });
  const result = await response.json().catch(()=>null);
  if (!response.ok || typeof result?.answer !== 'string') throw new Error('Your account answer could not be loaded. Please try again or sign in again.');
  return {answer:result.answer,status:'answered',citations:result.knowledgeCitations||[],suggestedQuestions:[]};
}
