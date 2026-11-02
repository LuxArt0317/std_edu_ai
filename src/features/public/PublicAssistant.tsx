import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RotateCcw } from "lucide-react";
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
} from "../../services/researchAssistant";
import { PublicAssistantFeedback } from "./PublicAssistantFeedback";
import { AssistantMarkdown } from "../school/portal/AssistantMarkdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AssistantResponse;
};
const questions = [
  "註冊課務組的聯絡電話？",
  "如何查詢課程？",
  "有哪些最新公告？",
  "What are my current subjects?",
];
export function PublicAssistant() {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null),
    pending = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(() => () => {pending.current?.abort();}, []);
  useEffect(() => {
    viewport.current?.scrollTo({
      top: viewport.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  async function send(text = query) {
    const question = text.trim();
    if (!question || busy) return;
    const request = ++sequence.current,
      controller = new AbortController();
    pending.current = controller;
    setMessages((old) => [
      ...old,
      { id: `u-${request}`, role: "user", content: question },
    ]);
    setQuery("");
    setError("");
    setBusy(true);
    try {
      const result = await askCampusAssistant(
        question,
        messages,
        controller.signal,
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
  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
      >
        <header className="border-b px-5 py-5 pr-12">
          <SheetTitle>校園助理 · Assistant</SheetTitle>
          <SheetDescription id="public-assistant-description" className="mt-2">
            Public school information. Personal records require a connected School Affairs account.
          </SheetDescription>
        </header>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-2 text-sm">
          <a
            className="underline underline-offset-4"
            href="/school-affairs/login"
          >
            School Affairs sign in
          </a>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !messages.length}
            onClick={() => {
              sequence.current++;
              pending.current?.abort();
              setMessages([]);
              setError("");
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
                <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                  {message.content}
                </p>
              ) : (
                <AssistantMarkdown>{message.content}</AssistantMarkdown>
              )}
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
              {message.result?.feedback ? (
                <PublicAssistantFeedback
                  capability={message.result.feedback}
                  status={message.result.status}
                />
              ) : null}
            </article>
          ))}
          {busy ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking sources and records…
            </p>
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
            <span className="text-xs text-muted-foreground">
              Enter to send · Shift+Enter for a new line
            </span>
            <Button type="submit" disabled={busy || !query.trim()}>
              <Send size={16} /> Send
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
