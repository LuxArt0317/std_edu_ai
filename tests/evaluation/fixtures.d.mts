/** Synthetic fixtures deliberately expose a flexible snapshot, not a production schema. */
export const EVAL_USER_ID:string;
export const EVAL_OTHER_USER_ID:string;
export const DEFAULT_EVAL_NOW:string;
export function evalId(number:number):string;
export const EVAL_IDS:Readonly<Record<'dtmCourse'|'historicalDtmCourse'|'futureDtmCourse'|'meeting'|'nextMeeting'|'assignment'|'submittedAssignment'|'futureAssignment'|'grade'|'material'|'task',string>>;
export type EvaluationFixtureOptions={userId?:string;now?:string};
export type EvaluationDates={today:string;tomorrow:string;nextMonday:string;nextClass:string;weekday:number;termStart:string;termEnd:string;historicalStart:string;historicalEnd:string;futureStart:string;futureEnd:string};
export function evaluationDates(now?:string):EvaluationDates;
export function buildAccountFixture(options?:EvaluationFixtureOptions):Record<string,unknown>;
export const baseSyntheticSnapshot:typeof buildAccountFixture;
export function fixtureForCase(testCase:string|{fixtureKey:string},options?:EvaluationFixtureOptions):Record<string,unknown>;
