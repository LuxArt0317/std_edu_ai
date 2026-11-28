import {AssistantCourseResults} from "./AssistantCourseResults";
import {academicSourceViews} from "../../../server/academicSourcePolicy.js";
import "./AssistantChatMessage.css";
import type { AssistantMessage as Message } from "../../services/assistantConversation";
import { Button } from "@/components/ui/button";
import { AssistantMarkdown } from "../school/portal/AssistantMarkdown";
import { ActivityTimeline } from "./AssistantActivity";
import { PublicAssistantFeedback } from "./PublicAssistantFeedback";
import { studentLeaveDraftAction, studentLeaveDraftCategories, validStudentLeaveDraft, type StudentLeaveDraft } from '../../../server/studentLeaveDraft.js';
function StudentLeaveDraftReview({payload}:{payload:StudentLeaveDraft}) {
  const {starts_on,ends_on,leave_category,periods,leave_time_period,notes}=payload;
  const category=studentLeaveDraftCategories[leave_category].join(' · ');
  const date=starts_on===ends_on?starts_on:`${starts_on} – ${ends_on}`;
  const timeLabels:Record<string,string>={am:'Morning · 上午',pm:'Afternoon · 下午',day:'All day · 全天'};
  return <dl className="mb-2 space-y-2 break-words">
    <div><dt className="text-xs text-muted-foreground">Dates · 日期</dt><dd>{date}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Category · 假別</dt><dd>{category}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Periods · 節次</dt><dd>{periods}</dd></div>
    {leave_time_period&&<div><dt className="text-xs text-muted-foreground">Time · 時段</dt><dd>{timeLabels[leave_time_period]}</dd></div>}
    {notes&&<div><dt className="text-xs text-muted-foreground">Reason · 事由</dt><dd className="whitespace-pre-wrap">{notes}</dd></div>}
  </dl>;
}

/** One renderer for the live assistant and saved evaluation responses. */
export function AssistantChatMessage({message, embedded=false, english=false, busy=false, actionBusy=null, canApply=false, readOnly=false, onApplyAction, onSuggestion}: {
 message: Message; embedded?: boolean; english?: boolean; busy?: boolean; actionBusy?: string|null; canApply?: boolean; readOnly?: boolean;
 onApplyAction?: (message: Message)=>void; onSuggestion?: (question:string)=>void;
}) {
 const sources = message.result?.citations ?? [];
 const sourcesByUrl = new Map<string, typeof sources>();
 for (const citation of sources) {
   const excerpts = sourcesByUrl.get(citation.url);
   if (excerpts) excerpts.push(citation);
   else sourcesByUrl.set(citation.url, [citation]);
 }
 const courseView=message.result?.views?.find(view=>view.id==='moodle-courses');const firstParagraph=message.content.split(/\n\s*\n/)[0];const intro=firstParagraph.length<=400&&!firstParagraph.includes('|')?firstParagraph:'Here are the subjects returned for this request.';return (
            <article
              className={
                message.role === "user"
                  ? "assistant-chat-message public-assistant-user ml-5 rounded-xl bg-primary p-4 text-primary-foreground"
                  : "assistant-chat-message mr-2 space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
              }
            >
              <p className="mb-2 text-xs font-semibold">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              {message.role==='assistant'&&(message.phase==='working'||message.result?.grounding?.source!=='conversation')&&message.updates?.map(update=><p key={update.id} className="assistant-commentary text-sm" aria-live={message.phase==='working'?'polite':undefined}>{update.text}</p>)}
              {message.role==='assistant'&&(message.phase==='working'||message.result?.grounding?.source!=='conversation')&&!message.updates?.length&&message.acknowledgment&&<p className="assistant-acknowledgment text-sm">{message.acknowledgment}</p>}
              {message.role === 'assistant' ? <ActivityTimeline message={message} /> : null}
              {message.role === "user" ? (
                <><p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content}</p>{message.images?.map(image=>image.dataUrl?<img key={image.name} src={image.dataUrl} alt={`Attached ${image.name}`} className="mt-2 max-h-40 max-w-full rounded-md object-contain" />:<p key={image.name} className="mt-2 text-xs">Attached image · {image.name}</p>)}</>
              ) : message.phase === 'working' ? null : message.phase === 'error' ? <p role="alert" className="text-sm text-destructive">{message.content}</p> : (
                courseView?<><AssistantMarkdown>{intro}</AssistantMarkdown><AssistantCourseResults view={courseView}/><details className="assistant-full-answer"><summary>Full written answer</summary><AssistantMarkdown>{message.content}</AssistantMarkdown></details></>:<AssistantMarkdown>{message.content}</AssistantMarkdown>
              )}
              {message.result?.modelSettings&&<p className="text-xs text-muted-foreground">Model setting: {message.result.modelSettings.model} · Thinking: {message.result.modelSettings.thinking}</p>}
              {message.result?.grounding?.source === "web" && <p className="text-xs text-muted-foreground">Found online · See sources below.</p>}
              {message.result?.verification && <p className="text-xs text-muted-foreground">
                {message.result.verification.status === 'verified'
                  ? message.result.grounding?.source === 'general-guidance'
                    ? 'General practice guidance'
                    : message.result.verification.attempts === 0 && message.result.grounding?.source === 'directory'
                      ? 'From the campus service directory'
                      : message.result.grounding?.source === 'attached-image' ? 'Checked against your image' : 'Checked against retrieved evidence'
                  : 'Not confirmed yet'}
                {message.result.verification.status === 'verified' && message.result.grounding?.source !== 'general-guidance' && message.result.verification.attempts > 0 && ` · ${message.result.verification.attempts} ${message.result.verification.attempts === 1 ? 'check' : 'checks'}`}
              </p>}
              {academicSourceViews(message.result?.views).filter(view=>view.id!=='moodle-courses').map(view=><details key={view.id} className="min-w-0 rounded-md border bg-muted/20 p-2 text-xs"><summary className="cursor-pointer font-semibold">{view.title} · {view.total} retrieved</summary><div className="mt-2 max-w-full overflow-x-auto" role="region" aria-label={view.title} tabIndex={0}><table className="w-full border-collapse text-left"><thead><tr>{view.columns.map(column=><th key={column} className="border-b p-2 whitespace-nowrap">{column}</th>)}</tr></thead><tbody>{view.rows.map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column} className="border-b p-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div><p className="mt-2 text-muted-foreground">{view.rows.length<view.total?`Showing ${view.rows.length} of ${view.total} retrieved records. `:''}{view.note}</p><a className="mt-2 inline-block underline" href={view.url} target={embedded?'_top':undefined}>Open records</a></details>)}
              {message.result?.proposedAction && (canApply || readOnly) ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-semibold">Review action</p>
                <p className="my-2 break-words">{message.result.proposedAction.label}</p>
                {message.result.proposedAction.kind==='invoke_application_api' ? <details open className="mb-3"><summary>Exact API request</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{message.result.proposedAction.payload.review}</pre><p className="mt-2 text-xs">Review expires after 10 minutes. This runs with your current account permissions.</p></details> : null}
                {message.result.proposedAction.kind==='publish_announcement' ? <p className="mb-2 whitespace-pre-wrap break-words">{message.result.proposedAction.payload?.body}</p> : null}
                {message.result.proposedAction.kind==='create_service_request' ? <>
                  <p className="mb-1 text-xs text-muted-foreground">Request category · {message.result.proposedAction.payload?.request_type}</p>
                  <p className="mb-2 whitespace-pre-wrap break-words">{message.result.proposedAction.payload?.details}</p>
                </> : null}
                {message.result.proposedAction.kind==='submit_learning_support' ? <dl className="mb-2 space-y-2">
                  <div><dt className="text-xs text-muted-foreground">Topic · 主題</dt>
                    <dd className="whitespace-pre-wrap break-words">{message.result.proposedAction.payload?.topic}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Support needed · 輔導需求</dt>
                    <dd className="whitespace-pre-wrap break-words">{message.result.proposedAction.payload?.details}</dd></div>
                </dl> : null}
                {message.result.proposedAction.kind===studentLeaveDraftAction&&validStudentLeaveDraft(message.result.proposedAction.payload) ?
                  <StudentLeaveDraftReview payload={message.result.proposedAction.payload}/> : null}
                <p className="mb-3 text-xs text-muted-foreground">{message.result.proposedAction.kind==='invoke_application_api'?'The application endpoint validates this request and may reject missing fields or insufficient permissions.':'This changes stu.best records only. No university system is contacted.'}</p>
                <Button size="sm" disabled={readOnly || !!actionBusy} onClick={()=>onApplyAction?.(message)}>{actionBusy===message.id?'Applying…':'Confirm action'}</Button>
              </div> : null}
              {message.actionExpired && !message.result?.proposedAction ? <p className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">The earlier action review expired when this chat was restored. Ask again if you still want to do it.</p> : null}
              {sourcesByUrl.size ? (
                <ul
                  className="space-y-2 border-t pt-3 text-xs"
                  aria-label="Sources"
                >
                  {Array.from(sourcesByUrl.values(), ([citation, ...otherExcerpts]) => (
                    <li key={`${citation.chunkId}:${citation.url}`}>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-words font-medium underline underline-offset-4"
                      >
                        {otherExcerpts.length ? (english ? "Shared source page" : "共同來源頁面") : citation.title}
                      </a>
                      <span className="text-muted-foreground">
                        {citation.sourceName}
                        {otherExcerpts.length ? (english ? ` · ${otherExcerpts.length + 1} excerpts` : ` · ${otherExcerpts.length + 1} 則引文`) : ""}
                        {citation.reviewedAt
                          ? ` · Reviewed ${new Date(citation.reviewedAt).toLocaleDateString()}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {message.role === "assistant" && message.result?.suggestedQuestions?.length ? <div className="flex flex-wrap gap-2">{message.result.suggestedQuestions.filter(question=>!english||!/\p{Script=Han}/u.test(question)).slice(0,3).map(question=><Button key={question} variant="outline" size="sm" disabled={busy || !onSuggestion} className="h-auto whitespace-normal text-left" onClick={()=>onSuggestion?.(question)}>{question}</Button>)}</div> : null}
              {message.result?.feedback ? (
                <PublicAssistantFeedback
                  language={english?"en":"zh-Hant"}
                  capability={message.result.feedback}
                  status={message.result.status}
                />
              ) : null}
            </article>
); }
