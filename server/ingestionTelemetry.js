const TRANSIENT_STATUS=new Set([408,409,425,429,500,502,503,504]);
export function classifyProviderFailure(status,error){
  if(error?.name==="AbortError")return{retryable:true,failureClass:"timeout",failureCode:"PROVIDER_TIMEOUT"};
  if(!Number.isInteger(status))return{retryable:true,failureClass:"network",failureCode:"PROVIDER_NETWORK"};
  if(status===429)return{retryable:true,failureClass:"rate_limit",failureCode:"PROVIDER_RATE_LIMIT"};
  if(status>=500)return{retryable:true,failureClass:"provider_5xx",failureCode:`PROVIDER_${status}`};
  if(TRANSIENT_STATUS.has(status))return{retryable:true,failureClass:"provider_4xx",failureCode:`PROVIDER_${status}`};
  return{retryable:false,failureClass:"provider_4xx",failureCode:`PROVIDER_${status}`};
}
export function retryDelayMs(attempt,random=Math.random){const base=Math.min(8000,500*2**Math.max(0,attempt-1));return Math.round(base*(.8+random()*.4));}
export function estimatedEmbeddingCost(tokens,ratePerMillion){return Number(((Math.max(0,tokens)*Math.max(0,ratePerMillion))/1_000_000).toFixed(6));}
export function safeTelemetryCode(value,fallback="INGESTION_FAILED"){const normalized=String(value||fallback).toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,80);return normalized.length>=2?normalized:fallback;}
