export type TutorEvaluationEvidenceSelection=Readonly<{
  from:'question'|'route'|'history';
  /** Explicitly requested 1-based questionnaire positions; empty is status/time only. */
  positions:readonly number[];
  commentRequested:boolean;
  /** A separately requested native detail is outside this saved questionnaire contract. */
  unavailableDetails:boolean;
  reason:null|'foreign_request'|'unsupported_operation'|'invalid_route'|'ambiguous_selector'|'outside_scope';
}>;
export function selectTutorEvaluationEvidence(question?:string,route?:string,history?:Array<{role:string;content:string}>):TutorEvaluationEvidenceSelection|null;
export function isTutorEvaluationEvidenceQuestion(question?:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function tutorEvaluationNavigation(question?:string):'/school-affairs/services/28-1'|null;
export function isOwnTutorEvaluationTrackingNoteQuestion(question?:string,route?:string):boolean;
export function isTutorEvaluationFieldClause(clause:string):boolean;
export function withoutExcludedTutorEvaluationClause(question:string):string;
