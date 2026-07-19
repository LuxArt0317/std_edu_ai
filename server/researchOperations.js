import { createHash } from "node:crypto";

const components = new Set(["public_shell","retrieval","model","citation","campus_route","study","ingestion","evaluation"]);
const outcomes = new Set(["success","failure","degraded","denied"]);
const metadataKeys = new Set(["retrieval_count","citation_count","attempt","max_attempts","status_family","cache_hit","fallback_used","result_count"]);

export function operationalCorrelation(value, salt = "stu-research-operations") {
  return createHash("sha256").update(`${salt}:${String(value)}`).digest("hex");
}
export function safeOperationalCode(value, fallback = "UNCLASSIFIED_FAILURE") {
  const code=String(value||fallback).toUpperCase().replace(/[^A-Z0-9_]/g,"_").replace(/_+/g,"_").slice(0,64);
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(code)?code:fallback;
}
export function safeOperationalMetadata(value={}) {
  if(!value||typeof value!=="object"||Array.isArray(value))return{};
  return Object.fromEntries(Object.entries(value).filter(([key,item])=>metadataKeys.has(key)&&(item===null||typeof item==="boolean"||(typeof item==="number"&&Number.isFinite(item)))).slice(0,8));
}
export async function recordResearchOperation(input) {
  const url=input.url?.replace(/\/$/,"");
  if(!url||!input.key||!components.has(input.component)||!outcomes.has(input.outcome))return false;
  try {
    const response=await fetch(`${url}/rest/v1/rpc/record_research_operational_event`,{
      method:"POST",
      headers:{apikey:input.key,Authorization:`Bearer ${input.key}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        p_component:input.component,p_operation:input.operation,p_outcome:input.outcome,
        p_error_code:input.errorCode?safeOperationalCode(input.errorCode):null,
        p_http_status:input.httpStatus??null,p_latency_ms:Math.max(0,Math.min(120000,Math.round(input.latencyMs||0))),
        p_item_count:input.itemCount??null,p_correlation_hash:input.correlationHash,
        p_metadata:safeOperationalMetadata(input.metadata),p_fixture_marker:null,
      }),signal:AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch { return false; }
}
