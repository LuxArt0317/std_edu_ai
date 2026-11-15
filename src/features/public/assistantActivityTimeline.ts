import type {AssistantProgress} from '../../services/researchAssistant';

const verificationCheck=/^verification-[1-9]\d*$/u;
const duplicateFinalLabels=new Set(['Answer could not be verified','Verification incomplete']);

/** Presentation only. Persisted and streamed operation records stay intact. */
export function assistantActivityTimeline(steps:readonly AssistantProgress[]){
  const hasStop=steps.some(step=>step.kind==='verification-stop'&&step.status==='unavailable');
  return steps.filter(step=>!(hasStop&&step.kind==='answer'&&step.status==='unavailable'&&duplicateFinalLabels.has(step.label)))
    .map(step=>{
      if(step.status!=='unavailable'||!verificationCheck.test(step.kind)||step.label!=='Answer could not be verified')return step;
      return {...step,label:'Draft did not pass verification',
        detail:step.detail==='The current draft was withheld.'?'This draft was withheld after its evidence check.':step.detail};
    });
}

export function assistantActivityStatus(step:AssistantProgress){
  if(step.status==='running')return 'In progress';
  if(step.status==='complete')return 'Completed';
  if(step.kind==='verification-stop')return 'Stopped';
  if(verificationCheck.test(step.kind))return 'Draft check';
  return 'Unavailable';
}
