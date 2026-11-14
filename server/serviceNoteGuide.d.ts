import type {ServiceNoteLookup} from './serviceNoteIntent.js';
export function serviceNoteGuide(question:string,scope:ServiceNoteLookup,signedIn:boolean):{
  status:'handoff';answer:string;citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:'account'|'assistant-help';webSearched:false};
};
