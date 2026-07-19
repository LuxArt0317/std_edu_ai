import { supabase } from "../utils/supabase";
import type { Tables } from "../types/database.generated";

export type WorkloadWindow = Tables<"administrative_workload_windows">;
export type WorkloadStudy = Pick<Tables<"research_studies">, "id" | "code" | "title" | "status">;
export type WorkloadObservation = {
  category: string;
  inquiries: number;
  duplicates: number;
  confirmedResolved: number;
  escalated: number;
  totalFirstResponseSeconds: number;
  totalHandlingSeconds: number;
  evidenceType: "explicit_user_confirmation" | "staff_verified_resolution" | "ticket_closed_with_confirmation";
};
export type WorkloadReport = {
  status: "incomplete" | "descriptive";
  claimPermitted: false;
  message?: string;
  officeCode?: string;
  officeName?: string;
  comparable?: boolean;
  windowDays?: number;
  suppressionThreshold?: number;
  totals?: Record<string, number>;
  categories?: Array<{category:string;suppressed:boolean;baseline:Record<string,number>|null;pilot:Record<string,number>|null}>;
  caveat?: string;
};

export type WorkloadDraftInput = {
  studyId: string;
  officeCode: string;
  officeName: string;
  windowType: "baseline" | "pilot";
  periodStart: string;
  periodEnd: string;
  sourceSystem: string;
  collectionMethod: WorkloadWindow["collection_method"];
  approvalReference: string;
  suppressionThreshold: number;
  observations: WorkloadObservation[];
};

function database() {
  if (!supabase) throw new Error("Supabase is required for research workload evidence.");
  return supabase;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertObservation(row: WorkloadObservation) {
  const counts = [row.inquiries,row.duplicates,row.confirmedResolved,row.escalated,row.totalFirstResponseSeconds,row.totalHandlingSeconds];
  if (!row.category.trim() || counts.some((value)=>!Number.isInteger(value)||value<0)) throw new Error("Every workload category requires a name and non-negative whole-number totals.");
  if (row.duplicates>row.inquiries||row.confirmedResolved>row.inquiries||row.escalated>row.inquiries) throw new Error(`Counts for ${row.category} cannot exceed its inquiries.`);
}

export async function loadWorkloadWorkspace() {
  const [studies,windows] = await Promise.all([
    database().from("research_studies").select("id,code,title,status").order("created_at",{ascending:false}),
    database().from("administrative_workload_windows").select("*").order("created_at",{ascending:false}),
  ]);
  if (studies.error) throw studies.error;
  if (windows.error) throw windows.error;
  return {studies:(studies.data??[]) as WorkloadStudy[],windows:(windows.data??[]) as WorkloadWindow[]};
}

export async function createWorkloadDraft(input: WorkloadDraftInput) {
  if (!input.observations.length) throw new Error("Add at least one aggregate category.");
  input.observations.forEach(assertObservation);
  const db=database();const {data:{user}}=await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Sign in again.");
  const sourceRecordCount=input.observations.reduce((sum,row)=>sum+row.inquiries,0);
  const checksum=await digest(JSON.stringify({sourceSystem:input.sourceSystem,windowType:input.windowType,periodStart:input.periodStart,periodEnd:input.periodEnd,observations:input.observations}));
  const created=await db.from("administrative_workload_windows").insert({
    study_id:input.studyId,office_code:input.officeCode,office_name:input.officeName,window_type:input.windowType,
    period_start:input.periodStart,period_end:input.periodEnd,source_system:input.sourceSystem,source_extract_sha256:checksum,
    source_record_count:sourceRecordCount,collection_method:input.collectionMethod,approval_reference:input.approvalReference,
    suppression_threshold:input.suppressionThreshold,created_by:user.id,
  }).select("*").single();
  if (created.error) throw created.error;
  const rows=input.observations.map((row)=>({
    window_id:created.data.id,study_id:input.studyId,window_type:input.windowType,period_start:input.periodStart,period_end:input.periodEnd,
    category:row.category.trim(),inquiry_count:row.inquiries,duplicate_count:row.duplicates,confirmed_resolved_count:row.confirmedResolved,
    escalated_count:row.escalated,total_first_response_seconds:row.totalFirstResponseSeconds,total_handling_seconds:row.totalHandlingSeconds,
    resolution_evidence_type:row.evidenceType,resolution_evidence_count:row.confirmedResolved,source_note:"Governed aggregate",entered_by:user.id,
  }));
  const metrics=await db.from("administrative_inquiry_metrics").insert(rows);
  if (metrics.error) {
    await db.from("administrative_workload_windows").delete().eq("id",created.data.id);
    throw metrics.error;
  }
  return created.data as WorkloadWindow;
}

export async function reviewWorkloadWindow(id:string,decision:"verified"|"rejected") {
  const result=await database().rpc("verify_administrative_workload_window",{p_window_id:id,p_decision:decision});
  if (result.error) throw result.error;
}

export async function deleteWorkloadDraft(id:string) {
  const result=await database().from("administrative_workload_windows").delete().eq("id",id).eq("status","draft");
  if (result.error) throw result.error;
}

export async function loadWorkloadReport(studyId:string,officeCode:string) {
  const result=await database().rpc("administrative_workload_report",{p_study_id:studyId,p_office_code:officeCode});
  if (result.error) throw result.error;
  return result.data as unknown as WorkloadReport;
}

export function downloadWorkloadReport(report:WorkloadReport) {
  const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`stu-workload-${report.officeCode??"incomplete"}.json`;link.click();URL.revokeObjectURL(url);
}
