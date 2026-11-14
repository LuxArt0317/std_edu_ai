import type {ServiceNoteLookup} from './serviceNoteIntent.js';
export const SAVED_SERVICE_ANSWER_LIMIT:number;
export function answerSavedServiceRecords(question:string,snapshot:Record<string,any>,route?:string,history?:Array<{role:string;content:string}>,context?:{serviceNoteScope?:ServiceNoteLookup;selectedEvidence?:{records:Array<Record<string,any>>;selection:Record<string,any>};unavailable?:boolean;excerpted?:boolean}):null|{
  status:'answered';answer:string;citations:Array<{chunkId:string;claim:string;title:string;sourceName:string;url:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:'account';checkedAt:string;webSearched:false};
};
