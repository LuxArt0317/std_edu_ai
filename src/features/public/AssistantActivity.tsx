import {useEffect,useRef,type MouseEvent} from "react";
import { ChevronDown, LoaderCircle, Check, CircleAlert } from "lucide-react";
import type { AssistantProgress } from "../../services/researchAssistant";
import type { AssistantMessage as Message } from "../../services/assistantConversation";
import {
  assistantActivityStatus,
  assistantActivityTimeline,
} from "./assistantActivityTimeline";

export function ActivityTimeline({ message }: { message: Message }) {
  const disclosure=useRef<HTMLDetailsElement>(null);
  const motion=useRef<Animation|null>(null);
  const targetOpen=useRef(false);
  useEffect(()=>()=>motion.current?.cancel(),[]);
  function toggleActivity(event:MouseEvent<HTMLElement>){
    const panel=disclosure.current;if(!panel)return;
    event.preventDefault();
    const opening=motion.current?!targetOpen.current:!panel.open;
    const start=panel.getBoundingClientRect().height;
    motion.current?.cancel();motion.current=null;targetOpen.current=opening;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||typeof panel.animate!=='function'){
      panel.style.overflow='';panel.open=opening;return;
    }
    panel.open=true;
    const summary=panel.querySelector('summary')!;
    const border=panel.offsetHeight-panel.clientHeight;
    const end=opening?panel.getBoundingClientRect().height:summary.getBoundingClientRect().height+border;
    panel.style.overflow='hidden';
    const animation=panel.animate({height:[start+'px',end+'px']},{duration:220,easing:'cubic-bezier(0.2, 0, 0, 1)'});
    motion.current=animation;
    animation.onfinish=()=>{if(motion.current!==animation)return;panel.open=opening;panel.style.overflow='';motion.current=null;};
  }
  const fallback: AssistantProgress[] =
    message.result?.grounding?.source === "web"
      ? [
          {
            kind: "web",
            label: "Used public web sources",
            detail: "Open the linked sources below to check the answer.",
            status: "complete",
          },
        ]
      : message.result?.grounding?.source === "knowledge"
        ? [
            {
              kind: "knowledge",
              label: "Used managed school knowledge",
              detail: "Reviewed sources are linked below when available.",
              status: "complete",
            },
          ]
        : [];
  const observed = message.activity?.length
    ? message.activity
    : message.result?.activity?.length
      ? message.result.activity
      : fallback;
  const steps = assistantActivityTimeline(observed);
  if (!steps.length && message.phase !== "working" && !message.result)
    return null;
  const working = message.phase === "working";
  const activeLabel = working
    ? steps.findLast((step) => step.status === "running")?.label
    : undefined;
  const sources = message.result?.citations?.length || 0;
  return (
    <details
      ref={disclosure}
      aria-label={working ? "Assistant activity" : undefined}
      className="group rounded-lg border border-border/80 bg-muted/35 text-xs"
    >
      <summary onClick={toggleActivity} className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 font-medium text-foreground marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-background px-2 py-0.5 font-semibold">
            {working?<><LoaderCircle className="inline size-3 animate-spin" aria-hidden="true"/> Thinking…</>:"Activity"}
          </span>
          <span className="truncate text-muted-foreground" role={working?"status":undefined} aria-live={working?"polite":undefined}>
            {working
              ? activeLabel || "Working on your question"
              : message.phase === "error"
                ? "Stopped before completion"
                : `${steps.length} ${steps.length === 1 ? "step" : "steps"}${sources ? ` · ${sources} ${sources === 1 ? "source" : "sources"}` : ""}`}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
        />
      </summary>
      <div className="border-t px-3 pb-3 pt-2">
        {steps.length ? (
          <ol className="space-y-0" aria-label="Observed assistant steps">
            {steps.map((step, index) => (
              <li
                key={`${step.kind}-${index}`}
                className="relative flex min-w-0 gap-2.5 pb-3 last:pb-0"
              >
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-primary"
                  aria-hidden="true"
                >
                  {step.status === "running" ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : step.status === "complete" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <CircleAlert className="size-3.5 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="sr-only">
                    {assistantActivityStatus(step)}:{" "}
                  </span>
                  <strong className="block font-medium text-foreground">
                    {step.label}
                  </strong>
                  <span className="block break-words leading-relaxed text-muted-foreground">
                    {step.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">
            {working
              ? "Connecting to the assistant…"
              : "No checks or tools were reported for this answer."}
          </p>
        )}
        <p className="mt-2 border-t pt-2 leading-relaxed text-muted-foreground">
          Activity shows the searches, source reads and checks reported by the
          assistant.
        </p>
      </div>
    </details>
  );
}
