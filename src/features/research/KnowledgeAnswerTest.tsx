import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  askKnowledgeAnswer,
  type AssistantResponse,
} from "../../services/researchAssistant";
import { AssistantMarkdown } from "../school/portal/AssistantMarkdown";
export function KnowledgeAnswerTest() {
  const [question, setQuestion] = useState(""),
    [result, setResult] = useState<AssistantResponse | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-medium">Test an answer</summary>
      <p className="my-3 text-sm text-muted-foreground">
        Try a school question. Uses your account permissions and published
        sources; makes no changes.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !question.trim()) return;
          setBusy(true);
          setError("");
          setResult(null);
          try {
            setResult(await askKnowledgeAnswer(question));
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "The answer could not be tested.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Label className="min-w-0 flex-1">
          Question
          <Input
            value={question}
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What is the registrar's phone number?"
            required
          />
        </Label>
        <Button disabled={busy || !question.trim()}>
          {busy ? "Checking…" : "Test answer"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <AssistantMarkdown>{result.answer}</AssistantMarkdown>
          <p className="text-sm text-muted-foreground">
            {result.citations.length} cited source
            {result.citations.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2 text-sm">
            {result.citations.map((source) => (
              <li key={source.chunkId}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
