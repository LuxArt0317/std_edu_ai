import assert from "node:assert/strict";
import fs from "node:fs";
import { after,test } from "node:test";
import handler from "../../api/research-feedback.ts";

type Captured = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
};

const originalFetch = globalThis.fetch;
const saved = {
  url: process.env.VITE_SUPABASE_URL,
  key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  salt: process.env.SAFETY_HASH_SALT,
};

after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ["VITE_SUPABASE_URL", saved.url],
    ["VITE_SUPABASE_PUBLISHABLE_KEY", saved.key],
    ["SAFETY_HASH_SALT", saved.salt],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function invoke(body: unknown, address: string) {
  const captured: Captured = { statusCode: 200, body: null, headers: {} };
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return response;
    },
    json(value: unknown) {
      captured.body = value;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
  };
  await handler(
    { method: "POST", body, headers: { "x-forwarded-for": address } },
    response,
  );
  return captured;
}

function configured() {
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SAFETY_HASH_SALT = "test-salt";
}

test("feedback rejects malformed or oversized capability input", async () => {
  const result = await invoke(
    { feedbackToken: "bad", sessionToken: "short", helpful: true },
    "feedback-invalid",
  );
  assert.equal(result.statusCode, 400);
  assert.equal(result.headers["Cache-Control"], "no-store, max-age=0");
});

test("feedback submits only the capability, session hash, and bounded evaluation", async () => {
  configured();
  let body = "";
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /rpc\/submit_public_ai_feedback$/);
    body = String(init?.body);
    return new Response(
      JSON.stringify("55555555-5555-4555-8555-555555555555"),
      {
        status: 200,
      },
    );
  };
  const result = await invoke(
    {
      feedbackToken: "a".repeat(64),
      sessionToken: "b".repeat(64),
      helpful: false,
      resolvedNeed: false,
      correctionCategory: "stale",
      comment: "The policy changed.",
    },
    "feedback-valid",
  );
  assert.equal(result.statusCode, 201);
  assert.match(body, /p_session_hash/);
  assert.match(body, /p_correction_category/);
  assert.doesNotMatch(body, /feedback-valid|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/);
});

test("feedback capabilities fail closed after database rejection", async () => {
  configured();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "already used" }), { status: 400 });
  const result = await invoke(
    {
      feedbackToken: "c".repeat(64),
      sessionToken: "d".repeat(64),
      helpful: true,
    },
    "feedback-replay",
  );
  assert.equal(result.statusCode, 400);
  assert.match(
    String((result.body as { error: string }).error),
    /invalid, expired, or has already been submitted/,
  );
});

test("migration enforces one-use feedback, private tokens, and protected reporting", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260719095500_public_ai_trace_and_feedback.sql",
    "utf8",
  );
  for (const marker of [
    "private.public_ai_feedback_tokens",
    "used_at is not null",
    "anonymous_session_hash=p_session_hash",
    "record_public_ai_exchange",
    "submit_public_ai_feedback",
    "public_ai_trace_report",
    "private.has_role(array['owner','admin','librarian'])",
    "query_text,consented_research_use",
    "null,false",
  ]) {
    assert.ok(
      migration.includes(marker),
      `feedback evidence missing ${marker}`,
    );
  }
});

test("fixture cleanup removes complete synthetic traces before cited chunks", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260719095730_extend_fixture_cleanup_for_public_ai_traces.sql",
    "utf8",
  );
  assert.ok(
    migration.indexOf("delete from public.ai_queries") <
      migration.indexOf("delete from public.knowledge_documents"),
  );
  assert.match(migration, /public_ai_traces/);
  assert.match(migration, /Only a recognized reversible ingestion fixture/);
});
