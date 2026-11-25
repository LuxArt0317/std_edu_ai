export const dtmAssignmentListRoute:RegExp;
type Reason='foreign'|'excluded'|'operation'|'files'|'grades'|'detail'|'choose'|'combined';
type Target={courseId:string|null;path:string};
export type DtmAssignmentListSelection=Target&({reason:Reason}|{reason:null;mode:'all'|'open'|'done'|'submitted'|'graded';period:string|null;dates:boolean;statuses:boolean;countOnly:boolean});
export function dtmAssignmentListSelection(question:string,route?:string):DtmAssignmentListSelection|null;
export function dtmAssignmentListBoundary(selection:DtmAssignmentListSelection,question:string,signedIn:boolean):{
  status:'handoff'|'clarification';answer:string;citations:Array<{title:string;url:string}>;
  suggestedQuestions:[];grounding:{source:'account'|'directory';webSearched:false};
};
