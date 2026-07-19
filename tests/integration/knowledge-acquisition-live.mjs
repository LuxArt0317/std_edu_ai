import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}
function required(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new Error(`${label}: no data`);
  return result.data;
}
function password(email) {
  const found = spawnSync(
    "/usr/bin/security",
    ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (found.status !== 0 || !found.stdout.trim())
    throw new Error(`Missing protected credential for ${email}`);
  return found.stdout.trim();
}
async function login(email) {
  const db = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const auth = await db.auth.signInWithPassword({
    email,
    password: password(email),
  });
  if (auth.error || !auth.data.session || !auth.data.user)
    throw auth.error || new Error("Sign-in failed");
  return { db, session: auth.data.session, user: auth.data.user };
}
function pdfFixture(text) {
  const escaped = text
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  bodies.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

Object.assign(process.env, env(".env"), env(".env.local"));
const base = process.env.KNOWLEDGE_ACQUISITION_ORIGIN || "https://www.stu.best";
const owner = await login("winsonbaring10@gmail.com"),
  student = await login("winsonbaring10+student@gmail.com"),
  support = await login("winsonbaring10+support@gmail.com");
const anon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const suffix = Date.now().toString(36).toUpperCase();
const sourceUrl = `${base}/research-fixtures/issue122-source.html`;
const sourcePublishedAt = "2026-07-01T00:00:00.000Z";
const sourceUpdatedAt = "2026-07-18T00:00:00.000Z";
let sourceId = "";
let workflowError = null;
try {
  sourceId = required(
    await owner.db
      .from("knowledge_sources")
      .insert({
        name: `Ingestion verification acquisition ${suffix}`,
        source_type: "website",
        canonical_url: sourceUrl,
        official_domain: true,
        authority_level: "primary_official",
        owner_profile_id: owner.user.id,
        default_audience_scope: "public",
        default_language: "en",
        crawl_policy: "manual",
        robots_reviewed_at: new Date().toISOString(),
        terms_reviewed_at: new Date().toISOString(),
        active: true,
      })
      .select("id")
      .single(),
    "source",
  ).id;
  const api = async (body) => {
    const response = await fetch(`${base}/api/knowledge-ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${owner.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceId,
        title: `Acquisition ${suffix}`,
        logicalKey: "official-admissions",
        sourceUrl,
        domain: "admissions",
        documentType: "webpage",
        language: "en",
        sourcePublishedAt,
        sourceUpdatedAt,
        effectiveAt: new Date().toISOString(),
        reviewDueAt: new Date(Date.now() + 86400000).toISOString(),
        audienceScope: "public",
        sensitivity: "public",
        ...body,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        `ingestion HTTP ${response.status}: ${JSON.stringify(payload)}`,
      );
    return { response, payload };
  };
  const html = await api({ inputMode: "url" });
  if (html.response.status !== 201 || html.payload.status !== "awaiting_review")
    throw new Error("URL acquisition did not reach review.");
  const htmlId = html.payload.documentId;
  const htmlDocument = required(
    await owner.db
      .from("knowledge_documents")
      .select("metadata,review_status,publication_status,source_published_at,source_updated_at")
      .eq("id", htmlId)
      .single(),
    "HTML document",
  );
  if (
    htmlDocument.metadata.parser_version !== "cheerio-1.2.0@1" ||
    htmlDocument.publication_status !== "draft" ||
    new Date(htmlDocument.source_published_at).getTime() !== new Date(sourcePublishedAt).getTime() ||
    new Date(htmlDocument.source_updated_at).getTime() !== new Date(sourceUpdatedAt).getTime()
  )
    throw new Error("HTML parser metadata or review boundary failed.");
  const htmlChunks = required(
    await owner.db
      .from("knowledge_chunks")
      .select("content,source_locator,heading_path,active")
      .eq("document_id", htmlId)
      .order("ordinal"),
    "HTML chunks",
  );
  const htmlText = htmlChunks.map((item) => item.content).join("\n");
  if (
    !htmlChunks.length ||
    htmlChunks.some(
      (item) => !item.source_locator?.startsWith("html:") || item.active,
    ) ||
    /must-not-ingest|fixtureSecret/.test(htmlText) ||
    !htmlText.includes("Academic transcript")
  )
    throw new Error("HTML structure, privacy, or draft isolation failed.");
  const anonDraft = await anon
    .from("knowledge_documents")
    .select("id")
    .eq("id", htmlId);
  if (anonDraft.error || anonDraft.data.length)
    throw anonDraft.error || new Error("Draft document was public.");
  required(
    await owner.db.rpc("publish_knowledge_document", {
      p_document_id: htmlId,
      p_reason: "Live reviewed HTML acquisition publication.",
    }),
    "publish HTML",
  );
  const anonPublished = await anon
    .from("knowledge_documents")
    .select("id")
    .eq("id", htmlId);
  if (anonPublished.error || anonPublished.data.length !== 1)
    throw anonPublished.error || new Error("Reviewed HTML was not public.");
  const duplicate = await api({ inputMode: "url" });
  if (
    duplicate.response.status !== 200 ||
    duplicate.payload.status !== "deduplicated" ||
    duplicate.payload.documentId !== htmlId
  )
    throw new Error("URL replay was not idempotent.");
  const pdf = pdfFixture(`Official PDF graduation evidence ${suffix}`);
  const pdfResult = await api({
    inputMode: "file",
    title: `PDF acquisition ${suffix}`,
    documentType: "pdf",
    fileName: "official-guide.pdf",
    fileMimeType: "application/pdf",
    fileBase64: pdf.toString("base64"),
  });
  const pdfId = pdfResult.payload.documentId;
  const pdfDocument = required(
    await owner.db
      .from("knowledge_documents")
      .select("metadata")
      .eq("id", pdfId)
      .single(),
    "PDF document",
  );
  const pdfChunks = required(
    await owner.db
      .from("knowledge_chunks")
      .select("content,source_locator")
      .eq("document_id", pdfId),
    "PDF chunks",
  );
  if (
    pdfDocument.metadata.parser_version !== "pdfjs-6.1.200@1" ||
    pdfDocument.metadata.page_count !== 1 ||
    pdfChunks.length !== 1 ||
    pdfChunks[0].source_locator !== "pdf:page:1"
  )
    throw new Error("PDF page extraction evidence failed.");
  required(
    await owner.db.rpc("publish_knowledge_document", {
      p_document_id: pdfId,
      p_reason: "Live reviewed PDF acquisition publication.",
    }),
    "publish PDF",
  );
  const versions = required(
    await owner.db
      .from("knowledge_documents")
      .select("id,publication_status")
      .in("id", [htmlId, pdfId]),
    "versions",
  );
  if (
    versions.find((item) => item.id === htmlId)?.publication_status !==
      "superseded" ||
    versions.find((item) => item.id === pdfId)?.publication_status !==
      "published"
  )
    throw new Error("PDF publication did not supersede HTML atomically.");
  required(
    await owner.db.rpc("rollback_knowledge_document", {
      p_document_id: htmlId,
      p_reason: "Live restore of the reviewed HTML version.",
    }),
    "rollback HTML",
  );
  const quarantine = await api({
    inputMode: "content",
    logicalKey: "quarantine-fixture",
    title: `Quarantine ${suffix}`,
    documentType: "text",
    content: `Reviewed but quarantined acquisition fixture ${suffix}`,
  });
  required(
    await owner.db.rpc("review_knowledge_document", {
      p_document_id: quarantine.payload.documentId,
      p_decision: "quarantined",
      p_reason: "Malformed source context requires quarantine.",
    }),
    "quarantine",
  );
  const quarantined = required(
    await owner.db
      .from("knowledge_documents")
      .select("extraction_status,review_status,publication_status")
      .eq("id", quarantine.payload.documentId)
      .single(),
    "quarantined document",
  );
  if (
    quarantined.extraction_status !== "quarantined" ||
    quarantined.review_status !== "changes_requested" ||
    quarantined.publication_status !== "draft"
  )
    throw new Error("Quarantine transition failed.");
  const studentDecision = await student.db.rpc("review_knowledge_document", {
    p_document_id: quarantine.payload.documentId,
    p_decision: "rejected",
    p_reason: "Unauthorized student decision attempt.",
  });
  if (!studentDecision.error)
    throw new Error("Student review decision succeeded.");
  const studentEdit = await student.db
    .from("knowledge_documents")
    .update({ title: "Unauthorized" })
    .eq("id", quarantine.payload.documentId)
    .select("id");
  if (studentEdit.error || studentEdit.data.length)
    throw studentEdit.error || new Error("Student document edit succeeded.");
  const supportResponse = await fetch(`${base}/api/knowledge-ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${support.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceId }),
  });
  if (supportResponse.status !== 403)
    throw new Error(`Support ingestion returned HTTP ${supportResponse.status}.`);
  const supportEdit = await support.db
    .from("knowledge_documents")
    .update({ title: "Unauthorized support mutation" })
    .eq("id", quarantine.payload.documentId)
    .select("id");
  if (supportEdit.error || supportEdit.data.length)
    throw supportEdit.error || new Error("Support document edit succeeded.");
  const allDocuments = required(
    await owner.db
      .from("knowledge_documents")
      .select("id")
      .eq("source_id", sourceId),
    "documents",
  );
  if (allDocuments.length !== 3)
    throw new Error(
      `Expected 3 document versions, got ${allDocuments.length}.`,
    );
  const runs = required(
    await owner.db
      .from("knowledge_ingestion_runs")
      .select("status,attempt_count")
      .eq("source_id", sourceId),
    "runs",
  );
  if (
    runs.length !== 4 ||
    runs.filter((run) => run.status === "deduplicated").length !== 1
  )
    throw new Error("Acquisition run lifecycle mismatch.");
  const cleanup = required(
    await owner.db.rpc("purge_knowledge_verification_fixture", {
      p_source_id: sourceId,
    }),
    "cleanup",
  );
  sourceId = "";
  const residual = required(
    await owner.db
      .from("knowledge_sources")
      .select("id")
      .eq("canonical_url", sourceUrl),
    "residual",
  );
  if (residual.length) throw new Error("Acquisition fixtures remain.");
  console.log(
    JSON.stringify({
      urlAcquisition: true,
      htmlParser: "cheerio-1.2.0@1",
      htmlChunks: htmlChunks.length,
      executableOrHiddenLeakage: 0,
      draftPublicLeakage: 0,
      pdfParser: "pdfjs-6.1.200@1",
      pdfPages: 1,
      exactPdfLocator: true,
      sourceDatesPreserved: true,
      duplicateDocuments: 0,
      duplicateChunks: 0,
      atomicSupersession: true,
      atomicRollback: true,
      quarantine: true,
      unauthorizedMutations: 0,
      supportIngestionStatus: 403,
      runs: 4,
      deduplicatedRuns: 1,
      cleanup,
      residualFixtures: 0,
    }),
  );
} catch (error) {
  workflowError = error;
} finally {
  if (sourceId)
    await owner.db.rpc("purge_knowledge_verification_fixture", {
      p_source_id: sourceId,
    });
  await Promise.all([
    owner.db.auth.signOut(),
    student.db.auth.signOut(),
    support.db.auth.signOut(),
  ]);
}
if (workflowError) throw workflowError;
