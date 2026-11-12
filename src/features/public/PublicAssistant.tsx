import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RotateCcw, Paperclip, X, Check, LoaderCircle, CircleAlert, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  askCampusAssistant,
  type AssistantProgress,
} from "../../services/researchAssistant";
import { useAffairsAuth } from "./affairs/authContext";
import { askSchoolAffairsAssistant } from "../../services/schoolAffairsAssistant";
import { performSchoolAffairsAction } from "../../services/schoolAffairsWorkspace";
import { PublicAssistantFeedback } from "./PublicAssistantFeedback";
import { AssistantMarkdown } from "../school/portal/AssistantMarkdown";
import { finishAssistantActivity, mergeAssistantActivity, type AssistantMessage } from "../../services/assistantConversation";
import {useAssistantSessions} from './useAssistantSessions';

type Message = AssistantMessage;
function ActivityTimeline({message}:{message:Message}) {
  const fallback: AssistantProgress[] = message.result?.grounding?.source === 'web'
    ? [{kind:'web',label:'Used public web sources',detail:'Open the linked sources below to check the answer.',status:'complete'}]
    : message.result?.grounding?.source === 'knowledge'
      ? [{kind:'knowledge',label:'Used managed school knowledge',detail:'Reviewed sources are linked below when available.',status:'complete'}]
      : [];
  const steps = message.activity?.length ? message.activity : message.result?.activity?.length ? message.result.activity : fallback;
  if (!steps.length && message.phase !== 'working' && !message.result) return null;
  const working = message.phase === 'working';
  const sources = message.result?.citations?.length || 0;
  return <details key={`${message.id}-${message.phase}`} open={working} role={working?'status':undefined} aria-label={working?'Assistant activity':undefined} className="group rounded-lg border border-border/80 bg-muted/35 text-xs">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 font-medium text-foreground marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-2"><span className="rounded bg-background px-2 py-0.5 font-semibold">Activity</span><span className="truncate text-muted-foreground">{working ? 'Working on your question' : message.phase === 'error' ? 'Stopped before completion' : `${steps.length} ${steps.length===1?'step':'steps'}${sources?` · ${sources} ${sources===1?'source':'sources'}`:''}`}</span></span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t px-3 pb-3 pt-2">
      {steps.length ? <ol className="space-y-0" aria-label="Observed assistant steps">{steps.map((step,index)=><li key={`${step.kind}-${index}`} className="relative flex min-w-0 gap-2.5 pb-3 last:pb-0">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-primary" aria-hidden="true">{step.status==='running'?<LoaderCircle className="size-3.5 animate-spin"/>:step.status==='complete'?<Check className="size-3.5"/>:<CircleAlert className="size-3.5 text-muted-foreground"/>}</span>
        <span className="min-w-0"><span className="sr-only">{step.status === 'complete' ? 'Completed' : step.status === 'running' ? 'In progress' : 'Unavailable'}: </span><strong className="block font-medium text-foreground">{step.label}</strong><span className="block break-words leading-relaxed text-muted-foreground">{step.detail}</span></span>
      </li>)}</ol>:<p className="text-muted-foreground">{working ? 'Connecting to the assistant…' : 'No checks or tools were reported for this answer.'}</p>}
      <p className="mt-2 border-t pt-2 leading-relaxed text-muted-foreground">This lists observed checks and tools. It does not expose private model reasoning.</p>
    </div>
  </details>;
}
const questions = [
  "註冊課務組的聯絡電話？",
  "如何查詢課程？",
  "有哪些最新公告？",
  "What are my current subjects?",
  "What DTM materials do I have?",
];
export const campusAssistantOpenEvent = "stu-campus-assistant:open";

export function PublicAssistant({ initialOpen = false, embedded = false, showLauncher = true }: {
  initialOpen?: boolean;
  embedded?: boolean;
  showLauncher?: boolean;
}) {
  const {user,loading} = useAffairsAuth();
  const scope = loading ? null : user ? `account:${user.id}` : 'public';
  const sessions=useAssistantSessions(scope);
  const [open, setOpen] = useState(initialOpen),
    [query, setQuery] = useState(""),
    [images, setImages] = useState<Array<{name:string;dataUrl:string}>>([]),
    [busy, setBusy] = useState(false),
    [actionBusy, setActionBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const {messages,setMessages}=sessions;
  const viewport = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    pending = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(() => () => {pending.current?.abort();}, []);
  useEffect(() => {
    const openFromAccount = () => setOpen(true);
    window.addEventListener(campusAssistantOpenEvent, openFromAccount);
    return () => window.removeEventListener(campusAssistantOpenEvent, openFromAccount);
  }, []);
  useEffect(() => {
    sequence.current++;
    pending.current?.abort();
    setImages([]);
    setQuery("");
    setError("");
    setBusy(false);
  }, [scope,sessions.active?.id]);
  useEffect(() => {
    if (!embedded) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.parent.postMessage({ type: "stu-campus-assistant:close" }, window.location.origin);
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [embedded]);
  useEffect(() => {
    viewport.current?.scrollTo({
      top: viewport.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  async function send(text = query) {
    const attached = images;
    const question = text.trim() || (attached.length ? "Please explain the attached image." : "");
    if (!question || busy || !scope || !sessions.active || sessions.loadingChat) return;
    const request = ++sequence.current,
      controller = new AbortController();
    const turnId = window.crypto.randomUUID(), answerId = `a-${turnId}`;
    pending.current = controller;
    setMessages((old) => [
      ...old,
      { id: `u-${turnId}`, role: "user", content: question, images:attached },
      { id: answerId, role: "assistant", content: "", phase:'working', activity:[] },
    ]);
    setQuery("");
    setImages([]);
    setError("");
    setBusy(true);
    try {
      const result = await (user ? askSchoolAffairsAssistant : askCampusAssistant)(
        question,
        messages,
        controller.signal,
        attached,
        window.location.pathname,
        (step) => {
          if (request !== sequence.current || controller.signal.aborted) return;
          setMessages(old=>old.map(item=>item.id===answerId?{...item,activity:mergeAssistantActivity(item.activity,[step])}:item));
        },
      );
      if (request === sequence.current)
        setMessages(old=>old.map(item=>item.id===answerId?{...item,phase:'complete',content:result.answer,result,activity:finishAssistantActivity(mergeAssistantActivity(item.activity,result.activity))}:item));
    } catch (reason) {
      if (request === sequence.current && !controller.signal.aborted)
        setMessages(old=>old.map(item=>item.id===answerId?{...item,phase:'error',content:reason instanceof Error?reason.message:'Please try again.',activity:finishAssistantActivity(item.activity||[],true)}:item));
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const next = [...images];
    for (const file of Array.from(files)) {
      if (next.length >= 2) { setError("Attach up to two images per message."); break; }
      if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 1_500_000 || file.size < 32) {
        setError("Use PNG, JPEG or WebP images under 1.5 MB each."); continue;
      }
      try {
        const dataUrl = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Image could not be read"));reader.readAsDataURL(file);});
        next.push({name:file.name.slice(0,120),dataUrl});
      } catch { setError("That image could not be read. Please try another file."); }
    }
    setImages(next);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function applyAction(message:Message) {
    const action=message.result?.proposedAction;
    if (!action || actionBusy || !user) return;
    setActionBusy(message.id);
    setError("");
    try {
      const result=await performSchoolAffairsAction(action);
      setMessages(old=>old.map(item=>item.id===message.id?{
        ...item,
        content:`${item.content}\n\n✓ ${result.summary}. [View updated records](${action.url||'/school-affairs/records'}).`,
        result:item.result?{...item.result,proposedAction:undefined}:undefined,
        activity:mergeAssistantActivity(item.activity,[{kind:'action',label:'Updated your stu.best record',detail:result.summary,status:'complete'}]),
      }:item));
      window.dispatchEvent(new Event('school-affairs:updated'));
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'The action could not be completed. Please try again.');
    } finally {setActionBusy(null);}
  }
  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (embedded && !next) window.parent.postMessage({ type: "stu-campus-assistant:close" }, window.location.origin);
      else setOpen(next);
    }}>
      {showLauncher && <SheetTrigger asChild>
        <Button
          type="button"
          className="fixed right-4 bottom-4 z-40 gap-2 shadow-md"
          aria-label="開啟 AI 校園助理"
        >
          <MessageCircle aria-hidden="true" size={20} />
          <span>校園助理</span>
        </Button>
      </SheetTrigger>}
      <SheetContent
        className="w-full gap-0 p-0 sm:max-w-lg public-assistant-surface"
        aria-describedby="public-assistant-description"
        showCloseButton={!embedded}
        onCloseAutoFocus={(event) => {
          if (showLauncher) return;
          const trigger = document.querySelector<HTMLButtonElement>("[data-campus-assistant-menu]");
          if (!trigger) return;
          event.preventDefault();
          trigger.focus();
        }}
      >
        <header className="border-b px-5 py-5 pr-12">
          <SheetTitle>校園助理 · Assistant</SheetTitle>
          <SheetDescription id="public-assistant-description" className="mt-2">
            {user ? "Ask about your stu.best School Affairs records, or request an action. Sample courses and grades are clearly labeled; actions need your review." : "Ask about School Affairs services and public school information. Sign in to ask about your stu.best records."}
          </SheetDescription>
        </header>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-2 text-sm">
          <a
            className="underline underline-offset-4"
            href="/school-affairs/login"
            target={embedded ? "_top" : undefined}
          >
            {user ? "School Affairs account" : "School Affairs sign in"}
          </a>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !!actionBusy || sessions.loadingChat || !scope || (!messages.length && !images.length)}
            onClick={() => {
              sequence.current++;
              pending.current?.abort();
              sessions.newChat();
              setImages([]);
              setError("");
            }}
          >
            <RotateCcw size={14} /> New chat
          </Button>
        </div>
        <div className="space-y-1.5 border-b px-5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor="assistant-conversation-picker" className="sr-only">Conversations</label>
            <select id="assistant-conversation-picker" aria-label="Conversations" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm" value={sessions.active?.id||''} disabled={busy||!!actionBusy||sessions.loadingChat||sessions.syncing} onChange={event=>void sessions.chooseChat(event.target.value)}>
              {sessions.conversations.map(chat=><option key={chat.id} value={chat.id}>{chat.title}</option>)}
            </select>
            <Button variant="ghost" size="icon" aria-label="Delete this conversation" disabled={busy||!!actionBusy||sessions.syncing||sessions.loadingChat||!messages.length} onClick={()=>void sessions.deleteChat()}><Trash2 className="size-4"/></Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status">{sessions.loadingChat?'Loading conversation…':sessions.syncing?'Saving conversation…':sessions.syncError?'Saved in this tab; account sync needs attention.':user?'Conversations are private to your account.':'Conversations are saved in this browser tab.'}</p>
          {sessions.syncError?<div className="text-xs text-destructive"><p>{sessions.syncError}</p><button className="mr-3 underline" onClick={sessions.retrySync}>Retry save</button>{sessions.active?.version?<button className="underline" onClick={()=>void sessions.chooseChat(sessions.active!.id,true)}>Reload saved chat (discards unsaved edits)</button>:null}</div>:null}
        </div>
        <div
          ref={viewport}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
        >
          {!messages.length ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ask in English or Chinese. Answers include sources when
                available.
              </p>
              {questions.map((question) => (
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal text-left"
                  key={question}
                  disabled={!scope}
                  onClick={() => void send(question)}
                >
                  {question}
                </Button>
              ))}
            </div>
          ) : null}
          {messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user"
                  ? "public-assistant-user ml-5 rounded-xl bg-primary p-4 text-primary-foreground"
                  : "mr-2 space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
              }
            >
              <p className="mb-2 text-xs font-semibold">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              {message.role === "user" ? (
                <><p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content}</p>{message.images?.map(image=>image.dataUrl?<img key={image.name} src={image.dataUrl} alt={`Attached ${image.name}`} className="mt-2 max-h-40 max-w-full rounded-md object-contain" />:<p key={image.name} className="mt-2 text-xs">Attached image · {image.name}</p>)}</>
              ) : message.phase === 'working' && !message.content ? <p className="text-sm text-muted-foreground">Preparing your answer…</p> : message.phase === 'error' ? <p role="alert" className="text-sm text-destructive">{message.content}</p> : (
                <AssistantMarkdown>{message.content}</AssistantMarkdown>
              )}
              {message.result?.grounding?.source === "web" && <p className="text-xs text-muted-foreground">Found online · See sources below.</p>}
              {message.result?.verification?<p className="text-xs text-muted-foreground">{message.result.verification.status==='verified'?'Checked against retrieved evidence':'Could not verify this answer'} · {message.result.verification.attempts} {message.result.verification.attempts===1?'check':'checks'}</p>:null}
              {message.result?.views?.map(view=><details key={view.id} className="min-w-0 rounded-md border bg-muted/20 p-2 text-xs"><summary className="cursor-pointer font-semibold">{view.title} · {view.total} retrieved</summary><div className="mt-2 max-w-full overflow-x-auto" role="region" aria-label={view.title} tabIndex={0}><table className="w-full border-collapse text-left"><thead><tr>{view.columns.map(column=><th key={column} className="border-b p-2 whitespace-nowrap">{column}</th>)}</tr></thead><tbody>{view.rows.map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column} className="border-b p-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div><p className="mt-2 text-muted-foreground">{view.rows.length<view.total?`Showing ${view.rows.length} of ${view.total} retrieved records. `:''}{view.note}</p><a className="mt-2 inline-block underline" href={view.url} target={embedded?'_top':undefined}>Open records</a></details>)}
              {message.result?.proposedAction && user ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><p className="font-semibold">Review action</p><p className="my-2 break-words">{message.result.proposedAction.label}</p><p className="mb-3 text-xs text-muted-foreground">This changes stu.best records only. No university system is contacted.</p><Button size="sm" disabled={!!actionBusy} onClick={()=>void applyAction(message)}>{actionBusy===message.id?'Applying…':'Confirm action'}</Button></div> : null}
              {message.actionExpired && !message.result?.proposedAction ? <p className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">The earlier action review expired when this chat was restored. Ask again if you still want to do it.</p> : null}
              {message.role === 'assistant' ? <ActivityTimeline message={message} /> : null}
              {message.result?.citations.length ? (
                <ul
                  className="space-y-2 border-t pt-3 text-xs"
                  aria-label="Sources"
                >
                  {message.result.citations.map((citation) => (
                    <li key={citation.chunkId}>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-words font-medium underline underline-offset-4"
                      >
                        {citation.title}
                      </a>
                      <span className="text-muted-foreground">
                        {citation.sourceName}
                        {citation.reviewedAt
                          ? ` · Reviewed ${new Date(citation.reviewedAt).toLocaleDateString()}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {message.role === "assistant" && message.result?.suggestedQuestions?.length ? <div className="flex flex-wrap gap-2">{message.result.suggestedQuestions.slice(0,3).map(question=><Button key={question} variant="outline" size="sm" disabled={busy} className="h-auto whitespace-normal text-left" onClick={()=>void send(question)}>{question}</Button>)}</div> : null}
              {message.result?.feedback ? (
                <PublicAssistantFeedback
                  capability={message.result.feedback}
                  status={message.result.status}
                />
              ) : null}
            </article>
          ))}
        </div>
        <form
          className="space-y-3 border-t p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {images.length ? <ul className="flex flex-wrap gap-2" aria-label="Attached images">{images.map((image,index)=><li key={`${image.name}-${index}`} className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"><img src={image.dataUrl} alt="" className="h-9 w-9 rounded object-cover"/><span className="max-w-28 truncate">{image.name}</span><Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${image.name}`} onClick={()=>setImages(old=>old.filter((_,i)=>i!==index))}><X size={14}/></Button></li>)}</ul>:null}
          <label htmlFor="public-assistant-question" className="sr-only">
            Your question
          </label>
          <Textarea
            id="public-assistant-question"
            value={query}
            maxLength={2000}
            rows={3}
            disabled={!sessions.active || sessions.loadingChat}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a school question…"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label="Attach images" onChange={event=>void addImages(event.target.files)}/><Button type="button" variant="outline" size="icon" aria-label="Attach images" disabled={busy} onClick={()=>fileInput.current?.click()}><Paperclip size={16}/></Button><span className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</span></div>
            <Button type="submit" disabled={!scope || !sessions.active || sessions.loadingChat || busy || (!query.trim() && !images.length)}>
              <Send size={16} /> Send
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
