export type TeachingEvidenceView='survey'|'immediate';
export type TeachingEvidenceSelection={
  readonly views:readonly TeachingEvidenceView[];
  readonly requestedViews:readonly TeachingEvidenceView[];
  readonly from:'question'|'route'|'history';
  readonly question:string;
  readonly commentRequested:boolean;
  readonly unavailableDetails:boolean;
  readonly reason:null|'foreign_request'|'unsupported_operation'|'invalid_route'|'ambiguous_selector'|'outside_scope';
  readonly course?:Readonly<{code?:string;title?:string}>;
};
export type TeachingEvidenceContext={readonly selection:TeachingEvidenceSelection|null;readonly question:string;readonly otherQuestion:string;readonly foreign:boolean;readonly excluded:boolean;readonly navigation:readonly TeachingEvidenceView[]};
export function teachingFeedbackLookupContext(question:unknown,route?:unknown,history?:unknown):TeachingEvidenceContext;
export function selectTeachingFeedbackEvidence(question:unknown,route?:unknown,history?:unknown):TeachingEvidenceSelection|null;
export function exactTeachingFeedbackRead(context:TeachingEvidenceContext):TeachingEvidenceSelection|null;
export function isTeachingFeedbackEvidenceQuestion(question:unknown,route?:unknown,history?:unknown):boolean;
export function teachingFeedbackNavigation(question:unknown):string|null;
export function isTeachingFeedbackScopeQuestion(question:unknown,route?:unknown,history?:unknown):boolean;
export function isTeachingFeedbackFieldClause(clause:unknown):boolean;
export function teachingFeedbackImmediateFields(question:unknown):{courses:boolean;feedback:boolean;completeness:boolean};

export function teachingFeedbackSurveyPresentation(question:unknown):
  {kind:'comparison';code:string}|{kind:'state'|'dates'|'completion';phases:Array<'midterm'|'final'>}|null;
