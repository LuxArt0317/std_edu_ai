export function gradeCase(testCase:unknown,envelope?:unknown,options?:{independentReview?:unknown}):{
  passed:boolean;
  failures:Array<{id:string;detail:string}>;
};
export function extractAnswerLinks(body?:unknown):string[];
