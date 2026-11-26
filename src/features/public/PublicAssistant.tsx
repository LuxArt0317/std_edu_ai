import { AssistantChatMessage } from "./AssistantChatMessage";
import {useAssistantCommands} from './AssistantCommands';
import {assistantLanguage} from '../../services/assistantLanguage.js';
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RotateCcw, Paperclip, X, Trash2 } from "lucide-react";
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
  type AssistantProgress,
} from "../../services/researchAssistant";
import { useAffairsAuth } from "./affairs/authContext";
import {askWebsiteAssistant} from "../../services/websiteAssistant";
import { clubUuid } from "../../../server/clubServicesContract.js";
import { writeClubEquipment } from "../../services/clubServices";
import { changeCounseling } from "../../services/counseling";
import { writeRepair } from '../../services/facilityRepair';
import { changeLearningSupport } from '../../services/learningSupport';
import { repairId } from './affairs/facilityRepair.js';
import { learningSupportPath, leavePath } from './affairs/studentServices.js';
import { studentLeaveDraftAction, validStudentLeaveDraft } from '../../../server/studentLeaveDraft.js';
import { performSchoolAffairsAction, confirmApplicationApiToolAction } from "../../services/schoolAffairsWorkspace";
import { finishAssistantActivity, mergeAssistantActivity, mergeFinalAssistantActivity, type AssistantMessage } from "../../services/assistantConversation";
import {useAssistantSessions} from './useAssistantSessions';
import {assistantPageRoute} from '../../services/assistantPageRoute.js';

type Message = AssistantMessage;


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
  const commands=useAssistantCommands(query,setQuery);
  const latestUser=messages.filter(message=>message.role==='user').at(-1)?.content||'';
  const english=assistantLanguage(latestUser,messages)==='en';
  const viewport = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    pending = useRef<AbortController | null>(null),
    pendingAction = useRef<AbortController | null>(null),
    openedFromMenu = useRef(false),
    noticeLauncher = useRef<HTMLButtonElement | null>(null),
    sequence = useRef(0);
  useEffect(() => () => {pending.current?.abort();pendingAction.current?.abort();}, []);
  useEffect(() => {
    const openFromAccount = (event:Event) => {
      const trigger=event instanceof CustomEvent && event.detail instanceof HTMLButtonElement ? event.detail : null;
      noticeLauncher.current=trigger;
      openedFromMenu.current=!trigger;
      setOpen(true);
    };
    window.addEventListener(campusAssistantOpenEvent, openFromAccount);
    return () => window.removeEventListener(campusAssistantOpenEvent, openFromAccount);
  }, []);
  useEffect(() => {
    sequence.current++;
    pending.current?.abort();
    pendingAction.current?.abort();
    pendingAction.current=null;
    setImages([]);
    setQuery("");
    setError("");
    setBusy(false);
    setActionBusy(null);
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
    if(commands.consumeCommand(text))return;
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
      const route=assistantPageRoute(embedded);
      const onProgress=(step:AssistantProgress)=>{
        if (request !== sequence.current || controller.signal.aborted) return;
        setMessages(old=>old.map(item=>item.id===answerId?{...item,activity:mergeAssistantActivity(item.activity,[step])}:item));
      };
      const result = await askWebsiteAssistant({userId:user?.id,question,history:messages,signal:controller.signal,images:attached,route,onProgress,preferences:commands.preferences});
      if (request === sequence.current && !controller.signal.aborted)
        setMessages(old=>old.map(item=>item.id===answerId?{...item,phase:'complete',content:result.answer,result,activity:finishAssistantActivity(mergeFinalAssistantActivity(item.activity,result.activity))}:item));
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
    if (!action || pendingAction.current || !user) return;
    if (!action.requestId) {
      setError('This action needs a new review. Ask again before applying it.');
      return;
    }
    const controller=new AbortController();
    pendingAction.current=controller;
    setActionBusy(message.id);
    setError("");
    try {
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
      const {kind,payload,requestId}=action;
      const expectedRecordId=kind===studentLeaveDraftAction?requestId:kind==='complete_task'?payload.task_id
        :['set_assignment_status','cancel_club_equipment','counseling_cancel','cancel_facility_repair','withdraw_learning_support'].includes(kind)?payload.id
        :kind==='update_display_name'?user.id:undefined;
      let result;
      if(kind==='invoke_application_api'){
        if(!clubUuid.test(requestId)||typeof payload.confirmationToken!=='string')throw new Error('Ask for a new action review.');
        result=await confirmApplicationApiToolAction(requestId,payload.confirmationToken,{expectedUserId:user.id,signal});
      }else if(kind==='cancel_club_equipment'||kind==='counseling_cancel'){
        const expected_version=Number(payload.expected_version);
        if(!clubUuid.test(requestId)||!clubUuid.test(payload.id)||!/^\d{1,6}$/u.test(payload.expected_version)||expected_version<1)
          throw new Error('This action needs a new review. Ask again before applying it.');
        const fields={request_id:requestId,id:payload.id,expected_version};
        const receipt=kind==='counseling_cancel'?await changeCounseling(user.id,'cancel',fields,signal)
          :await writeClubEquipment(user.id,{kind,payload:fields},signal);
        result={id:receipt.id,kind,summary:kind==='counseling_cancel'?'Cancelled your appointment':'Cancelled your club equipment request'};
      }else if(kind==='submit_learning_support'){
        const {topic,details}=payload;
        if(!clubUuid.test(requestId)||action.url!==learningSupportPath||Object.keys(payload).length!==2
          ||typeof topic!=='string'||typeof details!=='string')
          throw new Error('This action needs a new review. Ask again before applying it.');
        const receipt=await changeLearningSupport(user.id,{kind,payload:{request_id:requestId,topic,details}},signal);
        result={id:receipt.id,kind,summary:'Submitted your learning support request'};
      }else if(kind==='withdraw_learning_support'){
        if(!clubUuid.test(requestId)||!clubUuid.test(payload.id)||!/^[12]$/u.test(payload.expected_version))
          throw new Error('This action needs a new review. Ask again before applying it.');
        const fields={request_id:requestId,id:payload.id,expected_version:Number(payload.expected_version)};
        const receipt=await changeLearningSupport(user.id,{kind,payload:fields},signal);
        result={id:receipt.id,kind,summary:'Withdrew your learning support request'};
      }else if(kind==='cancel_facility_repair'){
        if(!repairId(requestId)||!repairId(payload.id)||!/^[1-9]\d{0,3}$/u.test(payload.version))
          throw new Error('This action needs a new review. Ask again before applying it.');
        const receipt=await writeRepair(user.id,{kind,payload:{request_id:requestId,id:payload.id,version:Number(payload.version)}},signal);
        result={id:receipt.id,kind,summary:'Cancelled your repair report'};
      }else{
        if(kind===studentLeaveDraftAction&&(!clubUuid.test(requestId)||action.url!==leavePath+'/edit/'+requestId||!validStudentLeaveDraft(payload)))
          throw new Error('This action needs a new review. Ask again before applying it.');
        result=await performSchoolAffairsAction({kind,payload,requestId},{expectedUserId:user.id,signal});
      }
      if (pendingAction.current!==controller || controller.signal.aborted) return;
      if (result.kind!==kind || expectedRecordId!==undefined&&result.id!==expectedRecordId || typeof result.id!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(result.id)
        || typeof result.summary!=='string' || !result.summary.trim() || result.summary.length>500)
        throw new Error('The action receipt could not be verified. Retry the same confirmation.');
      const summary=result.summary.replace(/[\r\n]+/gu,' ').replace(/[\\`*_\[\]<>]/gu,'\\$&');
      setMessages(old=>old.map(item=>item.id===message.id?{
        ...item,
        content:`${item.content}\n\n✓ ${summary}. [View records](${action.url||'/school-affairs/records'}).`,
        result:item.result?{...item.result,proposedAction:undefined}:undefined,
        activity:mergeAssistantActivity(item.activity,[{kind:'action',label:kind==='invoke_application_api'?'Application API responded':'Updated your stu.best record',detail:result.summary,status:'complete'}]),
      }:item));
      window.dispatchEvent(new Event('school-affairs:updated'));
    } catch(reason) {
      if (pendingAction.current!==controller || controller.signal.aborted) return;
      setError(reason instanceof Error?reason.message:'The action could not be completed. Please try again.');
    } finally {
      if(pendingAction.current===controller){pendingAction.current=null;setActionBusy(null);}
    }
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
          aria-label={english?"Open campus assistant":"開啟 AI 校園助理"}
        >
          <MessageCircle aria-hidden="true" size={20} />
          <span>{english?"Campus assistant":"校園助理"}</span>
        </Button>
      </SheetTrigger>}
      <SheetContent
        className="w-full gap-0 p-0 sm:max-w-lg public-assistant-surface"
        aria-describedby="public-assistant-description"
        showCloseButton={!embedded}
        onCloseAutoFocus={(event) => {
          const notice=noticeLauncher.current;
          noticeLauncher.current=null;
          if (notice?.isConnected) {
            event.preventDefault();
            notice.focus();
            return;
          }
          const fromMenu=openedFromMenu.current;
          openedFromMenu.current=false;
          if (showLauncher && !fromMenu) return;
          const trigger = document.querySelector<HTMLButtonElement>("[data-campus-assistant-menu]");
          if (!trigger) return;
          event.preventDefault();
          trigger.focus();
        }}
      >
        <header className="border-b px-5 py-5 pr-12">
          <SheetTitle>{english?"Campus assistant":"校園助理"}</SheetTitle>
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
              {sessions.conversations.map(chat=><option key={chat.id} value={chat.id}>{chat.title}{sessions.unsavedConversationIds.includes(chat.id)?' — Save needs attention':''}</option>)}
            </select>
            <Button variant="ghost" size="icon" aria-label="Delete this conversation" disabled={busy||!!actionBusy||sessions.syncing||sessions.loadingChat||!messages.length} onClick={()=>void sessions.deleteChat()}><Trash2 className="size-4"/></Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status">{sessions.loadingChat?'Loading conversation…':sessions.persistenceStatus}</p>
          {sessions.syncError?<div className="text-xs text-destructive" role="alert"><p>{sessions.syncError}</p><button className="mr-3 underline" onClick={sessions.retrySync}>Retry save</button>{sessions.active?.version?<button className="underline" disabled={busy||!!actionBusy} onClick={()=>void sessions.chooseChat(sessions.active!.id,true)}>Reload saved chat (discards unsaved edits)</button>:null}</div>:null}
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
              {(english?["What is the registrar’s contact number?","Where can I find course information?","What are the latest announcements?","What are my current subjects?","What DTM materials do I have?"]:questions).map((question) => (
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
            <AssistantChatMessage key={message.id} message={message} embedded={embedded} english={english} busy={busy} actionBusy={actionBusy} canApply={!!user} onApplyAction={message=>void applyAction(message)} onSuggestion={question=>void send(question)} />
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
            aria-controls={commands.activeCommandId?'assistant-command-list':undefined}
            aria-activedescendant={commands.activeCommandId}
            aria-autocomplete="list"
            value={query}
            maxLength={2000}
            rows={3}
            disabled={!sessions.active || sessions.loadingChat}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a school question…"
            onKeyDown={(event) => {
              if(commands.onKeyDown(event))return;
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
          {commands.controls}
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
