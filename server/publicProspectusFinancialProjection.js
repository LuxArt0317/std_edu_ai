import document from './data/ipiac115.json' with {type:'json'};

const amount=value=>Number(value.replaceAll(',',''));
/** Parse only uniquely identified source sections; fail closed when their layout changes. */
export function extractProspectusFinancialProjection(pages){
 const unique=(locator,pattern)=>{const matches=pages.filter(page=>page.locator===locator&&pattern.test(page.text));if(matches.length!==1)throw new Error(`Financial source boundary missing or ambiguous: ${locator}`);return matches[0];};
 const annex=unique('pdf:page:29',/Annex A[\s\S]*Semester 1/u);
 const rights=unique('pdf:page:31',/Notice of Rights and Obligations/u);
 const rows=[...annex.text.matchAll(/第一學期\s*Semester 1\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+〔\s*notes 5\s*〕\s+([\d,]+)\s+([\d,]+)\s+第二學期/gu)];
 if(rows.length!==1)throw new Error('First-semester fee row missing or ambiguous');
 const [tuition,award,reducedTuition,accommodation,otherExpenses,publishedSubtotal]=rows[0].slice(1).map(amount);
 if(tuition-award!==reducedTuition)throw new Error('First-semester reduction contradicts its source operands');
 const tierPatterns=[/average score of\s+(\d+)\s+or above and ranking within the top\s+(\d+)%\s+of the class:\s*NTD\s*([\d,]+)\s+per semester/gu,/pass all subjects score of\s+(\d+)\s+or above:\s*NTD\s*([\d,]+)\s+per semester/gu];
 const ranked=[...annex.text.matchAll(tierPatterns[0])];const passing=[...annex.text.matchAll(tierPatterns[1])];
 if(ranked.length!==2||passing.length!==1)throw new Error('Scholarship tier source missing or ambiguous');
 const tiers=[...ranked.map(match=>({averageMinimum:Number(match[1]),classTopPercent:Number(match[2]),award:amount(match[3]),sourceText:match[0]})),...passing.map(match=>({allSubjectMinimum:Number(match[1]),award:amount(match[2]),sourceText:match[0]}))];
 const subsidies=[...rights.text.matchAll(/dormitory subsidy of up to NTD\s*([\d,]+)\s*\(disbursed in the following semester\)/gu)];
 if(subsidies.length!==1)throw new Error('Dormitory subsidy timing source missing or ambiguous');
 const subtotal=tuition+accommodation+otherExpenses;
 return {currency:'TWD',provenance:{feeLocator:annex.locator,rightsLocator:rights.locator,yearLabels:annex.text.slice(0,annex.text.indexOf('項目 Item')),sourceScope:document.scope},
 firstSemester:{tuition,award,reducedTuition,accommodation,otherExpenses,publishedSubtotal,sourceRow:rows[0][0],
 arithmeticChecks:[{operation:'tuition + accommodation + other expenses',operands:[tuition,accommodation,otherExpenses],result:subtotal,published:publishedSubtotal,discrepancy:publishedSubtotal-subtotal},{operation:'reduced tuition + accommodation + other expenses',operands:[reducedTuition,accommodation,otherExpenses],result:reducedTuition+accommodation+otherExpenses,published:publishedSubtotal,discrepancy:publishedSubtotal-(reducedTuition+accommodation+otherExpenses)}]},
 laterSemesterConditionalTuition:tiers.map(tier=>({...tier,tuitionBeforeAward:tuition,operation:'tuition before award - one applicable award',netTuition:tuition-tier.award})),
 dormitorySubsidy:{maximum:amount(subsidies[0][1]),timing:'following semester',sourceText:subsidies[0][0],condition:'on-campus accommodation throughout the semester'},
 limits:['Conditional calculations only, not a personal bill, confirmed award or posted credit.','Award tiers are alternatives; do not add them together.','Net tuition excludes accommodation and other charges.','Published subtotal includes gross tuition rather than the after-reduction tuition column; preserve both calculations and seek billing clarification.','Do not apply mixed-year draft figures to another cohort or assume subsidy is an immediate deduction.']};
}

export function publicProspectusFinancialProjection(){
 return extractProspectusFinancialProjection(document.pages);
}
