import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { AssistantMarkdown } from "../../src/features/school/portal/AssistantMarkdown.tsx";
import { ActivityTimeline } from "../../src/features/public/AssistantActivity.tsx";
import {
  Play,
  Square,
  Search,
  ChevronRight,
  Plus,
  Download,
  RefreshCw,
  ArrowUpRight,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  Clock3,
  SlidersHorizontal,
  X,
  History,
  FileText,
  ShieldCheck,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
} from "lucide-react";
import { affairsClient } from "../../src/features/public/affairs/authClient.ts";
import { readAssistantReply } from "../../src/services/assistantStreamReader.js";
import "./style.css";
const hosted = !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const apiUrl = (operation) => {
  const [name, query] = operation.split("?");
  return hosted
    ? "/api/affairs-data?resource=evaluation-lab&op=" +
        encodeURIComponent(name) +
        (query ? "&" + query : "")
    : "/__evaluation_lab/" + operation;
};
const imageUrls = new Map();
async function authHeaders() {
  if (!hosted) return {};
  const { data } = await affairsClient.auth.getSession();
  if (!data.session)
    throw new Error(
      "Sign in to School Affairs with an administrator account, then reload Answer Lab.",
    );
  return { Authorization: "Bearer " + data.session.access_token };
}
async function hydrateImages(payload) {
  if (!hosted) return;
  const files = [
    ...(payload.cases || []),
    ...(payload.runs || []),
    ...(payload.case ? [payload.case] : []),
  ].flatMap((item) => item.attachments || []);
  for (const file of files) {
    if (imageUrls.has(file.id)) continue;
    const response = await fetch(
      apiUrl("attachment") + "&id=" + encodeURIComponent(file.id),
      { headers: await authHeaders() },
    );
    if (!response.ok)
      throw new Error("A private attachment could not be loaded.");
    imageUrls.set(file.id, URL.createObjectURL(await response.blob()));
  }
}
async function request(operation, body, signal) {
  const response = await fetch(apiUrl(operation), {
    method: body ? "POST" : "GET",
    headers: {
      ...(await authHeaders()),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  await hydrateImages(payload);
  return payload;
}
const time = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const scoreClass = (score) =>
  score === null || score === undefined
    ? "neutral"
    : score >= 85
      ? "good"
      : score >= 60
        ? "mixed"
        : "poor";
const scoreLabel = (run) =>
  !run
    ? "Not run"
    : run.error || run.statusCode >= 400
      ? "Error"
      : run.matchScore === null
        ? "Unscored"
        : run.grade.passed
          ? "Passed"
          : "Needs review";
const attachmentUrl = (file) =>
  hosted
    ? imageUrls.get(file.id)
    : apiUrl("attachment") + "?id=" + encodeURIComponent(file.id);
function imageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}
function safeLink(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}
function AnswerExtras({ result }) {
  return (
    <>
      {result.verification && (
        <p className="chat-verification">
          {result.verification.status === "verified"
            ? "Checked against the selected evidence"
            : "Not confirmed yet"}
        </p>
      )}
      {result.views?.map((view) => (
        <details className="chat-records" key={view.id}>
          <summary>
            {view.title} · {view.total} retrieved
          </summary>
          <div className="record-scroll">
            <table>
              <thead>
                <tr>
                  {view.columns.map((column, index) => (
                    <th key={index}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((cells, index) => (
                  <tr key={index}>
                    {cells.map((cell, index) => (
                      <td key={index}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{view.note}</p>
          {safeLink(view.url) && (
            <a href={view.url} target="_blank" rel="noreferrer">
              Open records ↗
            </a>
          )}
        </details>
      ))}
      {result.citations?.length > 0 && (
        <div className="chat-sources">
          <h4>Sources</h4>
          {result.citations
            .filter((citation) => safeLink(citation.url))
            .map((citation, index) => (
              <a
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                key={index}
              >
                <span>{index + 1}</span>
                {citation.title || citation.sourceName || citation.url}
                <ArrowUpRight size={12} />
              </a>
            ))}
        </div>
      )}
      {result.proposedAction && (
        <div className="chat-proposal">
          <strong>{result.proposedAction.label || "Proposed action"}</strong>
          <p>
            Preview only. Answer Lab never confirms or executes proposed
            actions.
          </p>
        </div>
      )}
      {result.suggestedQuestions?.length > 0 && (
        <div className="chat-suggestions">
          {result.suggestedQuestions.map((question, index) => (
            <span key={index}>{question}</span>
          ))}
        </div>
      )}
    </>
  );
}
function App() {
  const [data, setData] = useState(null),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [live, setLive] = useState([]),
    [autoJudge, setAutoJudge] = useState(false),
    [judging, setJudging] = useState(false);
  const [model, setModel] = useState(""),
    [evaluatorModel, setEvaluatorModel] = useState(""),
    [reasoning, setReasoning] = useState("medium"),
    [models, setModels] = useState([]),
    [modelsLoading, setModelsLoading] = useState(false);
  const attachmentInput = useRef(null);
  const [session, setSession] = useState(null),
    [editor, setEditor] = useState(null),
    [saving, setSaving] = useState(false),
    [historyId, setHistoryId] = useState(""),
    [tab, setTab] = useState("review"),
    [sidebar, setSidebar] = useState(true);
  const abort = useRef(null),
    current = useRef(null),
    lastDispatch = useRef(0);
  useEffect(() => {
    request("state")
      .then((value) => {
        setData(value);
        setSelected(
          value.cases.find((item) => !item.archivedAt)?.id ||
            value.cases[0]?.id ||
            "",
        );
        let preferred = {};
        try {
          preferred = JSON.parse(
            localStorage.getItem("stu-answer-lab-models") || "{}",
          );
        } catch {}
        setModel(preferred.model || value.model);
        setEvaluatorModel(preferred.evaluatorModel || value.model);
        void loadModels();
      })
      .catch((reason) => setError(reason.message));
    affairsClient?.auth
      .getSession()
      .then(({ data }) => setSession(data.session));
    const subscription = affairsClient?.auth.onAuthStateChange(
      (_event, value) => {
        setSession(value);
        if (hosted && !value) {
          abort.current?.abort();
          setData(null);
          for (const url of imageUrls.values()) URL.revokeObjectURL(url);
          imageUrls.clear();
        }
      },
    );
    return () => {
      abort.current?.abort();
      subscription?.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!editor) return;
    const handler = (event) => {
      if (event.key === "Escape" && !saving) {
        setEditor(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".editor");
      const controls = dialog
        ? [
            ...dialog.querySelectorAll(
              "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
            ),
          ]
        : [];
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, saving]);
  async function refreshWorkspace() {
    setSaving(true);
    try {
      setData(await request("state"));
      setNotice("Shared questions and run history refreshed.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  async function loadModels() {
    setModelsLoading(true);
    try {
      const result = await request("models?refresh=1");
      setModels(result.models);
      let saved = {};
      try {
        saved = JSON.parse(
          localStorage.getItem("stu-answer-lab-models") || "{}",
        );
      } catch {}
      setModel((value) =>
        result.models.includes(saved.model)
          ? saved.model
          : result.models.includes(value)
            ? value
            : result.defaultModel,
      );
      setEvaluatorModel((value) =>
        result.models.includes(saved.evaluatorModel)
          ? saved.evaluatorModel
          : result.models.includes(value)
            ? value
            : result.defaultEvaluator,
      );
      if (["low", "medium", "high"].includes(saved.reasoning))
        setReasoning(saved.reasoning);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setModelsLoading(false);
    }
  }
  useEffect(() => {
    if (model && evaluatorModel)
      try {
        localStorage.setItem(
          "stu-answer-lab-models",
          JSON.stringify({ model, evaluatorModel, reasoning }),
        );
      } catch {}
  }, [model, evaluatorModel, reasoning]);
  async function uploadImage(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const caseId = selected;
    setSaving(true);
    try {
      for (const file of files) {
        if (file.size > 1500000)
          throw new Error("Use images up to 1.5 MB each.");
        const result = await request("attachment", {
          caseId,
          name: file.name,
          dataUrl: await imageData(file),
        });
        setData((previous) => ({
          ...previous,
          cases: previous.cases.map((item) =>
            item.id === caseId ? result.case : item,
          ),
        }));
      }
      setNotice(
        "Image saved. New runs use this attachment; older runs keep their original images.",
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  async function removeImage(file) {
    setSaving(true);
    try {
      const result = await request("attachment-remove", {
        caseId: selected,
        id: file.id,
      });
      setData((previous) => ({
        ...previous,
        cases: previous.cases.map((item) =>
          item.id === selected ? result.case : item,
        ),
      }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  const cases = data?.cases || [],
    runs = data?.runs || [],
    row = cases.find((item) => item.id === selected);
  const latest = useMemo(
    () => new Map(runs.map((run) => [run.caseId, run])),
    [runs],
  );
  const caseRuns = runs
    .filter((run) => run.caseId === selected)
    .slice()
    .reverse();
  const run =
    (historyId && caseRuns.find((item) => item.id === historyId)) ||
    caseRuns[0];
  const visible = cases
    .filter((item) =>
      filter === "archived" ? Boolean(item.archivedAt) : !item.archivedAt,
    )
    .filter(
      (item) =>
        (item.question + " " + item.domain + " " + item.id + " " + item.route)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" ||
          filter === "archived" ||
          (filter === "unrun" && !latest.has(item.id)) ||
          (filter === "review" &&
            latest.has(item.id) &&
            !latest.get(item.id).grade.passed) ||
          (filter === "account" && item.scope === "account")),
    );
  const domains = [...new Set(visible.map((item) => item.domain))];
  const enabled = cases.filter((item) => item.enabled && !item.archivedAt),
    completed = cases.filter((item) => latest.has(item.id)),
    passed = completed.filter(
      (item) =>
        latest.get(item.id).grade.passed &&
        latest.get(item.id).matchScore !== null,
    ),
    scored = completed
      .map((item) => latest.get(item.id).matchScore)
      .filter((value) => typeof value === "number");
  const average = scored.length
    ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
    : null;
  async function updateCase(value) {
    const result = await request("case", { case: value });
    setData((previous) => ({
      ...previous,
      cases: previous.cases.some((item) => item.id === result.case.id)
        ? previous.cases.map((item) =>
            item.id === result.case.id ? result.case : item,
          )
        : [...previous.cases, result.case],
    }));
    return result.case;
  }
  async function toggleCase(item) {
    try {
      await updateCase({ ...item, enabled: !item.enabled });
    } catch (reason) {
      setError(reason.message);
    }
  }
  async function archiveCase(item, restore = false) {
    setSaving(true);
    try {
      const result = await request(restore ? "restore" : "archive", {
        caseId: item.id,
      });
      setData((previous) => ({
        ...previous,
        cases: previous.cases.map((row) =>
          row.id === item.id ? result.case : row,
        ),
      }));
      setEditor(null);
      setNotice(
        restore
          ? "Question restored."
          : "Question deleted from the active list. Restore it from Deleted questions; its references and run history are preserved.",
      );
      if (!restore)
        setSelected(
          cases.find((row) => row.id !== item.id && !row.archivedAt)?.id ||
            item.id,
        );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  function edit(item) {
    setEditor(
      item
        ? {
            ...item,
            keywords: (item.expected.requiredText || [])
              .map((value) =>
                typeof value === "object"
                  ? value.anyOf.join(" | ")
                  : String(value),
              )
              .join("\n"),
          }
        : {
            question: "",
            expectedAnswer: "",
            route: "/",
            scope: "public",
            enabled: true,
            keywords: "",
          },
    );
  }
  async function saveEditor(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const value = { ...editor };
      // Unchanged imported rule contracts retain their alternatives and other checks.
      const original = cases.find((item) => item.id === editor.id),
        originalText = original
          ? (original.expected.requiredText || [])
              .map((value) =>
                typeof value === "object"
                  ? value.anyOf.join(" | ")
                  : String(value),
              )
              .join("\n")
          : "";
      if (editor.keywords === originalText && original) delete value.keywords;
      else
        value.keywords = editor.keywords
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean);
      const saved = await updateCase(value);
      setSelected(saved.id);
      setHistoryId("");
      setEditor(null);
      setNotice(
        "Reference saved. Earlier runs keep the reference they were evaluated against.",
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  async function evaluateRun(value, signal) {
    setJudging(true);
    try {
      const result = await request(
        "judge",
        { runId: value.id, model: evaluatorModel, reasoning },
        signal,
      );
      setData((previous) => ({
        ...previous,
        runs: previous.runs.map((item) =>
          item.id === value.id
            ? {
                ...item,
                judge: result.judge,
                judgeHistory: [
                  ...(item.judgeHistory || (item.judge ? [item.judge] : [])),
                  result.judge,
                ],
              }
            : item,
        ),
      }));
    } catch (error) {
      try {
        setData(await request("state"));
      } catch {}
      throw error;
    } finally {
      setJudging(false);
    }
  }
  async function execute(ids) {
    if (busy || judging) return;
    setError("");
    setNotice("");
    setBusy(true);
    setHistoryId("");
    const controller = new AbortController();
    abort.current = controller;
    const batchId = crypto.randomUUID();
    let count = 0;
    try {
      for (const id of ids) {
        if (controller.signal.aborted) break;
        const item = cases.find((value) => value.id === id);
        if (!item || item.archivedAt) continue;
        current.current = id;
        setSelected(id);
        setLive([]);
        setProgress({
          done: count,
          total: ids.length,
          question: item.question,
        });
        const delay = Math.max(0, lastDispatch.current + 5200 - Date.now());
        if (delay)
          await new Promise((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, delay);
            controller.signal.addEventListener("abort", finish, { once: true });
          });
        if (controller.signal.aborted) break;
        lastDispatch.current = Date.now();
        const start = performance.now();
        let body = {},
          statusCode = 0,
          runError = null;
        try {
          const auth = await affairsClient?.auth.getSession();
          const signed = auth?.data.session;
          if ((hosted || item.scope === "account") && !signed)
            throw new Error(
              "Not run: sign in to School Affairs to test your account.",
            );
          const images = await Promise.all(
            (item.attachments || []).map(async (file) => {
              const image = await fetch(attachmentUrl(file), {
                signal: controller.signal,
              });
              if (!image.ok)
                throw new Error("A saved image could not be loaded.");
              return {
                name: file.name,
                dataUrl: await imageData(await image.blob()),
              };
            }),
          );
          const response = await fetch(
            hosted
              ? apiUrl(item.scope === "account" ? "run-account" : "run-public")
              : item.endpoint,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-STU-Evaluation-Model": model,
                "X-STU-Evaluation-Reasoning": reasoning,
                ...(hosted || item.scope === "account"
                  ? { Authorization: "Bearer " + signed.access_token }
                  : {}),
              },
              body: JSON.stringify({
                question: item.question,
                route: item.route,
                history: item.history || [],
                images,
                stream: true,
                consentedResearchUse: false,
              }),
              signal: controller.signal,
            },
          );
          statusCode = response.status;
          if (
            response.ok &&
            response.headers.get("X-STU-Evaluation-Model") !== model
          )
            throw new Error("The API did not acknowledge the selected model.");
          body = await readAssistantReply(response, (step) =>
            setLive((previous) => {
              const next = previous.filter((item) => item.kind !== step.kind);
              return [...next, step];
            }),
          );
          if (!response.ok)
            runError = body.error || "The assistant request failed.";
        } catch (reason) {
          runError = controller.signal.aborted
            ? "Cancelled by you."
            : reason.message;
        }
        const result = await request("result", {
          caseId: item.id,
          caseVersion: item.version,
          batchId,
          response: body,
          statusCode,
          model,
          reasoning,
          elapsedMs: Math.round(performance.now() - start),
          error: runError,
        });
        setData((previous) => ({
          ...previous,
          runs: [...previous.runs, result.run],
        }));
        count++;
        setProgress((previous) => ({ ...previous, done: count }));
        if (statusCode === 429) {
          setNotice(
            "Batch stopped at the request limit. Completed answers are saved; wait before rerunning the remaining questions.",
          );
          break;
        }
        if (
          autoJudge &&
          !runError &&
          body.answer &&
          !controller.signal.aborted
        ) {
          try {
            await evaluateRun(result.run, controller.signal);
          } catch (reason) {
            if (!controller.signal.aborted)
              setNotice("Answer saved. " + reason.message);
          }
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason.message);
    } finally {
      setBusy(false);
      setLive([]);
      current.current = null;
      abort.current = null;
      setProgress(null);
    }
  }
  function exportReport() {
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), ...data },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "stu-answer-lab-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  if (!data)
    return (
      <main className="loading">
        <FlaskConical size={28} />
        <p>{error || "Opening Answer Lab…"}</p>
        {error && (
          <>
            <a
              className="button primary"
              href="/school-affairs/login"
              target="_blank"
              rel="noreferrer"
            >
              Sign in to School Affairs
            </a>
            <button className="button" onClick={() => location.reload()}>
              Reload after signing in
            </button>
          </>
        )}
      </main>
    );
  return (
    <div className={"lab " + (!sidebar ? "rail-hidden" : "")}>
      <header className="topbar">
        <a className="brand" href="/evaluation-lab">
          <span className="brand-icon">
            <FlaskConical size={21} />
          </span>
          <span>
            STU <b>Answer Lab</b>
          </span>
          <span className="local-tag">
            {hosted ? "SHARED ADMIN WORKSPACE" : "LOCAL WORKSPACE"}
          </span>
        </a>
        <div className="top-actions">
          {hosted && (
            <button
              className="button"
              disabled={busy || judging || saving || Boolean(editor)}
              onClick={() => void refreshWorkspace()}
            >
              <RefreshCw size={15} /> Refresh shared data
            </button>
          )}
          <span className="model">
            <span className="dot" />
            {model || data.model}
          </span>
          <a
            href="/school-affairs/login"
            target="_blank"
            rel="noreferrer"
            className="account"
          >
            {session ? session.user.email : "Sign in to School Affairs"}
            <ArrowUpRight size={14} />
          </a>
        </div>
      </header>
      <aside className="sidebar">
        <div className="rail-heading">
          <span>QUESTION LIBRARY</span>
          <button
            className="icon-button"
            aria-label="Add a question"
            onClick={() => edit(null)}
            disabled={busy}
          >
            <Plus size={18} />
          </button>
        </div>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search questions"
            placeholder="Search questions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌕</kbd>
        </label>
        <div className="filter-row">
          <SlidersHorizontal size={14} />
          <select
            aria-label="Filter questions"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All questions · {cases.length}</option>
            <option value="unrun">Not run yet</option>
            <option value="review">Needs review</option>
            <option value="account">Signed-in questions</option>
            <option value="archived">Deleted questions</option>
          </select>
        </div>
        <div className="question-list">
          {domains.map((domain) => (
            <details key={domain} open>
              <summary>
                {domain.replaceAll("-", " ")}
                <span>
                  {visible.filter((item) => item.domain === domain).length}
                </span>
              </summary>
              {visible
                .filter((item) => item.domain === domain)
                .map((item, index) => {
                  const latestRun = latest.get(item.id);
                  return (
                    <div
                      className={
                        "question-row " +
                        (selected === item.id ? "selected" : "")
                      }
                      key={item.id}
                    >
                      <input
                        type="checkbox"
                        aria-label={"Include " + item.question + " in batch"}
                        checked={item.enabled}
                        disabled={busy || judging || saving}
                        onChange={() => void toggleCase(item)}
                      />
                      <button
                        onClick={() => {
                          setSelected(item.id);
                          setHistoryId("");
                          setTab("review");
                        }}
                      >
                        <span className="question-title">{item.question}</span>
                        <span className="route-caption">{item.route}</span>
                        <span className="question-meta">
                          {item.scope === "account"
                            ? "Account required"
                            : "Public"}
                          <span className={scoreClass(latestRun?.matchScore)}>
                            {latestRun
                              ? latestRun.matchScore === null
                                ? scoreLabel(latestRun)
                                : latestRun.matchScore + "%"
                              : "Not run"}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
            </details>
          ))}
          {!visible.length && (
            <p className="no-matches">No matching questions.</p>
          )}
        </div>
        <div className="rail-bottom">
          <ShieldCheck size={16} />
          <span>
            {hosted
              ? "Both Answer Lab administrators share this question library and run history."
              : "Answers and references stay in this local workspace."}
          </span>
        </div>
      </aside>
      <main className="workspace">
        <div className="workspace-heading">
          <div className="breadcrumb">
            <button
              className="icon-button"
              aria-label="Toggle question sidebar"
              onClick={() => setSidebar((value) => !value)}
            >
              {sidebar ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            Evaluation workspace
            <ChevronRight size={13} />
            <span>Answer comparison</span>
          </div>
          <button className="button subtle" onClick={exportReport}>
            <Download size={15} />
            Export results
          </button>
        </div>
        <section className="intro">
          <div>
            <span className="eyebrow">ASSISTANT QUALITY, IN PLAIN SIGHT</span>
            <h1>See how well it answers.</h1>
            <p>Ask. Compare. Understand what needs to improve.</p>
          </div>
          <div className="batch-controls">
            <label className="judge-toggle">
              <input
                type="checkbox"
                checked={autoJudge}
                disabled={busy || judging || saving}
                onChange={(event) => setAutoJudge(event.target.checked)}
              />
              AI review after each answer
            </label>
            <div>
              {busy ? (
                <button
                  className="button danger"
                  onClick={() => abort.current?.abort()}
                >
                  <Square size={14} />
                  Stop run
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={judging || saving || !enabled.length}
                  onClick={() => void execute(enabled.map((item) => item.id))}
                >
                  <Play size={15} fill="currentColor" />
                  Run enabled <span>{enabled.length}</span>
                </button>
              )}
            </div>
            <small>
              {autoJudge
                ? "Each case calls the agent and a separate AI reviewer."
                : "Real agent calls, paced to respect request limits."}
            </small>
          </div>
        </section>
        <section className="model-settings">
          <label>
            Agent model
            <select
              aria-label="Agent model"
              value={model}
              disabled={busy || judging || modelsLoading || saving}
              onChange={(event) => setModel(event.target.value)}
            >
              {[...new Set([model, ...models])].filter(Boolean).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Evaluator model
            <select
              aria-label="Evaluator model"
              value={evaluatorModel}
              disabled={busy || judging || modelsLoading || saving}
              onChange={(event) => setEvaluatorModel(event.target.value)}
            >
              {[...new Set([evaluatorModel, ...models])]
                .filter(Boolean)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Reasoning
            <select
              aria-label="Reasoning effort"
              value={reasoning}
              disabled={busy || judging || saving}
              onChange={(event) => setReasoning(event.target.value)}
            >
              <option value="low">Low · faster</option>
              <option value="medium">Medium · balanced</option>
              <option value="high">High · more deliberation</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Refresh available models"
            disabled={modelsLoading || busy || judging}
            onClick={() => void loadModels()}
          >
            <RefreshCw size={16} className={modelsLoading ? "spin" : ""} />
          </button>
          <p>
            Model choices are saved with each run. Switching models never
            replaces an earlier answer.
          </p>
        </section>
        <section className="stats">
          <div>
            <span>Questions</span>
            <strong>
              {cases.length}
              <small>{enabled.length} enabled</small>
            </strong>
          </div>
          <div>
            <span>Evaluated</span>
            <strong>
              {completed.length}
              <small>of {cases.length}</small>
            </strong>
          </div>
          <div>
            <span>Contract passed</span>
            <strong>
              {passed.length}
              <small>
                {completed.length
                  ? Math.round((100 * passed.length) / completed.length) +
                    "% of evaluated"
                  : "No runs yet"}
              </small>
            </strong>
          </div>
          <div>
            <span>Average rule match</span>
            <strong>
              {average === null ? "—" : average + "%"}
              <small>
                {scored.length
                  ? "Across scored latest runs"
                  : "Run a question to begin"}
              </small>
            </strong>
          </div>
        </section>
        {progress && (
          <div className="batch-progress" role="status">
            <LoaderCircle className="spin" size={16} />
            <span>
              {progress.done} / {progress.total} completed
            </span>
            <div>
              <i
                style={{ width: (100 * progress.done) / progress.total + "%" }}
              />
            </div>
            <span className="progress-question">{progress.question}</span>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert notice" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {row && (
          <>
            <section className="case-heading">
              <div>
                <div className="case-tags">
                  <span className="pill">
                    {row.domain.replaceAll("-", " ")}
                  </span>
                  <span>
                    {row.scope === "account"
                      ? "Signed-in account"
                      : "Public information"}
                  </span>
                  <span className="case-id">{row.id}</span>
                </div>
                <h2>{row.question}</h2>
                {row.archivedAt && (
                  <div className="archived-note">
                    Deleted · runs and attachments are preserved.{" "}
                    <button
                      className="text-button"
                      disabled={busy || judging || saving}
                      onClick={() => void archiveCase(row, true)}
                    >
                      Restore question
                    </button>
                  </div>
                )}
                <a
                  href={row.route}
                  target="_blank"
                  rel="noreferrer"
                  className="route"
                >
                  {row.route}
                  <ArrowUpRight size={12} />
                </a>
              </div>
              <button
                className="button primary outline"
                disabled={busy || judging || saving || Boolean(row.archivedAt)}
                onClick={() => void execute([row.id])}
              >
                <RefreshCw size={15} />
                Run this question
              </button>
            </section>
            <div className="attachment-controls">
              <input
                ref={attachmentInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={(event) => void uploadImage(event)}
              />
              <button
                className="button"
                disabled={
                  busy ||
                  judging ||
                  saving ||
                  (row.attachments || []).length >= 2
                }
                onClick={() => attachmentInput.current?.click()}
              >
                <Paperclip size={14} />
                {saving ? "Saving…" : "Attach image"}
              </button>
              <span>PNG, JPEG or WebP · 1.5 MB each · up to 2</span>
              {row.attachments?.map((file) => (
                <div className="attachment-chip" key={file.id}>
                  <img src={attachmentUrl(file)} alt={file.name} />
                  <a href={attachmentUrl(file)} download={file.name}>
                    {file.name}
                  </a>
                  <button
                    disabled={busy || judging || saving}
                    aria-label={"Remove " + file.name}
                    onClick={() => void removeImage(file)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <nav className="tabs">
              <button
                className={tab === "review" ? "active" : ""}
                onClick={() => setTab("review")}
              >
                <FileText size={15} />
                Comparison
              </button>
              <button
                className={tab === "history" ? "active" : ""}
                onClick={() => setTab("history")}
              >
                <History size={15} />
                Run history <span>{caseRuns.length}</span>
              </button>
              <span className="tab-end">
                {run
                  ? "Last run " + time(run.createdAt)
                  : "Ready for its first run"}
              </span>
            </nav>
            {tab === "history" ? (
              <section className="history-panel">
                <h3>Every run, preserved.</h3>
                <p>
                  Rerunning creates a new result. It never overwrites an earlier
                  answer.
                </p>
                {caseRuns.length ? (
                  <div className="history-list">
                    {caseRuns.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setHistoryId(item.id);
                          setTab("review");
                        }}
                      >
                        <span>
                          <strong>{time(item.createdAt)}</strong>
                          <small>
                            {item.model} · {item.reasoning || "default"}{" "}
                            reasoning · {Math.round(item.elapsedMs / 100) / 10}s
                            · revision {item.revision}
                          </small>
                        </span>
                        <span
                          className={"score " + scoreClass(item.matchScore)}
                        >
                          {item.matchScore === null
                            ? "Unscored"
                            : item.matchScore + "%"}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <History size={25} />
                    <h3>No runs yet</h3>
                    <p>Your first generated answer will appear here.</p>
                  </div>
                )}
              </section>
            ) : (
              <>
                <div className="comparison">
                  <section className="answer-card expected">
                    <div className="card-heading">
                      <div>
                        <span className="card-icon">
                          <CheckCircle2 size={17} />
                        </span>
                        <h3>Expected answer</h3>
                        <span className="reference-tag">REFERENCE</span>
                      </div>
                      <button
                        className="text-button"
                        disabled={busy || judging || saving}
                        onClick={() => edit(row)}
                      >
                        Edit question & answer
                      </button>
                    </div>
                    <div className="answer-body">
                      <ReactMarkdown>
                        {(run && run.caseVersion !== row.version
                          ? run.expectedAnswer
                          : row.expectedAnswer) ||
                          "Add a reference answer before requesting an AI review."}
                      </ReactMarkdown>
                    </div>
                    <footer>
                      <ShieldCheck size={14} />
                      {row.referenceOrigin}
                    </footer>
                  </section>
                  <section className="answer-card actual">
                    <div className="card-heading">
                      <div>
                        <span className="card-icon">
                          <FlaskConical size={17} />
                        </span>
                        <h3>Chatbot answer</h3>
                      </div>
                      {run && (
                        <span
                          className={
                            "status-label " + scoreClass(run.matchScore)
                          }
                        >
                          {scoreLabel(run)}
                        </span>
                      )}
                    </div>
                    <div className="chat-user">
                      <span>You</span>
                      <p>
                        {run && run.caseVersion !== row.version
                          ? run.question
                          : row.question}
                      </p>
                      {(run && run.caseVersion !== row.version
                        ? run.attachments
                        : row.attachments
                      )?.map((file) => (
                        <a
                          key={file.id}
                          href={attachmentUrl(file)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={attachmentUrl(file)} alt={file.name} />
                          <small>{file.name}</small>
                        </a>
                      ))}
                    </div>
                    {busy && current.current === row.id ? (
                      <div className="running-state">
                        <LoaderCircle className="spin" size={25} />
                        <h3>The agent is working</h3>
                        <p>
                          Live tool activity appears below. This is a new
                          request.
                        </p>
                        <div className="chat-activity">
                          <ActivityTimeline
                            message={{
                              id: "running",
                              role: "assistant",
                              content: "",
                              phase: "working",
                              activity: live,
                            }}
                          />
                        </div>
                      </div>
                    ) : run ? (
                      <>
                        <div className="answer-body">
                          {run.error && (
                            <div className="inline-error">
                              <AlertCircle size={16} />
                              {run.error}
                            </div>
                          )}
                          {run.response.answer ? (
                            <div className="chat-assistant">
                              <span className="chat-role">Assistant</span>
                              <AssistantMarkdown>
                                {run.response.answer}
                              </AssistantMarkdown>
                              <AnswerExtras result={run.response} />
                              <div className="chat-activity">
                                <ActivityTimeline
                                  message={{
                                    id: run.id,
                                    role: "assistant",
                                    content: run.response.answer,
                                    phase: "complete",
                                    activity: run.response.activity || [],
                                    result: run.response,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="muted">
                              No answer was generated in this run.
                            </p>
                          )}
                        </div>
                        <footer>
                          <Clock3 size={14} />
                          {(run.elapsedMs / 1000).toFixed(1)}s<span>·</span>
                          {run.response.grounding?.source === "conversation"
                            ? `Conversation reply · selected ${run.model}`
                            : `Selected ${run.model}`}
                          <span>·</span>HTTP {run.statusCode || "—"}
                        </footer>
                      </>
                    ) : (
                      <div className="empty">
                        <span className="empty-symbol">
                          <FlaskConical size={27} />
                        </span>
                        <h3>A fresh answer belongs here.</h3>
                        <p>
                          Run this question to see how the current agent
                          responds, then compare it with the reference.
                        </p>
                        <button
                          className="button"
                          disabled={busy || judging || saving}
                          onClick={() => void execute([row.id])}
                        >
                          <Play size={14} />
                          Generate answer
                        </button>
                      </div>
                    )}
                  </section>
                </div>
                {run && run.caseVersion !== row.version && (
                  <div className="alert notice">
                    <History size={16} />
                    This run uses reference version {run.caseVersion}; the
                    current reference is version {row.version}. Rerun for a
                    current comparison.
                  </div>
                )}
                <section className="review-panel">
                  <div className="review-heading">
                    <div>
                      <h3>Evaluation</h3>
                      <p>
                        Rule coverage and semantic review are separate
                        measurements.
                      </p>
                    </div>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        judging ||
                        !run?.response.answer ||
                        Boolean(run?.error)
                      }
                      onClick={() =>
                        void evaluateRun(run).catch((reason) =>
                          setError(reason.message),
                        )
                      }
                    >
                      {judging ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <FlaskConical size={15} />
                      )}{" "}
                      {run?.judge ? "Evaluate again" : "Run AI evaluator"}
                    </button>
                  </div>
                  <div className="review-content">
                    <div className="rule-score">
                      <span className="eyebrow">RULE MATCH</span>
                      <strong className={scoreClass(run?.matchScore)}>
                        {run?.matchScore === null || !run
                          ? "—"
                          : run.matchScore + "%"}
                        <small>
                          {run?.matchScore === null
                            ? "No content score"
                            : run?.grade.passed
                              ? "Contract passed"
                              : run
                                ? "Needs review"
                                : "Not evaluated"}
                        </small>
                      </strong>
                      <p>
                        Share of applicable content checks met. This is not a
                        probability that the answer is correct.
                      </p>
                    </div>
                    <div className="rule-checks">
                      {run ? (
                        run.grade.checks.map((check) => (
                          <div
                            key={check.id}
                            className={
                              check.passed ? "check-pass" : "check-fail"
                            }
                          >
                            {check.passed ? (
                              <CheckCircle2 size={15} />
                            ) : (
                              <AlertCircle size={15} />
                            )}
                            <span>
                              <strong>{check.id.replaceAll(".", " / ")}</strong>
                              <small>{check.detail}</small>
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Generate an answer to inspect its exact checks.
                        </p>
                      )}
                    </div>
                    <div className="judge-panel">
                      <span className="eyebrow">AI EVALUATOR</span>
                      {run?.judge ? (
                        <>
                          <strong
                            className={
                              "judge-score " + scoreClass(run.judge.score)
                            }
                          >
                            {run.judge.score}
                            <small>/ 100</small>
                          </strong>
                          <p>{run.judge.summary}</p>
                          <div className="dimensions">
                            {[
                              "correctness",
                              "completeness",
                              "relevance",
                              "communication",
                            ].map((name) => (
                              <div key={name}>
                                <span>{name}</span>
                                <b>{run.judge[name]} / 5</b>
                              </div>
                            ))}
                          </div>
                          {run.judge.gaps.length > 0 && (
                            <>
                              <h4>What to improve</h4>
                              <ul>
                                {run.judge.gaps.map((gap, index) => (
                                  <li key={index}>{gap}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          <small className="muted">
                            {run.judge.model} ·{" "}
                            {run.judge.reasoning || "default"} reasoning · Model
                            opinion against the supplied reference, not
                            independent source verification.
                          </small>
                        </>
                      ) : (
                        <>
                          <div className="judge-empty">
                            <FlaskConical size={22} />
                            <h4>A second perspective.</h4>
                            <p>
                              The evaluator rates meaning, completeness and
                              clarity against your reference. It uses a separate
                              model request.
                            </p>
                          </div>
                        </>
                      )}
                      {run?.judgeHistory?.length > 0 && (
                        <details className="judge-history">
                          <summary>
                            Evaluator history · {run.judgeHistory.length}{" "}
                            reviews
                          </summary>
                          {run.judgeHistory.map((review, index) => (
                            <article key={index}>
                              <strong>
                                {review.model} ·{" "}
                                {review.score === undefined
                                  ? "Unavailable"
                                  : review.score + "/100"}
                              </strong>
                              <small>
                                {time(review.createdAt)} ·{" "}
                                {review.reasoning || "default"} reasoning
                              </small>
                              <p>{review.summary || review.error}</p>
                            </article>
                          ))}
                        </details>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>
            <span className="dot" />{" "}
            {hosted ? "Connected to hosted agent" : "Connected to local agent"}{" "}
            · {data.revision}
          </span>
          <span>
            {hosted
              ? "Saved to the shared Answer Lab workspace for both administrators."
              : "Stored locally, including attachment files."}{" "}
            No actions are confirmed here. Runs may call online model and
            database services.
          </span>
        </footer>
      </main>
      {editor && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving)
              setEditor(null);
          }}
        >
          <section
            className="editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <div className="editor-heading">
              <div>
                <span className="eyebrow">QUESTION LIBRARY</span>
                <h2 id="editor-title">
                  {editor.id ? "Edit question & answer" : "Add a question"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close editor"
                onClick={() => setEditor(null)}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveEditor}>
              <label>
                Question
                <textarea
                  autoFocus
                  required
                  maxLength={2000}
                  rows={2}
                  value={editor.question}
                  onChange={(event) =>
                    setEditor({ ...editor, question: event.target.value })
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  Page context
                  <input
                    required
                    value={editor.route}
                    onChange={(event) =>
                      setEditor({ ...editor, route: event.target.value })
                    }
                  />
                </label>
                <label>
                  Session
                  <select
                    value={editor.scope}
                    onChange={(event) =>
                      setEditor({ ...editor, scope: event.target.value })
                    }
                  >
                    <option value="public">Public / signed out</option>
                    <option value="account">Signed-in account</option>
                  </select>
                </label>
              </div>
              <label>
                Expected answer
                <textarea
                  required
                  maxLength={16000}
                  rows={6}
                  value={editor.expectedAnswer}
                  onChange={(event) =>
                    setEditor({ ...editor, expectedAnswer: event.target.value })
                  }
                />
                <small>
                  Describe what a useful and accurate answer must contain. The
                  AI evaluator uses this reference.
                </small>
              </label>
              <label>
                Required phrases
                <textarea
                  rows={3}
                  value={editor.keywords}
                  onChange={(event) =>
                    setEditor({ ...editor, keywords: event.target.value })
                  }
                />
                <small>
                  One per line. Leave empty for AI-review-only cases. These are
                  deterministic checks, not semantic similarity. Imported
                  alternatives remain intact when unchanged.
                </small>
              </label>
              <label className="inline-label">
                <input
                  type="checkbox"
                  checked={editor.enabled}
                  onChange={(event) =>
                    setEditor({ ...editor, enabled: event.target.checked })
                  }
                />
                Include in “Run enabled”
              </label>
              <div className="editor-footer">
                {editor.id && (
                  <button
                    type="button"
                    className="button danger archive-button"
                    disabled={saving}
                    onClick={() =>
                      void archiveCase(editor, Boolean(editor.archivedAt))
                    }
                  >
                    {editor.archivedAt ? "Restore question" : "Delete question"}
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={saving}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={saving}>
                  {saving ? "Saving…" : "Save question & answer"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("evaluation-root")).render(<App />);
