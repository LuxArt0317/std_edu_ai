export type ElearningOutlineSelection={courseId:number|null;activityId:number|null;sectionPosition:number|null;
  sectionTitle:string|null;activityTitle:string|null;purposes:Array<'video'|'slides'|'feedback'|'attendance'>;
  from:'question'|'route'|'history'|'none';reason:'invalid_route'|'foreign_request'|'invalid_selector'|'ambiguous_selector'|'choose_course'|null};
export function selectElearningOutlineEvidence(question?:string,route?:string,history?:Array<{role:string;content:string}>):ElearningOutlineSelection|null;
export function isElearningOutlineEvidenceQuestion(question?:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
