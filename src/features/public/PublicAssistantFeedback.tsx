import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { CheckboxField } from '@/components/form-controls'
import { Textarea } from '@/components/ui/textarea'
import { useState } from "react";
import {
  submitAssistantFeedback,
  type AssistantFeedbackCapability,
} from "../../services/researchAssistant";

type Category =
  | "incorrect"
  | "stale"
  | "missing_source"
  | "unclear"
  | "unsafe"
  | "wrong_route"
  | "other";

export function PublicAssistantFeedback({
  capability,
  status,
}: {
  capability: AssistantFeedbackCapability;
  status?: "answered" | "clarification" | "abstained" | "handoff";
}) {
  const [choice, setChoice] = useState<"" | "yes" | "no">("");
  const [category, setCategory] = useState<Category>("incorrect");
  const [comment, setComment] = useState("");
  const [resolved, setResolved] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function save(helpful: boolean) {
    setState("saving");
    setError("");
    try {
      await submitAssistantFeedback({
        capability,
        helpful,
        resolvedNeed: resolved,
        correctionCategory: helpful ? null : category,
        comment: helpful ? "" : comment,
      });
      setState("saved");
    } catch (reason) {
      setState("error");
      setError(reason instanceof Error ? reason.message : "無法儲存意見回饋。");
    }
  }

  if (state === "saved")
    return (
      <p className="assistant-feedback-saved" role="status">
        謝謝，你的意見已安全記錄。
      </p>
    );
  return (
    <div className="assistant-feedback" aria-label="Answer feedback">
      {status === "handoff" ? (
        <a
        href="https://www.stu.edu.tw/"
          target="_blank"
          rel="noreferrer"
        >
          聯絡校方確認 ↗
        </a>
      ) : null}
      <span>這個回答有幫助嗎？</span>
      <div>
        <Button
          type="button"
          disabled={state === "saving"}
          onClick={() => {
            setChoice("yes");
            void save(true);
          }}
          aria-label="This answer was helpful"
        >
          有幫助
        </Button>
        <Button
          type="button"
          disabled={state === "saving"}
          onClick={() => setChoice("no")}
          aria-expanded={choice === "no"}
        >
          需要修正
        </Button>
      </div>
      {choice === "no" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <Label>
            問題類型
            <NativeSelect
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              <NativeSelectOption value="incorrect">資訊不正確</NativeSelectOption>
              <NativeSelectOption value="stale">資料已過期</NativeSelectOption>
              <NativeSelectOption value="missing_source">缺少官方來源</NativeSelectOption>
              <NativeSelectOption value="unclear">說明不清楚</NativeSelectOption>
              <NativeSelectOption value="unsafe">可能不安全</NativeSelectOption>
              <NativeSelectOption value="wrong_route">路線不正確</NativeSelectOption>
              <NativeSelectOption value="other">其他</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label className="assistant-feedback-resolved">
            <CheckboxField
              type="checkbox"
              checked={resolved}
              onChange={(event) => setResolved(event.target.checked)}
            />
            我仍然解決了需求
          </Label>
          <Label>
            補充說明（選填）
            <Textarea
              maxLength={1000}
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Label>
          <Button type="submit" disabled={state === "saving"}>
            {state === "saving" ? "儲存中…" : "送出意見"}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className="assistant-feedback-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
