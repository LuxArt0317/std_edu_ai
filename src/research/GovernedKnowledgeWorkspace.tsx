import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmUser } from "../crm/authService";
import {
  ingestGovernedDocument,
  loadDocumentReview,
  loadKnowledgeGovernance,
  publishDocument,
  reviewDocument,
  rollbackDocument,
  saveGovernedSource,
  updateDocumentGovernance,
  type GovernedChunk,
  type GovernedDocument,
  type GovernedSource,
  type GovernanceDirectory,
  type ReviewEvent,
} from "./knowledgeGovernanceService";

const roles = new Set(["owner", "admin", "librarian"]);
const domains = [
  "admissions",
  "enrollment",
  "graduation",
  "academic_rules",
  "programs",
  "administrative_services",
  "student_services",
  "campus_places",
  "faq",
  "other",
];
const sourceTypes = [
  "website",
  "pdf",
  "form",
  "api",
  "manual",
  "directory",
  "map",
  "policy",
  "service",
];
const dateValue = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const future = (days: number) =>
  dateValue(new Date(Date.now() + days * 86_400_000).toISOString());

export function GovernedKnowledgeWorkspace({
  currentUser,
  onMessage,
}: {
  currentUser?: CrmUser;
  onMessage: (message: string) => void;
}) {
  const allowed = Boolean(currentUser && roles.has(currentUser.role));
  const [sources, setSources] = useState<GovernedSource[]>([]);
  const [documents, setDocuments] = useState<GovernedDocument[]>([]);
  const [directory, setDirectory] = useState<GovernanceDirectory>({
    profiles: [],
    departments: [],
  });
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedDocument, setSelectedDocument] = useState("");
  const [sourceEdit, setSourceEdit] = useState<GovernedSource | null>(null);
  const [inputMode, setInputMode] = useState<"content" | "url" | "file">("url");
  const [chunks, setChunks] = useState<GovernedChunk[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const data = await loadKnowledgeGovernance();
    setSources(data.sources);
    setDocuments(data.documents);
    setDirectory(data.directory);
    setSelectedSource((value) =>
      value && data.sources.some((source) => source.id === value)
        ? value
        : data.sources[0]?.id || "",
    );
    setSelectedDocument((value) =>
      value && data.documents.some((document) => document.id === value)
        ? value
        : "",
    );
  }, []);
  useEffect(() => {
    if (!allowed) return;
    void refresh().catch((reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Governed knowledge could not be loaded.",
      ),
    );
  }, [allowed, refresh]);
  useEffect(() => {
    if (!selectedDocument) {
      setChunks([]);
      setEvents([]);
      return;
    }
    void loadDocumentReview(selectedDocument)
      .then((data) => {
        setChunks(data.chunks);
        setEvents(data.events);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Document review evidence could not be loaded.",
        ),
      );
  }, [selectedDocument]);
  const source = useMemo(
    () => sources.find((item) => item.id === selectedSource),
    [sources, selectedSource],
  );
  const document = useMemo(
    () => documents.find((item) => item.id === selectedDocument),
    [documents, selectedDocument],
  );
  const visibleDocuments = documents.filter(
    (item) => !selectedSource || item.source_id === selectedSource,
  );
  async function operation(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
      onMessage(success);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The governed knowledge operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <section className="governed-knowledge">
      <header>
        <div>
          <span>RESEARCH-GRADE CORPUS</span>
          <h3>Sources, versions, and review</h3>
          <p>
            Acquire official HTML, PDF, Markdown, or text into review-only
            versions. Nothing becomes public until an authorized reviewer
            publishes it.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void operation(refresh, "Governed corpus refreshed.")}
        >
          Refresh
        </button>
      </header>
      {error ? (
        <p className="governance-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="governance-metrics">
        <article>
          <strong>{sources.length}</strong>
          <span>governed sources</span>
        </article>
        <article>
          <strong>
            {
              documents.filter(
                (item) => item.publication_status === "published",
              ).length
            }
          </strong>
          <span>published versions</span>
        </article>
        <article>
          <strong>
            {
              documents.filter(
                (item) => item.review_status === "awaiting_review",
              ).length
            }
          </strong>
          <span>awaiting review</span>
        </article>
        <article>
          <strong>
            {
              documents.filter(
                (item) => item.extraction_status === "quarantined",
              ).length
            }
          </strong>
          <span>quarantined</span>
        </article>
      </div>
      <details className="governance-create">
        <summary>
          {sourceEdit ? "Edit governed source" : "+ Register governed source"}
        </summary>
        <form
          key={sourceEdit?.id || "new"}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void operation(
              () =>
                saveGovernedSource({
                  id: sourceEdit?.id,
                  name: String(form.get("name")),
                  source_type: String(form.get("sourceType")),
                  canonical_url: String(form.get("canonicalUrl")),
                  official_domain: form.get("officialDomain") === "on",
                  authority_level: String(form.get("authority")),
                  owner_profile_id: String(form.get("owner")),
                  department_id: String(form.get("department")) || null,
                  default_audience_scope: String(form.get("audience")),
                  default_language: String(form.get("language")),
                  crawl_policy: String(form.get("crawlPolicy")),
                  crawl_interval: String(form.get("crawlInterval")) || null,
                  robots_reviewed_at: String(form.get("robotsReviewed"))
                    ? new Date(String(form.get("robotsReviewed"))).toISOString()
                    : null,
                  terms_reviewed_at: String(form.get("termsReviewed"))
                    ? new Date(String(form.get("termsReviewed"))).toISOString()
                    : null,
                  active: form.get("active") === "on",
                }).then(() => setSourceEdit(null)),
              "Governed source saved.",
            );
          }}
        >
          <label>
            Name
            <input
              name="name"
              defaultValue={sourceEdit?.name}
              required
              minLength={2}
            />
          </label>
          <label>
            Canonical HTTPS URL
            <input
              name="canonicalUrl"
              type="url"
              defaultValue={sourceEdit?.canonical_url}
              required
            />
          </label>
          <label>
            Source type
            <select
              name="sourceType"
              defaultValue={sourceEdit?.source_type || "website"}
            >
              {sourceTypes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Authority
            <select
              name="authority"
              defaultValue={sourceEdit?.authority_level || "primary_official"}
            >
              <option>primary_official</option>
              <option>delegated_official</option>
              <option>reviewed_internal</option>
              <option>reference</option>
            </select>
          </label>
          <label>
            Named owner
            <select
              name="owner"
              defaultValue={sourceEdit?.owner_profile_id || currentUser?.id}
            >
              {directory.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name} · {profile.role}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department
            <select
              name="department"
              defaultValue={sourceEdit?.department_id || ""}
            >
              <option value="">Institution-wide</option>
              {directory.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} · {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Default audience
            <select
              name="audience"
              defaultValue={sourceEdit?.default_audience_scope || "public"}
            >
              <option>public</option>
              <option>institution</option>
              <option>staff</option>
            </select>
          </label>
          <label>
            Language
            <select
              name="language"
              defaultValue={sourceEdit?.default_language || "mixed"}
            >
              <option>zh-Hant</option>
              <option>en</option>
              <option>mixed</option>
            </select>
          </label>
          <label>
            Crawl policy
            <select
              name="crawlPolicy"
              defaultValue={sourceEdit?.crawl_policy || "manual"}
            >
              <option>manual</option>
              <option>scheduled</option>
              <option>webhook</option>
              <option>prohibited</option>
            </select>
          </label>
          <label>
            Scheduled interval
            <input
              name="crawlInterval"
              defaultValue={sourceEdit?.crawl_interval || ""}
              placeholder="30 days"
            />
          </label>
          <label>
            Robots reviewed
            <input
              name="robotsReviewed"
              type="datetime-local"
              defaultValue={
                dateValue(sourceEdit?.robots_reviewed_at) ||
                dateValue(new Date().toISOString())
              }
            />
          </label>
          <label>
            Terms reviewed
            <input
              name="termsReviewed"
              type="datetime-local"
              defaultValue={dateValue(sourceEdit?.terms_reviewed_at)}
            />
          </label>
          <label className="check">
            <input
              name="officialDomain"
              type="checkbox"
              defaultChecked={sourceEdit?.official_domain}
            />
            Official domain
          </label>
          <label className="check">
            <input
              name="active"
              type="checkbox"
              defaultChecked={sourceEdit?.active ?? false}
            />
            Active and eligible
          </label>
          <footer>
            <button disabled={busy}>Save source</button>
            {sourceEdit ? (
              <button type="button" onClick={() => setSourceEdit(null)}>
                Cancel edit
              </button>
            ) : null}
          </footer>
        </form>
      </details>
      <div className="governance-layout">
        <aside>
          <label>
            Governed source
            <select
              value={selectedSource}
              onChange={(event) => {
                setSelectedSource(event.target.value);
                setSelectedDocument("");
              }}
            >
              <option value="">All sources</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {source ? (
            <article>
              <div>
                <strong>{source.name}</strong>
                <span className={source.active ? "active" : "inactive"}>
                  {source.active ? "active" : "inactive"}
                </span>
              </div>
              <a href={source.canonical_url} target="_blank" rel="noreferrer">
                {source.canonical_url}
              </a>
              <p>
                {source.authority_level.replaceAll("_", " ")} ·{" "}
                {source.default_language} · {source.default_audience_scope}
              </p>
              <small>
                Robots {source.robots_reviewed_at ? "reviewed" : "not reviewed"}{" "}
                · Terms {source.terms_reviewed_at ? "reviewed" : "not reviewed"}
              </small>
              <button type="button" onClick={() => setSourceEdit(source)}>
                Edit source
              </button>
            </article>
          ) : null}
          <details className="governance-import" open>
            <summary>Acquire a document</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const chosen = sources.find(
                  (item) => item.id === String(form.get("sourceId")),
                );
                void operation(
                  () =>
                    ingestGovernedDocument({
                      sourceId: String(form.get("sourceId")),
                      title: String(form.get("title")),
                      logicalKey: String(form.get("logicalKey")),
                      sourceUrl:
                        String(form.get("sourceUrl")) ||
                        chosen?.canonical_url ||
                        "",
                      domain: String(form.get("domain")),
                      documentType: String(form.get("documentType")),
                      language: String(form.get("language")),
                      inputMode,
                      content: String(form.get("content")),
                      file:
                        form.get("file") instanceof File
                          ? (form.get("file") as File)
                          : undefined,
                      sourcePublishedAt: String(
                        form.get("sourcePublishedAt"),
                      ),
                      sourceUpdatedAt: String(form.get("sourceUpdatedAt")),
                      effectiveAt: String(form.get("effectiveAt")),
                      expiresAt: String(form.get("expiresAt")),
                      reviewDueAt: String(form.get("reviewDueAt")),
                      audienceScope: String(form.get("audienceScope")),
                      sensitivity: String(form.get("sensitivity")),
                    }),
                  "Document acquired into the review queue.",
                );
              }}
            >
              <label>
                Source
                <select
                  name="sourceId"
                  value={selectedSource}
                  onChange={(event) => setSelectedSource(event.target.value)}
                  required
                >
                  <option value="">Choose source</option>
                  {sources
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Acquisition
                <select
                  value={inputMode}
                  onChange={(event) =>
                    setInputMode(event.target.value as typeof inputMode)
                  }
                >
                  <option value="url">Fetch governed URL</option>
                  <option value="file">Upload PDF/HTML/Markdown/text</option>
                  <option value="content">Paste reviewed content</option>
                </select>
              </label>
              <label>
                Title
                <input name="title" required />
              </label>
              <label>
                Stable logical key
                <input
                  name="logicalKey"
                  placeholder="admissions-requirements"
                  required
                />
              </label>
              <label>
                Source URL
                <input
                  name="sourceUrl"
                  type="url"
                  defaultValue={source?.canonical_url}
                  key={source?.id}
                />
              </label>
              <label>
                Domain
                <select name="domain">
                  {domains.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Document type
                <input
                  name="documentType"
                  defaultValue={
                    inputMode === "file"
                      ? "file"
                      : inputMode === "url"
                        ? "webpage"
                        : "text"
                  }
                  required
                />
              </label>
              <label>
                Language
                <select
                  name="language"
                  defaultValue={source?.default_language || "mixed"}
                >
                  <option>zh-Hant</option>
                  <option>en</option>
                  <option>mixed</option>
                </select>
              </label>
              {inputMode === "file" ? (
                <label>
                  File
                  <input
                    name="file"
                    type="file"
                    accept="application/pdf,text/html,text/plain,text/markdown,.md,.html,.txt"
                    required
                  />
                </label>
              ) : null}
              {inputMode === "content" ? (
                <label>
                  Reviewed content
                  <textarea name="content" rows={7} required />
                </label>
              ) : null}
              <label>
                Source published
                <input name="sourcePublishedAt" type="datetime-local" />
              </label>
              <label>
                Source last updated
                <input name="sourceUpdatedAt" type="datetime-local" />
              </label>
              <label>
                Effective at
                <input
                  name="effectiveAt"
                  type="datetime-local"
                  defaultValue={dateValue(new Date().toISOString())}
                  required
                />
              </label>
              <label>
                Review due
                <input
                  name="reviewDueAt"
                  type="datetime-local"
                  defaultValue={future(180)}
                  required
                />
              </label>
              <label>
                Expires at
                <input name="expiresAt" type="datetime-local" />
              </label>
              <label>
                Audience
                <select
                  name="audienceScope"
                  defaultValue={source?.default_audience_scope || "public"}
                >
                  <option>public</option>
                  <option>institution</option>
                  <option>staff</option>
                </select>
              </label>
              <label>
                Sensitivity
                <select name="sensitivity" defaultValue="public">
                  <option>public</option>
                  <option>institution</option>
                  <option>restricted</option>
                </select>
              </label>
              <button disabled={busy || !selectedSource}>
                {busy ? "Working…" : "Acquire for review"}
              </button>
            </form>
          </details>
        </aside>
        <div className="governance-documents">
          <header>
            <div>
              <span>VERSION QUEUE</span>
              <h4>{source?.name || "All governed documents"}</h4>
            </div>
          </header>
          {visibleDocuments.length ? (
            visibleDocuments.map((item) => (
              <button
                type="button"
                className={selectedDocument === item.id ? "selected" : ""}
                key={item.id}
                onClick={() => setSelectedDocument(item.id)}
              >
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    v{item.version} · {item.domain.replaceAll("_", " ")}
                  </span>
                </div>
                <div>
                  <i className={item.publication_status}>
                    {item.publication_status}
                  </i>
                  <small>
                    {item.review_status.replaceAll("_", " ")} ·{" "}
                    {item.extraction_status}
                  </small>
                </div>
              </button>
            ))
          ) : (
            <p className="governance-empty">
              No document versions are connected to this source yet.
            </p>
          )}
        </div>
      </div>
      {document ? (
        <section className="document-review">
          <header>
            <div>
              <span>DOCUMENT REVIEW</span>
              <h4>
                {document.title} · version {document.version}
              </h4>
              <p>
                {document.logical_key} ·{" "}
                <a href={document.source_url} target="_blank" rel="noreferrer">
                  Open exact source ↗
                </a>
              </p>
            </div>
            <button type="button" onClick={() => setSelectedDocument("")}>
              Close
            </button>
          </header>
          <div className="document-review-state">
            <span>
              Extraction <strong>{document.extraction_status}</strong>
            </span>
            <span>
              Review <strong>{document.review_status}</strong>
            </span>
            <span>
              Publication <strong>{document.publication_status}</strong>
            </span>
            <span>
              Checksum <code>{document.content_checksum.slice(0, 12)}</code>
            </span>
          </div>
          {document.publication_status === "draft" ? (
            <form
              className="document-governance-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void operation(
                  () =>
                    updateDocumentGovernance(document.id, {
                      title: String(form.get("title")),
                      domain: String(form.get("domain")),
                      sourcePublishedAt: String(
                        form.get("sourcePublishedAt"),
                      ),
                      sourceUpdatedAt: String(form.get("sourceUpdatedAt")),
                      effectiveAt: String(form.get("effectiveAt")),
                      expiresAt: String(form.get("expiresAt")),
                      reviewDueAt: String(form.get("reviewDueAt")),
                      sensitivity: String(form.get("sensitivity")),
                      audienceScope: String(form.get("audienceScope")),
                    }),
                  "Document governance updated.",
                );
              }}
            >
              <label>
                Title
                <input name="title" defaultValue={document.title} required />
              </label>
              <label>
                Domain
                <select name="domain" defaultValue={document.domain}>
                  {domains.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Source published
                <input
                  name="sourcePublishedAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.source_published_at)}
                />
              </label>
              <label>
                Source last updated
                <input
                  name="sourceUpdatedAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.source_updated_at)}
                />
              </label>
              <label>
                Effective
                <input
                  name="effectiveAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.effective_at)}
                  required
                />
              </label>
              <label>
                Review due
                <input
                  name="reviewDueAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.review_due_at)}
                  required
                />
              </label>
              <label>
                Expires
                <input
                  name="expiresAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.expires_at)}
                />
              </label>
              <label>
                Audience
                <select
                  name="audienceScope"
                  defaultValue={document.audience_scope}
                >
                  <option>public</option>
                  <option>institution</option>
                  <option>staff</option>
                </select>
              </label>
              <label>
                Sensitivity
                <select name="sensitivity" defaultValue={document.sensitivity}>
                  <option>public</option>
                  <option>institution</option>
                  <option>restricted</option>
                </select>
              </label>
              <button disabled={busy}>Save metadata</button>
            </form>
          ) : null}
          <div className="chunk-review">
            <header>
              <h5>Exact retrieval chunks</h5>
              <span>
                {chunks.length} chunks ·{" "}
                {chunks.reduce((sum, item) => sum + (item.token_count || 0), 0)}{" "}
                tokens
              </span>
            </header>
            {chunks.map((chunk) => (
              <details key={chunk.id}>
                <summary>
                  <span>{chunk.ordinal + 1}</span>
                  <strong>
                    {chunk.heading_path.join(" › ") || "Unheaded content"}
                  </strong>
                  <code>{chunk.source_locator}</code>
                </summary>
                <p>{chunk.content}</p>
                <small>
                  {chunk.chunk_key} · {chunk.content_checksum.slice(0, 12)} ·{" "}
                  {chunk.active ? "active" : "review only"}
                </small>
              </details>
            ))}
          </div>
          <form
            className="review-decision"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const action = String(form.get("action"));
              const reason = String(form.get("reason"));
              void operation(
                () =>
                  action === "publish"
                    ? publishDocument(document.id, reason)
                    : action === "rollback"
                      ? rollbackDocument(document.id, reason)
                      : reviewDocument(
                          document.id,
                          action as
                            "rejected" | "changes_requested" | "quarantined",
                          reason,
                        ),
                action === "publish"
                  ? "Document published atomically."
                  : action === "rollback"
                    ? "Prior version restored atomically."
                    : "Review decision recorded.",
              );
            }}
          >
            <label>
              Decision
              <select
                name="action"
                defaultValue={
                  document.publication_status === "draft"
                    ? "publish"
                    : "rollback"
                }
              >
                {document.publication_status === "draft" ? (
                  <>
                    <option value="publish">Approve and publish</option>
                    <option value="changes_requested">Request changes</option>
                    <option value="rejected">Reject version</option>
                    <option value="quarantined">Quarantine extraction</option>
                  </>
                ) : null}
                {["superseded", "expired"].includes(
                  document.publication_status,
                ) ? (
                  <option value="rollback">Restore this prior version</option>
                ) : null}
              </select>
            </label>
            <label>
              Required reason
              <textarea
                name="reason"
                minLength={12}
                required
                rows={2}
                placeholder="Record the evidence and reason for this decision."
              />
            </label>
            <button disabled={busy}>Apply reviewed decision</button>
          </form>
          <details className="review-history">
            <summary>Audit history ({events.length})</summary>
            {events.map((event) => (
              <article key={event.id}>
                <strong>{event.action.replaceAll("_", " ")}</strong>
                <p>{event.reason}</p>
                <small>
                  {new Date(event.created_at).toLocaleString()} ·{" "}
                  {event.actor_profile_id.slice(0, 8)}
                </small>
              </article>
            ))}
          </details>
        </section>
      ) : null}
    </section>
  );
}
