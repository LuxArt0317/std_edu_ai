export type FeedbackStudentScope='survey'|'immediate';
export type FeedbackScope=FeedbackStudentScope|'manage';
export type SurveyPhase='midterm'|'final';
export type FeedbackCourse={id:string;course:string;code:string;term:string;section:string};
export type SurveyCourse=FeedbackCourse & {completed:boolean};
export type TeachingSurvey={id:string;termId:string;term:string;phase:SurveyPhase;questions:string[];opensAt:string;closesAt:string;
  version:number;released:boolean;state:'scheduled'|'open'|'closed';courses:SurveyCourse[]};
export type FeedbackRecord={id:string;sectionId:string;course:string;code:string;term:string;comment:string;status:'submitted'|'reviewed';submittedAt:string;reviewedAt:string|null};
export type TeachingFeedbackData={userId:string;courses:FeedbackCourse[];surveys:TeachingSurvey[];feedback:FeedbackRecord[];
  terms:{id:string;label:string}[];results:{surveyId:string;sectionId:string;course:string;code:string;section:string;count:number;averages:number[];comments:string[]}[]};
export type FeedbackAction=
  |{kind:'submit_teaching_survey';payload:{survey_id:string;section_id:string;request_id:string;version:number;ratings:number[];comment:string}}
  |{kind:'submit_teaching_feedback';payload:{section_id:string;request_id:string;comment:string}}
  |{kind:'save_teaching_survey';payload:{term_id:string;phase:SurveyPhase;expected_version:number;opens_at:string;closes_at:string;questions:string[]}}
  |{kind:'release_teaching_survey';payload:{survey_id:string;expected_version:number;confirm_release:true;grades_published:boolean}}
  |{kind:'review_teaching_feedback';payload:{feedback_id:string}};
export const teachingFeedbackPaths:Record<FeedbackStudentScope,string>;
export const teachingFeedbackScopes:readonly FeedbackScope[];
export const teachingFeedbackStudentActions:readonly string[];
export const teachingFeedbackManagerActions:readonly string[];
export const teachingFeedbackMaxBytes:number;
export function validTeachingFeedbackAction(kind:unknown,payload:unknown):boolean;
export function parseTeachingFeedback(value:unknown,userId:string,scope:FeedbackScope):TeachingFeedbackData;
export function parseTeachingFeedbackReceipt(value:unknown,kind:string,payload:FeedbackAction['payload']):unknown;
export function teachingFeedbackQuestion(question:string):FeedbackStudentScope|null;
