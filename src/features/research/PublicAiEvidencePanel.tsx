import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmUser } from "../crm/authService";
import { supabase } from "../../utils/supabase";

type Trace = {
  query_id: string;
  created_at: string;
  language: string;
  terminal_state: string;
  latency_ms: number;
  retrieval_count: number;
  citation_count: number;
  helpful: boolean | null;
  resolved_need: boolean | null;
  correction_category: string | null;
};

const permittedRoles = new Set(["owner", "admin", "librarian"]);

export function PublicAiEvidencePanel({
  currentUser,
  onMessage,
}: {
  currentUser?: CrmUser;
  onMessage: (message: string) => void;
}) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [busy, setBusy] = useState(false);
  const allowed = Boolean(currentUser && permittedRoles.has(currentUser.role));
  const load = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.rpc("public_ai_trace_report", { p_days: 30 });
    if (result.error) throw result.error;
    setTraces((result.data || []) as Trace[]);
  }, []);
  useEffect(() => {
    if (!allowed) return;
    void load().catch((error) =>
      onMessage(
        error instanceof Error
          ? error.message
          : "AI evidence could not be loaded.",
      ),
    );
  }, [allowed, load, onMessage]);
  const metrics = useMemo(() => {
    const answered = traces.filter(
      (item) => item.terminal_state === "answered",
    );
    const cited = answered.filter((item) => item.citation_count > 0).length;
    const feedback = traces.filter((item) => item.helpful !== null);
    const latencies = traces
      .map((item) => item.latency_ms)
      .sort((a, b) => a - b);
    return {
      answered: answered.length,
      groundedRate: answered.length
        ? Math.round((cited / answered.length) * 100)
        : 0,
      handoffs: traces.filter((item) => item.terminal_state === "handoff")
        .length,
      feedback: feedback.length,
      helpfulRate: feedback.length
        ? Math.round(
            (feedback.filter((item) => item.helpful).length / feedback.length) *
              100,
          )
        : 0,
      p95: latencies.length
        ? latencies[
            Math.min(
              latencies.length - 1,
              Math.ceil(latencies.length * 0.95) - 1,
            )
          ]
        : 0,
    };
  }, [traces]);
  if (!allowed) return null;
  return (
    <section className="public-ai-evidence">
      <header>
        <div>
          <h3>Assistant responses</h3>
          <p>
            Privacy-safe 30-day traces. Questions, IP addresses, user agents,
            and provider payloads are never displayed or stored.
          </p>
        </div>
        <Button variant="outline"
          type="button"
          disabled={busy}
          onClick={() =>
            void (async () => {
              setBusy(true);
              try {
                await load();
              } catch (error) {
                onMessage(
                  error instanceof Error ? error.message : "Refresh failed.",
                );
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </header>
      <div className="public-ai-evidence-grid">
        <Card>
          <span>Traces</span>
          <strong>{traces.length}</strong>
        </Card>
        <Card>
          <span>Answered</span>
          <strong>{metrics.answered}</strong>
        </Card>
        <Card>
          <span>Answered with citations</span>
          <strong>{metrics.groundedRate}%</strong>
        </Card>
        <Card>
          <span>Safe handoffs</span>
          <strong>{metrics.handoffs}</strong>
        </Card>
        <Card>
          <span>Feedback</span>
          <strong>{metrics.feedback}</strong>
        </Card>
        <Card>
          <span>Helpful</span>
          <strong>{metrics.helpfulRate}%</strong>
        </Card>
        <Card>
          <span>p95 latency</span>
          <strong>{metrics.p95} ms</strong>
        </Card>
      </div>
      <details>
        <summary>Recent activity</summary>
        {traces.length ? (
          <ul>
            {traces.slice(0, 20).map((trace) => (
              <li key={trace.query_id}>
                <span>
                  {new Date(trace.created_at).toLocaleString()} ·{" "}
                  {trace.language}
                </span>
                <strong>{trace.terminal_state}</strong>
                <small>
                  {trace.retrieval_count} retrieved · {trace.citation_count}{" "}
                  cited · {trace.latency_ms} ms
                  {trace.correction_category
                    ? ` · ${trace.correction_category.replaceAll("_", " ")}`
                    : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No assistant activity in this period.</p>
        )}
      </details>
    </section>
  );
}
