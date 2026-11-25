export type DtmSubmissionTimingSelection={path:string|null;courseId:string|null;assignmentId:string|null;
  zone:'taipei'|'utc'|'both';reason:'foreign'|'operation'|'history'|'choose'|null};
export function selectDtmSubmissionTiming(question:unknown,route?:string,history?:readonly {role:string;content:string}[]):DtmSubmissionTimingSelection|null;
export function dtmSubmissionTimingBoundary(selection:DtmSubmissionTimingSelection,question:string,signedIn?:boolean):{
  status:'clarification'|'handoff';answer:string;citations:{chunkId:string;title:string;url:string}[];suggestedQuestions:[];grounding:{source:'account'|'directory';webSearched:false}
};
