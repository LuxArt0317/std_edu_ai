import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { CheckboxField } from '@/components/form-controls'
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmUser } from "../crm/authService";
import {
  ingestGovernedDocument,
  loadDocumentReview,
  loadKnowledgeGovernance,
  publishDocument,
  reviewSourceCandidate,
  reviewDocument,
  rollbackDocument,
  saveGovernedSource,
  updateDocumentGovernance,
  type GovernedChunk,
  type GovernedDocument,
  type GovernedSource,
  type GovernanceDirectory,
  type ReviewEvent,
  type SourceCandidate,
  type SourceInventoryReport,
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
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [inventoryReport, setInventoryReport] = useState<SourceInventoryReport[]>([]);
  const [directory, setDirectory] = useState<GovernanceDirectory>({
    profiles: [],
    departments: [],
  });
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedDocument, setSelectedDocument] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [candidateDomain, setCandidateDomain] = useState("all");
  const [candidateStatus, setCandidateStatus] = useState("review_needed");
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
    setCandidates(data.candidates);
    setInventoryReport(data.inventoryReport);
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
    setSelectedCandidate((value) =>
      value && data.candidates.some((candidate) => candidate.id === value)
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
  const candidate = useMemo(
    () => candidates.find((item) => item.id === selectedCandidate),
    [candidates, selectedCandidate],
  );
  const visibleCandidates = useMemo(
    () =>
      candidates.filter(
        (item) =>
          (candidateDomain === "all" || item.inventory_domain === candidateDomain) &&
          (candidateStatus === "all" || item.status === candidateStatus),
      ),
    [candidateDomain, candidateStatus, candidates],
  );
  const coveredDomains = inventoryReport.filter((item) => item.total > 0).length;
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
        <Button
          type="button"
          disabled={busy}
          onClick={() => void operation(refresh, "Governed corpus refreshed.")}
        >
          Refresh
        </Button>
      </header>
      {error ? (
        <p className="governance-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="governance-metrics">
        <Card>
          <strong>{sources.length}</strong>
          <span>governed sources</span>
        </Card>
        <Card>
          <strong>
            {
              documents.filter(
                (item) => item.publication_status === "published",
              ).length
            }
          </strong>
          <span>published versions</span>
        </Card>
        <Card>
          <strong>
            {
              documents.filter(
                (item) => item.review_status === "awaiting_review",
              ).length
            }
          </strong>
          <span>awaiting review</span>
        </Card>
        <Card>
          <strong>
            {
              documents.filter(
                (item) => item.extraction_status === "quarantined",
              ).length
            }
          </strong>
          <span>quarantined</span>
        </Card>
      </div>
      <section className="source-inventory" aria-labelledby="source-inventory-title">
        <header>
          <div>
            <span>OFFICIAL-SOURCE DISCOVERY</span>
            <h4 id="source-inventory-title">Review the STU source inventory</h4>
            <p>
              {coveredDomains}/10 research domains have discovery candidates. Accepting one
              creates an inactive governed source—it does not acquire or publish content.
            </p>
          </div>
          <div className="source-inventory-summary" aria-label="Source inventory status">
            <strong>{candidates.length}</strong>
            <span>candidates</span>
            <strong>{candidates.filter((item) => item.status === "accepted").length}</strong>
            <span>accepted</span>
          </div>
        </header>
        <div className="source-inventory-filters">
          <Label>
            Research domain
            <NativeSelect value={candidateDomain} onChange={(event) => setCandidateDomain(event.target.value)}>
              <NativeSelectOption value="all">All 10 domains</NativeSelectOption>
              {domains.filter((value) => value !== "other").concat("forms_policies").map((value) => (
                <NativeSelectOption key={value} value={value}>{value.replaceAll("_", " ")}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          <Label>
            Review state
            <NativeSelect value={candidateStatus} onChange={(event) => setCandidateStatus(event.target.value)}>
              <NativeSelectOption value="all">All states</NativeSelectOption>
              <NativeSelectOption value="review_needed">Needs review</NativeSelectOption>
              <NativeSelectOption value="accepted">Accepted</NativeSelectOption>
              <NativeSelectOption value="rejected">Rejected</NativeSelectOption>
              <NativeSelectOption value="unreachable">Unreachable</NativeSelectOption>
              <NativeSelectOption value="duplicate">Duplicate</NativeSelectOption>
            </NativeSelect>
          </Label>
          <p role="status">{visibleCandidates.length} matching candidates</p>
        </div>
        <div className="source-inventory-layout">
          <div className="source-candidate-list">
            {visibleCandidates.map((item) => (
              <Button
                type="button"
                key={item.id}
                className={selectedCandidate === item.id ? "selected" : ""}
                onClick={() => setSelectedCandidate(item.id)}
              >
                <span>{item.inventory_domain.replaceAll("_", " ")}</span>
                <strong>{item.title}</strong>
                <small>{item.official_host} · HTTP {item.http_status ?? "unchecked"}</small>
                <i className={item.status}>{item.status.replaceAll("_", " ")}</i>
              </Button>
            ))}
            {!visibleCandidates.length ? <p className="governance-empty">No candidates match these filters.</p> : null}
          </div>
          {candidate ? (
            <Card className="source-candidate-review">
              <header>
                <div>
                  <span>{candidate.inventory_domain.replaceAll("_", " ")}</span>
                  <h5>{candidate.title}</h5>
                </div>
                <i className={candidate.status}>{candidate.status.replaceAll("_", " ")}</i>
              </header>
              <dl>
                <div><dt>Official host</dt><dd>{candidate.official_host}</dd></div>
                <div><dt>Named unit</dt><dd>{candidate.owning_unit}</dd></div>
                <div><dt>Observed</dt><dd>HTTP {candidate.http_status ?? "unchecked"} · {candidate.last_checked_at ? new Date(candidate.last_checked_at).toLocaleString() : "not checked"}</dd></div>
                <div><dt>Discovery</dt><dd>{candidate.discovery_method.replaceAll("_", " ")}</dd></div>
              </dl>
              <div className="source-candidate-links">
                <a href={candidate.canonical_url} target="_blank" rel="noreferrer">Open candidate ↗</a>
                <a href={candidate.discovered_from} target="_blank" rel="noreferrer">Open provenance ↗</a>
              </div>
              {candidate.status === "review_needed" ? (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const decision = String(form.get("decision")) as "accepted" | "rejected" | "unreachable" | "duplicate";
                  void operation(
                    () => reviewSourceCandidate({candidateId: candidate.id, decision, reason: String(form.get("reason")), departmentId: String(form.get("department")) || undefined}),
                    decision === "accepted" ? "Candidate accepted as an inactive governed source." : "Candidate review recorded.",
                  );
                }}>
                  <Label>
                    Decision
                    <NativeSelect name="decision" defaultValue="accepted">
                      <NativeSelectOption value="accepted">Accept as inactive source</NativeSelectOption>
                      <NativeSelectOption value="rejected">Reject</NativeSelectOption>
                      <NativeSelectOption value="unreachable">Mark unreachable</NativeSelectOption>
                      <NativeSelectOption value="duplicate">Mark duplicate</NativeSelectOption>
                    </NativeSelect>
                  </Label>
                  <Label>
                    Responsible department
                    <NativeSelect name="department" defaultValue="">
                      <NativeSelectOption value="">Institution-wide</NativeSelectOption>
                      {directory.departments.map((department) => <NativeSelectOption key={department.id} value={department.id}>{department.code} · {department.name}</NativeSelectOption>)}
                    </NativeSelect>
                  </Label>
                  <Label className="wide">
                    Required evidence and reason
                    <Textarea name="reason" minLength={12} maxLength={2000} required rows={3} placeholder="Record why this official page is or is not authoritative for this domain." />
                  </Label>
                  <Button disabled={busy}>{busy ? "Saving…" : "Record review"}</Button>
                </form>
              ) : (
                <div className="source-review-outcome">
                  <strong>Reviewed decision</strong>
                  <p>{candidate.review_reason}</p>
                  {candidate.source_id ? <Button type="button" onClick={() => setSelectedSource(candidate.source_id || "")}>Open inactive governed source</Button> : null}
                </div>
              )}
            </Card>
          ) : (
            <p className="governance-empty">Choose a candidate to inspect provenance and record a governed decision.</p>
          )}
        </div>
      </section>
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
          <Label>
            Name
            <Input
              name="name"
              defaultValue={sourceEdit?.name}
              required
              minLength={2}
            />
          </Label>
          <Label>
            Canonical HTTPS URL
            <Input
              name="canonicalUrl"
              type="url"
              defaultValue={sourceEdit?.canonical_url}
              required
            />
          </Label>
          <Label>
            Source type
            <NativeSelect
              name="sourceType"
              defaultValue={sourceEdit?.source_type || "website"}
            >
              {sourceTypes.map((value) => (
                <NativeSelectOption key={value}>{value}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          <Label>
            Authority
            <NativeSelect
              name="authority"
              defaultValue={sourceEdit?.authority_level || "primary_official"}
            >
              <NativeSelectOption>primary_official</NativeSelectOption>
              <NativeSelectOption>delegated_official</NativeSelectOption>
              <NativeSelectOption>reviewed_internal</NativeSelectOption>
              <NativeSelectOption>reference</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label>
            Named owner
            <NativeSelect
              name="owner"
              defaultValue={sourceEdit?.owner_profile_id || currentUser?.id}
            >
              {directory.profiles.map((profile) => (
                <NativeSelectOption key={profile.id} value={profile.id}>
                  {profile.full_name} · {profile.role}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          <Label>
            Department
            <NativeSelect
              name="department"
              defaultValue={sourceEdit?.department_id || ""}
            >
              <NativeSelectOption value="">Institution-wide</NativeSelectOption>
              {directory.departments.map((department) => (
                <NativeSelectOption key={department.id} value={department.id}>
                  {department.code} · {department.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          <Label>
            Default audience
            <NativeSelect
              name="audience"
              defaultValue={sourceEdit?.default_audience_scope || "public"}
            >
              <NativeSelectOption>public</NativeSelectOption>
              <NativeSelectOption>institution</NativeSelectOption>
              <NativeSelectOption>staff</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label>
            Language
            <NativeSelect
              name="language"
              defaultValue={sourceEdit?.default_language || "mixed"}
            >
              <NativeSelectOption>zh-Hant</NativeSelectOption>
              <NativeSelectOption>en</NativeSelectOption>
              <NativeSelectOption>mixed</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label>
            Crawl policy
            <NativeSelect
              name="crawlPolicy"
              defaultValue={sourceEdit?.crawl_policy || "manual"}
            >
              <NativeSelectOption>manual</NativeSelectOption>
              <NativeSelectOption>scheduled</NativeSelectOption>
              <NativeSelectOption>webhook</NativeSelectOption>
              <NativeSelectOption>prohibited</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label>
            Scheduled interval
            <Input
              name="crawlInterval"
              defaultValue={sourceEdit?.crawl_interval || ""}
              placeholder="30 days"
            />
          </Label>
          <Label>
            Robots reviewed
            <Input
              name="robotsReviewed"
              type="datetime-local"
              defaultValue={
                dateValue(sourceEdit?.robots_reviewed_at) ||
                dateValue(new Date().toISOString())
              }
            />
          </Label>
          <Label>
            Terms reviewed
            <Input
              name="termsReviewed"
              type="datetime-local"
              defaultValue={dateValue(sourceEdit?.terms_reviewed_at)}
            />
          </Label>
          <Label className="check">
            <CheckboxField
              name="officialDomain"
              type="checkbox"
              defaultChecked={sourceEdit?.official_domain}
            />
            Official domain
          </Label>
          <Label className="check">
            <CheckboxField
              name="active"
              type="checkbox"
              defaultChecked={sourceEdit?.active ?? false}
            />
            Active and eligible
          </Label>
          <footer>
            <Button disabled={busy}>Save source</Button>
            {sourceEdit ? (
              <Button type="button" onClick={() => setSourceEdit(null)}>
                Cancel edit
              </Button>
            ) : null}
          </footer>
        </form>
      </details>
      <div className="governance-layout">
        <aside>
          <Label>
            Governed source
            <NativeSelect
              value={selectedSource}
              onChange={(event) => {
                setSelectedSource(event.target.value);
                setSelectedDocument("");
              }}
            >
              <NativeSelectOption value="">All sources</NativeSelectOption>
              {sources.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          {source ? (
            <Card>
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
              <Button type="button" onClick={() => setSourceEdit(source)}>
                Edit source
              </Button>
            </Card>
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
              <Label>
                Source
                <NativeSelect
                  name="sourceId"
                  value={selectedSource}
                  onChange={(event) => setSelectedSource(event.target.value)}
                  required
                >
                  <NativeSelectOption value="">Choose source</NativeSelectOption>
                  {sources
                    .filter((item) => item.active)
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Label>
              <Label>
                Acquisition
                <NativeSelect
                  value={inputMode}
                  onChange={(event) =>
                    setInputMode(event.target.value as typeof inputMode)
                  }
                >
                  <NativeSelectOption value="url">Fetch governed URL</NativeSelectOption>
                  <NativeSelectOption value="file">Upload PDF/HTML/Markdown/text</NativeSelectOption>
                  <NativeSelectOption value="content">Paste reviewed content</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Label>
                Title
                <Input name="title" required />
              </Label>
              <Label>
                Stable logical key
                <Input
                  name="logicalKey"
                  placeholder="admissions-requirements"
                  required
                />
              </Label>
              <Label>
                Source URL
                <Input
                  name="sourceUrl"
                  type="url"
                  defaultValue={source?.canonical_url}
                  key={source?.id}
                />
              </Label>
              <Label>
                Domain
                <NativeSelect name="domain">
                  {domains.map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Label>
              <Label>
                Document type
                <Input
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
              </Label>
              <Label>
                Language
                <NativeSelect
                  name="language"
                  defaultValue={source?.default_language || "mixed"}
                >
                  <NativeSelectOption>zh-Hant</NativeSelectOption>
                  <NativeSelectOption>en</NativeSelectOption>
                  <NativeSelectOption>mixed</NativeSelectOption>
                </NativeSelect>
              </Label>
              {inputMode === "file" ? (
                <Label>
                  File
                  <Input
                    name="file"
                    type="file"
                    accept="application/pdf,text/html,text/plain,text/markdown,.md,.html,.txt"
                    required
                  />
                </Label>
              ) : null}
              {inputMode === "content" ? (
                <Label>
                  Reviewed content
                  <Textarea name="content" rows={7} required />
                </Label>
              ) : null}
              <Label>
                Source published
                <Input name="sourcePublishedAt" type="datetime-local" />
              </Label>
              <Label>
                Source last updated
                <Input name="sourceUpdatedAt" type="datetime-local" />
              </Label>
              <Label>
                Effective at
                <Input
                  name="effectiveAt"
                  type="datetime-local"
                  defaultValue={dateValue(new Date().toISOString())}
                  required
                />
              </Label>
              <Label>
                Review due
                <Input
                  name="reviewDueAt"
                  type="datetime-local"
                  defaultValue={future(180)}
                  required
                />
              </Label>
              <Label>
                Expires at
                <Input name="expiresAt" type="datetime-local" />
              </Label>
              <Label>
                Audience
                <NativeSelect
                  name="audienceScope"
                  defaultValue={source?.default_audience_scope || "public"}
                >
                  <NativeSelectOption>public</NativeSelectOption>
                  <NativeSelectOption>institution</NativeSelectOption>
                  <NativeSelectOption>staff</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Label>
                Sensitivity
                <NativeSelect name="sensitivity" defaultValue="public">
                  <NativeSelectOption>public</NativeSelectOption>
                  <NativeSelectOption>institution</NativeSelectOption>
                  <NativeSelectOption>restricted</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Button disabled={busy || !selectedSource}>
                {busy ? "Working…" : "Acquire for review"}
              </Button>
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
              <Button
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
              </Button>
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
            <Button type="button" onClick={() => setSelectedDocument("")}>
              Close
            </Button>
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
              <Label>
                Title
                <Input name="title" defaultValue={document.title} required />
              </Label>
              <Label>
                Domain
                <NativeSelect name="domain" defaultValue={document.domain}>
                  {domains.map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Label>
              <Label>
                Source published
                <Input
                  name="sourcePublishedAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.source_published_at)}
                />
              </Label>
              <Label>
                Source last updated
                <Input
                  name="sourceUpdatedAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.source_updated_at)}
                />
              </Label>
              <Label>
                Effective
                <Input
                  name="effectiveAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.effective_at)}
                  required
                />
              </Label>
              <Label>
                Review due
                <Input
                  name="reviewDueAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.review_due_at)}
                  required
                />
              </Label>
              <Label>
                Expires
                <Input
                  name="expiresAt"
                  type="datetime-local"
                  defaultValue={dateValue(document.expires_at)}
                />
              </Label>
              <Label>
                Audience
                <NativeSelect
                  name="audienceScope"
                  defaultValue={document.audience_scope}
                >
                  <NativeSelectOption>public</NativeSelectOption>
                  <NativeSelectOption>institution</NativeSelectOption>
                  <NativeSelectOption>staff</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Label>
                Sensitivity
                <NativeSelect name="sensitivity" defaultValue={document.sensitivity}>
                  <NativeSelectOption>public</NativeSelectOption>
                  <NativeSelectOption>institution</NativeSelectOption>
                  <NativeSelectOption>restricted</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Button disabled={busy}>Save metadata</Button>
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
            <Label>
              Decision
              <NativeSelect
                name="action"
                defaultValue={
                  document.publication_status === "draft"
                    ? "publish"
                    : "rollback"
                }
              >
                {document.publication_status === "draft" ? (
                  <>
                    <NativeSelectOption value="publish">Approve and publish</NativeSelectOption>
                    <NativeSelectOption value="changes_requested">Request changes</NativeSelectOption>
                    <NativeSelectOption value="rejected">Reject version</NativeSelectOption>
                    <NativeSelectOption value="quarantined">Quarantine extraction</NativeSelectOption>
                  </>
                ) : null}
                {["superseded", "expired"].includes(
                  document.publication_status,
                ) ? (
                  <NativeSelectOption value="rollback">Restore this prior version</NativeSelectOption>
                ) : null}
              </NativeSelect>
            </Label>
            <Label>
              Required reason
              <Textarea
                name="reason"
                minLength={12}
                required
                rows={2}
                placeholder="Record the evidence and reason for this decision."
              />
            </Label>
            <Button disabled={busy}>Apply reviewed decision</Button>
          </form>
          <details className="review-history">
            <summary>Audit history ({events.length})</summary>
            {events.map((event) => (
              <Card key={event.id}>
                <strong>{event.action.replaceAll("_", " ")}</strong>
                <p>{event.reason}</p>
                <small>
                  {new Date(event.created_at).toLocaleString()} ·{" "}
                  {event.actor_profile_id.slice(0, 8)}
                </small>
              </Card>
            ))}
          </details>
        </section>
      ) : null}
    </section>
  );
}
