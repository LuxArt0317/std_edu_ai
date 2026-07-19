function unique(values){return [...new Set(values)]}
export function retrievalMetrics({expected=[],retrieved=[],k=5}){
  if(!Number.isInteger(k)||k<1)throw new Error("k must be a positive integer");
  const relevant=new Set(unique(expected)),ranked=unique(retrieved).slice(0,k);
  const positions=ranked.flatMap((id,index)=>relevant.has(id)?[index+1]:[]);
  const hits=positions.length,actual=ranked.length;
  const dcg=positions.reduce((sum,position)=>sum+1/Math.log2(position+1),0);
  const ideal=Math.min(relevant.size,k);
  const idcg=Array.from({length:ideal},(_,index)=>1/Math.log2(index+2)).reduce((a,b)=>a+b,0);
  return {recallAtK:relevant.size?hits/relevant.size:actual===0?1:0,precisionAtK:actual?hits/actual:relevant.size===0?1:0,reciprocalRank:positions.length?1/positions[0]:0,ndcg:idcg?dcg/idcg:relevant.size===0&&actual===0?1:0};
}
export function citationMetrics({expected=[],cited=[]}){
  const relevant=new Set(unique(expected)),citations=unique(cited),supported=citations.filter((id)=>relevant.has(id)).length;
  return {supported,total:citations.length,precision:citations.length?supported/citations.length:relevant.size===0?1:0,completeness:relevant.size?supported/relevant.size:1};
}
export function percentile(values,p){if(!values.length)return 0;if(p<0||p>1)throw new Error("percentile must be between zero and one");const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];}
export function summarizeEvaluation(results){
  if(!results.length)throw new Error("At least one result is required");
  const mean=(values)=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const retrieval=results.filter((item)=>item.expectedEvidenceCount>0),materialClaims=results.reduce((sum,item)=>sum+item.materialClaims,0);
  return {caseCount:results.length,recallAt5:mean(retrieval.map((item)=>item.recallAtK)),mrr:mean(retrieval.map((item)=>item.reciprocalRank)),ndcg:mean(retrieval.map((item)=>item.ndcg)),citationPrecision:mean(results.map((item)=>item.citationPrecision)),citationCompleteness:mean(results.map((item)=>item.citationCompleteness)),supportedCorrectness:mean(results.map((item)=>item.supportedCorrectness)),unsupportedClaimRate:materialClaims?results.reduce((sum,item)=>sum+item.unsupportedClaims,0)/materialClaims:0,abstentionAccuracy:mean(results.map((item)=>item.abstentionCorrect?1:0)),leakageCount:results.filter((item)=>item.leakage).length,p50LatencyMs:percentile(results.map((item)=>item.latencyMs),.5),p95LatencyMs:percentile(results.map((item)=>item.latencyMs),.95),estimatedCostUsd:results.reduce((sum,item)=>sum+item.costUsd,0)};
}
export function passesResearchGates(metrics){return metrics.recallAt5>=.90&&metrics.mrr>=.80&&metrics.citationPrecision>=.95&&metrics.citationCompleteness>=.90&&metrics.supportedCorrectness>=.90&&metrics.unsupportedClaimRate<=.02&&metrics.abstentionAccuracy>=.90&&metrics.leakageCount===0;}

