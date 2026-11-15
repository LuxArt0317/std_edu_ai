import type {ServiceNoteLookup} from './serviceNoteIntent.js';

type ServiceNoteReply={
  answer:string;
  citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];
};

export function serviceNoteGuide(question:string,scope:ServiceNoteLookup,signedIn:boolean):
  ServiceNoteReply&{status:'handoff';grounding:{source:'account'|'assistant-help';webSearched:false}};
export function serviceNoteNavigationAnswer(question:string,key:string|null,signedIn:boolean,trackingNotes?:boolean):
  (ServiceNoteReply&{status:'answered';grounding:{source:'directory';webSearched:false}})|null;
