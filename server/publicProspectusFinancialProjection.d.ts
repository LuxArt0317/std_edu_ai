export interface FinancialSourcePage {locator:string;text:string}
export interface FinancialProjection {
 currency:string;
 provenance:{feeLocator:string;rightsLocator:string;yearLabels:string;sourceScope:string};
 firstSemester:{tuition:number;award:number;reducedTuition:number;accommodation:number;otherExpenses:number;publishedSubtotal:number;sourceRow:string;arithmeticChecks:Array<{operation:string;operands:number[];result:number;published:number;discrepancy:number}>};
 laterSemesterConditionalTuition:Array<{averageMinimum?:number;classTopPercent?:number;allSubjectMinimum?:number;award:number;sourceText:string;tuitionBeforeAward:number;operation:string;netTuition:number}>;
 dormitorySubsidy:{maximum:number;timing:string;sourceText:string;condition:string};
 limits:string[];
}
export function extractProspectusFinancialProjection(pages:FinancialSourcePage[]):FinancialProjection;
export function publicProspectusFinancialProjection():FinancialProjection;
