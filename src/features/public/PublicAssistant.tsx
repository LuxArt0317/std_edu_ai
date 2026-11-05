import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RotateCcw, Paperclip, X, Check, LoaderCircle, CircleAlert } from "lucide-react";
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
  type AssistantResponse,
  type AssistantProgress,
} from "../../services/researchAssistant";
import { useAffairsAuth } from "./affairs/authContext";
import { askSchoolAffairsAssistant } from "../../services/schoolAffairsAssistant";
import { performSchoolAffairsAction } from "../../services/schoolAffairsWorkspace";
import { PublicAssistantFeedback } from "./PublicAssistantFeedback";
import { AssistantMarkdown } from "../school/portal/AssistantMarkdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AssistantResponse;
  images?: Array<{name:string;dataUrl:string}>;
};
const questions = [
  "註冊課務組的聯絡電話？",
  "如何查詢課程？",
  "有哪些最新公告？",
  "What are my current subjects?",
  "What DTM materials do I have?",
];
export function PublicAssistant({ initialOpen = false, embedded = false }: { initialOpen?: boolean; embedded?: boolean }) {
  const {user} = useAffairsAuth();
  const [open, setOpen] = useState(initialOpen),
    [messages, setMessages] = useState<Message[]>([]),
    [query, setQuery] = useState(""),
    [images, setImages] = useState<Array<{name:string;dataUrl:string}>>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<AssistantProgress[]>([]),
    [actionBusy, setActionBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    pending = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(() => () => {pending.current?.abort();}, []);
  useEffect(() => {
    sequence.current++;
    pending.current?.abort();
    setMessages([]);
    setImages([]);
    setQuery("");
    setError("");
    setProgress([]);
  }, [user?.id]);
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
  }, [messages, busy, progress]);
  async function send(text = query) {
    const attached = images;
    const question = text.trim() || (attached.length ? "Please explain the attached image." : "");
    if (!question || busy) return;
    const request = ++sequence.current,
      controller = new AbortController();
    pending.current = controller;
    setMessages((old) => [
      ...old,
      { id: `u-${request}`, role: "user", content: question, images:attached },
    ]);
    setQuery("");
    setImages([]);
    setError("");
    setProgress([]);
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
          setProgress(old => {
            const index=old.findIndex(item=>item.kind===step.kind);
            if (index<0) return [...old,step];
            return old.map((item,i)=>i===index?step:item);
          });
        },
      );
      if (request === sequence.current)
        setMessages((old) => [
          ...old,
          {
            id: `a-${request}`,
            role: "assistant",
            content: result.answer,
            result,
          },
        ]);
    } catch (reason) {
      if (request === sequence.current && !controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Please try again.",
        );
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
        content:`${item.content}\n\n✓ ${result.summary}. You can view the updated record in School Affairs.`,
        result:item.result?{...item.result,proposedAction:undefined}:undefined,
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
      <SheetTrigger asChild>
        <Button
          type="button"
          className="fixed right-4 bottom-4 z-40 gap-2 shadow-md"
          aria-label="開啟 AI 校園助理"
        >
          <MessageCircle aria-hidden="true" size={20} />
          <span>校園助理</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-full gap-0 p-0 sm:max-w-lg public-assistant-surface"
        aria-describedby="public-assistant-description"
        showCloseButton={!embedded}
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
            disabled={busy || (!messages.length && !images.length)}
            onClick={() => {
              sequence.current++;
              pending.current?.abort();
              setMessages([]);
              setImages([]);
              setError("");
              setProgress([]);
            }}
          >
            <RotateCcw size={14} /> New chat
          </Button>
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
                <><p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content}</p>{message.images?.map(image=><img key={image.name} src={image.dataUrl} alt={`Attached ${image.name}`} className="mt-2 max-h-40 max-w-full rounded-md object-contain" />)}</>
              ) : (
                <AssistantMarkdown>{message.content}</AssistantMarkdown>
              )}
              {message.result?.grounding?.source === "web" && <p className="text-xs text-muted-foreground">Found online · See sources below.</p>}
              {message.result?.proposedAction && user ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><p className="font-semibold">Review action</p><p className="my-2 break-words">{message.result.proposedAction.label}</p><p className="mb-3 text-xs text-muted-foreground">This changes stu.best records only. No university system is contacted.</p><Button size="sm" disabled={!!actionBusy} onClick={()=>void applyAction(message)}>{actionBusy===message.id?'Applying…':'Confirm action'}</Button></div> : null}
              {message.result && <details className="rounded-md border px-3 py-2 text-xs"><summary className="cursor-pointer font-medium">How I checked</summary><ol className="mt-2 space-y-2 text-muted-foreground">{(message.result.activity?.length ? message.result.activity : message.result.grounding?.source === 'web' ? [{kind:'web',label:'Searched public web sources',detail:'Open the linked sources below to verify the answer.',status:'complete' as const}] : message.result.grounding?.source === 'knowledge' ? [{kind:'knowledge',label:'Checked managed school knowledge',detail:'See reviewed sources below.',status:'complete' as const}] : [{kind:'answer',label:'Answered from available context',detail:'No external search was used for this response.',status:'complete' as const}]).map((step,index)=><li key={`${step.kind}-${index}`}><strong className="text-foreground">{step.label}</strong><span className="block">{step.detail}</span></li>)}</ol><p className="mt-2 text-muted-foreground">This shows source checks and tool activity, not private model reasoning.</p></details>}
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
          {busy ? (
            <section role="status" aria-label="Assistant activity" className="rounded-xl border bg-muted/40 p-4 text-sm">
              <p className="font-semibold text-foreground">Working on your question</p>
              {progress.length ? <ol className="mt-3 space-y-2">{progress.map(step=><li key={step.kind} className="flex items-start gap-2 text-muted-foreground">
                {step.status==='running'?<LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-primary"/>:step.status==='complete'?<Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary"/>:<CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0"/>}
                <span><strong className="block font-medium text-foreground">{step.label}</strong><span className="block text-xs">{step.detail}</span></span>
              </li>)}</ol>:<p className="mt-2 text-muted-foreground">Connecting to the assistant…</p>}
            </section>
          ) : null}
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
            <Button type="submit" disabled={busy || (!query.trim() && !images.length)}>
              <Send size={16} /> Send
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
