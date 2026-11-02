import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deploymentEnvironment } from "./deployment-env.mjs";

const config = JSON.parse(await readFile("deployment.json", "utf8"));
const corpus = JSON.parse(
  await readFile("docs/research/assistant-corpus.v1.json", "utf8"),
);
const apply = process.argv.includes("--apply");
const seen = new Set();
for (const item of corpus.documents) {
  assert.ok(!seen.has(item.key), "Duplicate corpus key");
  seen.add(item.key);
  assert.ok(new URL(item.url).protocol === "https:");
  assert.ok(item.content.length > 50 && item.content.length < 40000);
  assert.ok(
    item.method &&
      item.capturedOn &&
      item.validForDays > 0 &&
      item.validForDays <= 30,
  );
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    project: config.supabase.projectRef,
    origin: config.vercel.productionUrl,
    documents: corpus.documents.length,
    limitations: corpus.limitations,
  }),
);
if (!apply) process.exit(0);
const env = deploymentEnvironment(),
  owner = parseEnv(await readFile(".env.owner.local", "utf8"));
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(
  new URL(url).hostname,
  `${config.supabase.projectRef}.supabase.co`,
);
assert.equal(
  owner.CRM_ADMIN_EMAIL.toLowerCase(),
  config.supabase.ownerEmail.toLowerCase(),
);
const db = createClient(
  url,
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
function required(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
const login = required(
  await db.auth.signInWithPassword({
    email: owner.CRM_ADMIN_EMAIL,
    password: owner.CRM_ADMIN_PASSWORD,
  }),
  "Owner authentication",
);
assert.equal(login.user.app_metadata.role, "owner");
const results = [];
try {
  for (const item of corpus.documents) {
    const sourceUrl = new URL(item.url).origin + "/",
      now = new Date().toISOString();
    let source = required(
      await db
        .from("knowledge_sources")
        .select("id,owner_profile_id,source_type")
        .eq("canonical_url", sourceUrl)
        .maybeSingle(),
      "Source lookup",
    );
    if (!source)
      source = required(
        await db
          .from("knowledge_sources")
          .insert({
            name: `STU reference · ${new URL(item.url).hostname} · manually reviewed`,
            source_type: "manual",
            canonical_url: sourceUrl,
            official_domain: false,
            authority_level: "reviewed_internal",
            owner_profile_id: login.user.id,
            default_audience_scope: "public",
            default_language: "mixed",
            crawl_policy: "prohibited",
            robots_reviewed_at: now,
            active: true,
          })
          .select("id,owner_profile_id,source_type")
          .single(),
        "Manual reference source",
      );
    assert.equal(
      source.owner_profile_id,
      login.user.id,
      "Source belongs to a different owner",
    );
    const content = `${item.title}\n\n${item.content}\n\nEvidence scope: ${item.method}. Captured ${item.capturedOn}. Imported as a client-reviewed reference, not university approval. Source: ${item.url}`;
    const fingerprint = createHash("sha256").update(content).digest("hex");
    const previous = required(
      await db
        .from("knowledge_documents")
        .select("id,publication_status,metadata,effective_at,expires_at")
        .eq("source_id", source.id)
        .eq("logical_key", `assistant-v1-${item.key}`)
        .order("version", { ascending: false })
        .limit(1),
      "Version lookup",
    )[0];
    const effective = new Date(
      item.capturedOn + "T00:00:00+08:00",
    ).toISOString();
    const expires = new Date(
      Date.parse(effective) + item.validForDays * 86400000,
    ).toISOString();
    if (
      previous?.publication_status === "published" &&
      previous.metadata?.curated_input_sha256 === fingerprint
    ) {
      const run = required(
        await db
          .from("knowledge_ingestion_runs")
          .select("id,parser_version,chunker_version")
          .eq("source_id", source.id)
          .eq("input_checksum", fingerprint)
          .order("started_at", { ascending: false })
          .limit(1),
        "Ingestion provenance",
      )[0];
      required(
        await db
          .from("knowledge_documents")
          .update({
            effective_at: effective,
            expires_at: expires,
            review_due_at: expires,
            metadata: {
              ...previous.metadata,
              capture_timezone: "Asia/Taipei",
              ...(run
                ? {
                    ingestion_run_id: run.id,
                    parser_version: run.parser_version,
                    chunker_version: run.chunker_version,
                    input_mode: "content",
                    acquired_file_name: null,
                    extracted_mime_type: "text/plain",
                    page_count: null,
                  }
                : {}),
            },
          })
          .eq("id", previous.id),
        "Reconcile capture timezone/provenance",
      );
      if (
        previous.effective_at !== effective ||
        previous.expires_at !== expires
      ) {
        required(
          await db
            .from("knowledge_chunks")
            .update({ effective_at: effective, expires_at: expires })
            .eq("document_id", previous.id),
          "Chunk capture timezone",
        );
        required(
          await db
            .from("knowledge_review_events")
            .insert({
              document_id: previous.id,
              actor_profile_id: login.user.id,
              action: "restored",
              reason:
                "Correct the manually captured reference date to Asia/Taipei midnight; restore ingestion provenance. No source facts or audience changed.",
              before_state: {
                effective_at: previous.effective_at,
                expires_at: previous.expires_at,
              },
              after_state: { effective_at: effective, expires_at: expires },
            }),
          "Timezone reconciliation audit",
        );
      }
      results.push({
        key: item.key,
        status: "unchanged",
        documentId: previous.id,
      });
      continue;
    }
    assert.ok(
      Date.parse(expires) > Date.now(),
      "Capture has expired; review the manifest before importing",
    );
    const response = await fetch(
      config.vercel.productionUrl + "/api/knowledge-ingest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${login.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: source.id,
          title: item.title,
          logicalKey: `assistant-v1-${item.key}`,
          sourceUrl: item.url,
          domain: item.domain,
          documentType: "curated_reference",
          language: "mixed",
          inputMode: "content",
          content,
          effectiveAt: effective,
          expiresAt: expires,
          reviewDueAt: expires,
          audienceScope: "public",
          sensitivity: "public",
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    const result = await response.json();
    if (!response.ok || !result.documentId)
      throw new Error(
        `Ingestion ${item.key}: ${result.error || response.status}`,
      );
    const imported = required(
      await db
        .from("knowledge_documents")
        .select("metadata,publication_status")
        .eq("id", result.documentId)
        .single(),
      "Imported version",
    );
    if (imported.publication_status === "published") {
      results.push({
        key: item.key,
        status: "unchanged",
        documentId: result.documentId,
      });
      continue;
    }
    required(
      await db
        .from("knowledge_documents")
        .update({
          metadata: {
            ...imported.metadata,
            curated_input_sha256: fingerprint,
            captured_on: item.capturedOn,
            capture_method: item.method,
            corpus_version: corpus.version,
            manual_reference_only: true,
            capture_timezone: "Asia/Taipei",
          },
        })
        .eq("id", result.documentId)
        .eq("publication_status", "draft"),
      "Reference provenance",
    );
    const reason = `User-authorized client reference import. Reviewed public facts/links against ${item.method}; dated ${item.capturedOn}. No private records, official approval or completeness claimed.`;
    if (result.status !== "published")
      required(
        await db.rpc("publish_knowledge_document", {
          p_document_id: result.documentId,
          p_reason: reason,
        }),
        "Publish reviewed reference",
      );
    results.push({
      key: item.key,
      status: "published",
      documentId: result.documentId,
      chunks: result.chunks,
    });
    console.log(JSON.stringify(results.at(-1)));
    await mkdir("artifacts/assistant-knowledge", { recursive: true });
    await writeFile(
      "artifacts/assistant-knowledge/import-results.json",
      JSON.stringify(results, null, 2),
      { mode: 0o600 },
    );
  }
  console.log(
    JSON.stringify({
      complete: true,
      documents: results.length,
      published: results.filter((r) => r.status === "published").length,
    }),
  );
} finally {
  await db.auth.signOut({ scope: "local" }).catch(() => {});
}
