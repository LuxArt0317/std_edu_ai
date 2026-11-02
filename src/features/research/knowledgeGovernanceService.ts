import { supabase } from "../../utils/supabase";

export type GovernedSource = {
  id: string;
  name: string;
  source_type: string;
  canonical_url: string;
  official_domain: boolean;
  authority_level: string;
  owner_profile_id: string;
  department_id: string | null;
  default_audience_scope: string;
  default_language: string;
  crawl_policy: string;
  crawl_interval: string | null;
  robots_reviewed_at: string | null;
  terms_reviewed_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type GovernedDocument = {
  id: string;
  source_id: string;
  logical_key: string;
  title: string;
  domain: string;
  document_type: string;
  language: string;
  source_url: string;
  content_checksum: string;
  effective_at: string | null;
  expires_at: string | null;
  version: number;
  source_published_at: string | null;
  source_updated_at: string | null;
  supersedes_id: string | null;
  extraction_status: string;
  review_status: string;
  publication_status: string;
  sensitivity: string;
  audience_scope: string;
  audience_roles: string[];
  section_id: string | null;
  reviewer_profile_id: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  review_due_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
export type GovernedChunk = {
  id: string;
  document_id: string;
  chunk_key: string;
  heading_path: string[];
  ordinal: number;
  content: string;
  content_checksum: string;
  token_count: number | null;
  source_locator: string | null;
  active: boolean;
};
export type ReviewEvent = {
  id: string;
  document_id: string;
  action: string;
  reason: string;
  actor_profile_id: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  created_at: string;
};
export type SourceCandidate = {
  id: string;
  canonical_url: string;
  canonical_identity: string;
  title: string;
  inventory_domain: string;
  language: string;
  source_type: string;
  official_host: string;
  owning_unit: string;
  discovery_method: string;
  discovered_from: string;
  http_status: number | null;
  final_url: string | null;
  status: "review_needed" | "accepted" | "rejected" | "unreachable" | "duplicate";
  source_id: string | null;
  discovered_by: string;
  reviewed_by: string | null;
  review_reason: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SourceInventoryReport = {
  inventory_domain: string;
  total: number;
  review_needed: number;
  accepted: number;
  rejected: number;
  unreachable: number;
  duplicates: number;
};
export type GovernanceDirectory = {
  sections: Array<{id:string;label:string}>;
  profiles: Array<{ id: string; full_name: string; role: string }>;
  departments: Array<{ id: string; code: string; name: string }>;
};

function client() {
  if (!supabase)
    throw new Error("Supabase is required for governed knowledge operations.");
  return supabase;
}
function message(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadKnowledgeGovernance() {
  const db = client();
  const [sources, documents, candidates, inventoryReport, profiles, departments, sections] = await Promise.all([
    db
      .from("knowledge_sources")
      .select("*")
      .order("updated_at", { ascending: false }),
    db
      .from("knowledge_documents")
      .select(
        "id,source_id,logical_key,title,domain,document_type,language,source_url,content_checksum,source_published_at,source_updated_at,effective_at,expires_at,version,supersedes_id,extraction_status,review_status,publication_status,sensitivity,audience_scope,audience_roles,section_id,reviewer_profile_id,reviewed_at,published_at,review_due_at,metadata,created_at,updated_at",
      )
      .order("created_at", { ascending: false }),
    db
      .from("knowledge_source_candidates")
      .select("id,canonical_url,canonical_identity,title,inventory_domain,language,source_type,official_host,owning_unit,discovery_method,discovered_from,http_status,final_url,status,source_id,discovered_by,reviewed_by,review_reason,last_checked_at,created_at,updated_at")
      .is("fixture_marker", null)
      .order("inventory_domain")
      .order("title"),
    db.rpc("stu_source_inventory_report"),
    db
      .from("profiles")
      .select("id,full_name,role")
      .in("role", ["owner", "admin", "librarian"])
      .order("full_name"),
    db.from("departments").select("id,code,name").order("code"),
    db.from("course_sections").select("id,section_code,courses(code,title)").order("section_code"),
  ]);
  message(sources.error);
  message(documents.error);
  message(candidates.error);
  message(inventoryReport.error);
  message(profiles.error);
  message(departments.error);
  message(sections.error);
  return {
    sources: (sources.data || []) as GovernedSource[],
    documents: (documents.data || []) as GovernedDocument[],
    candidates: (candidates.data || []) as SourceCandidate[],
    inventoryReport: (inventoryReport.data || []) as SourceInventoryReport[],
    directory: {
      sections:(sections.data||[]).map((section: {id:string;section_code:string;courses?:{code?:string;title?:string}|null})=>({id:section.id,label:`${section.courses?.code||section.courses?.title||"Class"} · ${section.section_code}`})),
      profiles: (profiles.data || []) as GovernanceDirectory["profiles"],
      departments: (departments.data ||
        []) as GovernanceDirectory["departments"],
    },
  };
}

export async function reviewSourceCandidate(input: {
  candidateId: string;
  decision: "accepted" | "rejected" | "unreachable" | "duplicate";
  reason: string;
  departmentId?: string;
}) {
  const result = await client().rpc("review_stu_source_candidate", {
    p_candidate_id: input.candidateId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
    ...(input.departmentId ? { p_department_id: input.departmentId } : {}),
  });
  message(result.error);
  return result.data as SourceCandidate;
}

export async function saveGovernedSource(
  input: Partial<GovernedSource> &
    Pick<
      GovernedSource,
      | "name"
      | "source_type"
      | "canonical_url"
      | "authority_level"
      | "owner_profile_id"
      | "default_audience_scope"
      | "default_language"
      | "crawl_policy"
      | "active"
    >,
) {
  const payload = {
    name: input.name.trim(),
    source_type: input.source_type,
    canonical_url: input.canonical_url.trim(),
    official_domain: Boolean(input.official_domain),
    authority_level: input.authority_level,
    owner_profile_id: input.owner_profile_id,
    department_id: input.department_id || null,
    default_audience_scope: input.default_audience_scope,
    default_language: input.default_language,
    crawl_policy: input.crawl_policy,
    crawl_interval:
      input.crawl_policy === "scheduled"
        ? input.crawl_interval || "30 days"
        : null,
    robots_reviewed_at: input.robots_reviewed_at || null,
    terms_reviewed_at: input.terms_reviewed_at || null,
    active: input.active,
  };
  const result = input.id
    ? await client()
        .from("knowledge_sources")
        .update(payload)
        .eq("id", input.id)
    : await client().from("knowledge_sources").insert(payload);
  message(result.error);
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}
function fileMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "pdf"
    ? "application/pdf"
    : extension === "html" || extension === "htm"
      ? "text/html"
      : extension === "md" || extension === "markdown"
        ? "text/markdown"
        : "text/plain";
}

export async function ingestGovernedDocument(input: {
  sourceId: string;
  title: string;
  logicalKey: string;
  sourceUrl: string;
  domain: string;
  documentType: string;
  language: string;
  inputMode: "content" | "url" | "file";
  content?: string;
  file?: File;
  sourcePublishedAt?: string;
  sourceUpdatedAt?: string;
  effectiveAt: string;
  expiresAt?: string;
  reviewDueAt: string;
  audienceScope: string;
  audienceRoles?:string[];
  sectionId?:string;
  sensitivity: string;
}) {
  const db = client();
  const session = await db.auth.getSession();
  if (session.error || !session.data.session)
    throw new Error(session.error?.message || "Authentication is required.");
  const payload: Record<string, unknown> = {
    sourceId: input.sourceId,
    title: input.title,
    logicalKey: input.logicalKey,
    sourceUrl: input.sourceUrl,
    domain: input.domain,
    documentType: input.documentType,
    language: input.language,
    inputMode: input.inputMode,
    sourcePublishedAt: input.sourcePublishedAt
      ? new Date(input.sourcePublishedAt).toISOString()
      : null,
    sourceUpdatedAt: input.sourceUpdatedAt
      ? new Date(input.sourceUpdatedAt).toISOString()
      : null,
    effectiveAt: new Date(input.effectiveAt).toISOString(),
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    reviewDueAt: new Date(input.reviewDueAt).toISOString(),
    audienceScope: input.audienceScope,
    audienceRoles: input.audienceScope==='role'?input.audienceRoles||[]:[],
    sectionId: input.audienceScope==='class'?input.sectionId||null:null,
    sensitivity: input.sensitivity,
  };
  if (input.inputMode === "content") payload.content = input.content || "";
  if (input.inputMode === "file") {
    if (!input.file)
      throw new Error("Choose a PDF, HTML, Markdown, or text file.");
    if (input.file.size > 3_000_000)
      throw new Error(
        "Knowledge uploads must be 3 MB or smaller. URL acquisition supports sources up to 4 MB.",
      );
    payload.fileName = input.file.name;
    payload.fileMimeType = fileMimeType(input.file);
    payload.fileBase64 = await fileBase64(input.file);
  }
  const response = await fetch("/api/knowledge-ingest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as {
    error?: string;
    status?: string;
    documentId?: string;
    ingestionRunId?: string;
    chunks?: number;
  };
  if (!response.ok)
    throw new Error(body.error || "The governed import failed.");
  return body;
}

export async function loadDocumentReview(documentId: string) {
  const [chunks, events] = await Promise.all([
    client()
      .from("knowledge_chunks")
      .select(
        "id,document_id,chunk_key,heading_path,ordinal,content,content_checksum,token_count,source_locator,active",
      )
      .eq("document_id", documentId)
      .order("ordinal"),
    client()
      .from("knowledge_review_events")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
  ]);
  message(chunks.error);
  message(events.error);
  return {
    chunks: (chunks.data || []) as GovernedChunk[],
    events: (events.data || []) as ReviewEvent[],
  };
}

export async function updateDocumentGovernance(
  id: string,
  input: {
    title: string;
    domain: string;
    sourcePublishedAt?: string;
    sourceUpdatedAt?: string;
    effectiveAt: string;
    expiresAt?: string;
    reviewDueAt: string;
    sensitivity: string;
    audienceScope: string;
    audienceRoles?:string[];
    sectionId?:string;
  },
) {
  if(input.audienceScope==='role'&&!input.audienceRoles?.length)throw new Error('Choose at least one allowed role.');
  if(input.audienceScope==='class'&&!input.sectionId)throw new Error('Choose the class that can read this document.');
  const result = await client()
    .from("knowledge_documents")
    .update({
      title: input.title.trim(),
      domain: input.domain,
      source_published_at: input.sourcePublishedAt
        ? new Date(input.sourcePublishedAt).toISOString()
        : null,
      source_updated_at: input.sourceUpdatedAt
        ? new Date(input.sourceUpdatedAt).toISOString()
        : null,
      effective_at: new Date(input.effectiveAt).toISOString(),
      expires_at: input.expiresAt
        ? new Date(input.expiresAt).toISOString()
        : null,
      review_due_at: new Date(input.reviewDueAt).toISOString(),
      sensitivity: input.sensitivity,
      audience_scope: input.audienceScope,
      audience_roles:input.audienceScope==='role'?input.audienceRoles||[]:[],
      section_id:input.audienceScope==='class'?input.sectionId:null,
    })
    .eq("id", id)
    .eq("publication_status", "draft");
  message(result.error);
}
export async function publishDocument(id: string, reason: string) {
  const result = await client().rpc("publish_knowledge_document", {
    p_document_id: id,
    p_reason: reason,
  });
  message(result.error);
  return result.data;
}
export async function reviewDocument(
  id: string,
  decision: "rejected" | "changes_requested" | "quarantined",
  reason: string,
) {
  const result = await client().rpc("review_knowledge_document", {
    p_document_id: id,
    p_decision: decision,
    p_reason: reason,
  });
  message(result.error);
  return result.data;
}
export async function rollbackDocument(id: string, reason: string) {
  const result = await client().rpc("rollback_knowledge_document", {
    p_document_id: id,
    p_reason: reason,
  });
  message(result.error);
  return result.data;
}

export async function refreshGovernedDocument(document:GovernedDocument){
  return ingestGovernedDocument({sourceId:document.source_id,title:document.title,logicalKey:document.logical_key,sourceUrl:document.source_url,domain:document.domain,documentType:document.document_type,language:document.language,inputMode:'url',effectiveAt:document.effective_at||new Date().toISOString(),expiresAt:document.expires_at||undefined,reviewDueAt:new Date(Date.now()+30*86400000).toISOString(),audienceScope:document.audience_scope,audienceRoles:document.audience_roles,sectionId:document.section_id||undefined,sensitivity:document.sensitivity});
}
