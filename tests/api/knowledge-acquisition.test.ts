import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
chunkKnowledgeSections,
createPublicLookup,
detectAndExtractSource,
extractHtmlSections,
extractTextSections,
isPublicAddress,
validatePublicHttpsUrl,
} from "../../server/knowledgeAcquisition.js";

function pdfFixture(text: string) {
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

test("public-address validation rejects every local and reserved network class", async () => {
  for (const address of [
    "127.0.0.1",
    "10.2.3.4",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(
    () =>
      validatePublicHttpsUrl("https://source.example/document", async () => [
        { address: "127.0.0.1", family: 4 },
      ]),
    /private, reserved, or unavailable/,
  );
  await assert.rejects(
    () =>
      validatePublicHttpsUrl(
        "https://user:secret@source.example/document",
        async () => [{ address: "8.8.8.8", family: 4 }],
      ),
    /credential-free HTTPS/,
  );
  const safe = await validatePublicHttpsUrl(
    "https://source.example/document",
    async () => [{ address: "8.8.8.8", family: 4 }],
  );
  assert.equal(safe.url.hostname, "source.example");
});

test("connection-time DNS validation supports both Node lookup callback signatures", async () => {
  const resolver = async () => [{ address: "8.8.8.8", family: 4 }];
  const lookup = createPublicLookup(resolver);
  const all = await new Promise((resolve, reject) =>
    lookup("source.example", { all: true }, (error: Error | null, addresses: unknown) =>
      error ? reject(error) : resolve(addresses),
    ),
  );
  assert.deepEqual(all, [{ address: "8.8.8.8", family: 4 }]);
  const single = await new Promise((resolve, reject) =>
    lookup("source.example", { all: false }, (error: Error | null, address: unknown, family: unknown) =>
      error ? reject(error) : resolve({ address, family }),
    ),
  );
  assert.deepEqual(single, { address: "8.8.8.8", family: 4 });
  const blocked = createPublicLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
  await assert.rejects(
    () => new Promise((resolve, reject) => blocked("source.example", { all: true }, (error: Error | null) => error ? reject(error) : resolve(null))),
    /not a public address/,
  );
});

test("HTML extraction preserves structure and links while excluding executable, hidden, and control content", async () => {
  const html =
    '<html><head><title>Admissions Guide</title><style>.x{}</style><script>steal()</script></head><body><main><h1>Admissions</h1><p>Read the <a href="/rules">official rules</a>.</p><div hidden>private token</div><h2>Requirements</h2><ul><li>Transcript</li><li>Photo</li></ul><table><tr><th>Item</th><th>Due</th></tr><tr><td>Form</td><td>June</td></tr></table><form><input type="hidden" value="credential"><label>Email <input type="email"></label><select><option>Undergraduate</option></select></form></main></body></html>';
  const first = extractHtmlSections(html, "https://www.stu.edu.tw/admissions");
  const second = extractHtmlSections(html, "https://www.stu.edu.tw/admissions");
  assert.deepEqual(first, second);
  const output = first.sections.map((section) => section.content).join("\n");
  assert.match(output, /official rules \(https:\/\/www\.stu\.edu\.tw\/rules\)/);
  assert.match(output, /\| Item \| Due \|/);
  assert.match(output, /Email; Undergraduate/);
  assert.doesNotMatch(output, /steal|private token|credential/);
  assert.deepEqual(
    first.sections.find((section) => section.content === "Transcript")
      ?.headingPath,
    ["Admissions", "Requirements"],
  );
  assert.ok(
    first.sections.every((section) =>
      /^html:(p|li|table|form):\d+$/.test(section.sourceLocator),
    ),
  );
});

test("Markdown, PDF, and structured chunks retain deterministic exact locators", async () => {
  const markdown = extractTextSections(
    "# Enrollment\n\nApply online.\n\n## Dates\n\nAugust 1.",
    "text/markdown",
  );
  assert.deepEqual(
    markdown.sections.map((section) => section.headingPath),
    [["Enrollment"], ["Enrollment", "Dates"]],
  );
  const pdf = await detectAndExtractSource(
    pdfFixture("Official graduation requirements"),
    "application/pdf",
    "https://www.stu.edu.tw/guide.pdf",
  );
  assert.equal(pdf.pageCount, 1);
  assert.equal(typeof globalThis.DOMMatrix, "function");
  assert.equal(pdf.sections[0].sourceLocator, "pdf:page:1");
  assert.match(pdf.sections[0].content, /Official graduation requirements/);
  const first = await chunkKnowledgeSections(
    [...markdown.sections, ...pdf.sections],
    { maxCharacters: 700 },
  );
  const second = await chunkKnowledgeSections(
    [...markdown.sections, ...pdf.sections],
    { maxCharacters: 700 },
  );
  assert.deepEqual(first, second);
  assert.equal(
    new Set(first.map((chunk) => chunk.chunkKey)).size,
    first.length,
  );
  assert.ok(
    first.every(
      (chunk) =>
        /^(text:lines|pdf:page)/.test(chunk.sourceLocator) &&
        chunk.headingPath.length,
    ),
  );
});

test("malformed, disguised, unsupported, empty, and oversized files fail closed", async () => {
  await assert.rejects(
    () => detectAndExtractSource(Buffer.from("%PDF-broken"), "application/pdf"),
    /malformed, encrypted, or unsupported/,
  );
  await assert.rejects(
    () => detectAndExtractSource(pdfFixture("Disguised PDF"), "text/plain"),
    /signature does not match/,
  );
  await assert.rejects(
    () =>
      detectAndExtractSource(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
        ]),
        "image/png",
      ),
    /Unsupported source type/,
  );
  await assert.rejects(
    () => detectAndExtractSource(Buffer.alloc(0), "text/plain"),
    /empty/,
  );
  await assert.rejects(
    () => detectAndExtractSource(Buffer.alloc(4_000_001, 65), "text/plain"),
    /4 MB/,
  );
});

test("the deployed acquisition boundary revalidates DNS redirects and records structured parser metadata", () => {
  const acquisition = fs.readFileSync("server/knowledgeAcquisition.js", "utf8");
  const endpoint = fs.readFileSync("api/knowledge-ingest.ts", "utf8");
  const review = fs.readFileSync(
    "supabase/migrations/20260719090630_governed_knowledge_review_decisions.sql",
    "utf8",
  );
  const policies = fs.readFileSync(
    "supabase/migrations/20260719091514_split_knowledge_management_policies.sql",
    "utf8",
  );
  const restricted = fs.readFileSync(
    "supabase/migrations/20260719092100_restrict_knowledge_document_mutations.sql",
    "utf8",
  );
  for (const marker of [
    "lookup:",
    "lookupOptions?.all",
    "callback(null, [selected])",
    "MAX_REDIRECTS",
    "private, reserved, or unavailable",
    "response.headers.location",
    "MAX_ACQUISITION_BYTES",
    "@thednp/dommatrix",
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
  ])
    assert.ok(
      acquisition.includes(marker),
      `missing acquisition boundary ${marker}`,
    );
  for (const marker of [
    "inputMode",
    "acquireHttpsSource",
    "detectAndExtractSource",
    "chunkKnowledgeSections",
    "extracted_mime_type",
    "sourceLocator",
    "source_published_at",
    "source_updated_at",
  ])
    assert.ok(
      endpoint.includes(marker),
      `missing endpoint acquisition ${marker}`,
    );
  for (const marker of [
    "p_decision not in ('rejected','changes_requested','quarantined')",
    "publication_status <> 'draft'",
    "char_length(trim(coalesce(p_reason,''))) < 12",
    "insert into public.knowledge_review_events",
  ])
    assert.ok(review.includes(marker), `missing review invariant ${marker}`);
  for (const table of ["sources", "documents", "chunks"]) {
    assert.match(policies, new RegExp(`drop policy knowledge_${table}_manage`));
    for (const action of ["insert", "update", "delete"])
      assert.ok(
        policies.includes(`knowledge_${table}_${action}`),
        `missing ${table} ${action} policy`,
      );
  }
  for (const action of ["insert", "update", "delete"])
    assert.match(
      restricted,
      new RegExp(
        `knowledge_documents_${action}[\\s\\S]*owner','admin','librarian`,
      ),
    );
  assert.doesNotMatch(restricted, /'support'/);
});
