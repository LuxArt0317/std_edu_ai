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
  language="en",
}: {
  capability: AssistantFeedbackCapability;
  language?: "en" | "zh-Hant";
  status?: "answered" | "clarification" | "abstained" | "handoff";
}) {
  const english=language==='en';
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
      setError(reason instanceof Error ? reason.message : (english?"Could not save your feedback.":"無法儲存意見回饋。"));
    }
  }

  if (state === "saved")
    return (
      <p className="assistant-feedback-saved" role="status">
        {english?"Thank you—your feedback has been saved.":"謝謝，你的意見已安全記錄。"}
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
          {english?"Check with the school ↗":"聯絡校方確認 ↗"}
        </a>
      ) : null}
      <span>{english?"Was this answer helpful?":"這個回答有幫助嗎？"}</span>
      <div>
        <Button variant="outline"
          type="button"
          disabled={state === "saving"}
          onClick={() => {
            setChoice("yes");
            void save(true);
          }}
          aria-label="This answer was helpful"
        >
          {english?"Helpful":"有幫助"}
        </Button>
        <Button variant="outline"
          type="button"
          disabled={state === "saving"}
          onClick={() => setChoice("no")}
          aria-expanded={choice === "no"}
        >
          {english?"Needs improvement":"需要修正"}
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
            {english?"Issue type":"問題類型"}
            <NativeSelect
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              <NativeSelectOption value="incorrect">{english?"Incorrect information":"資訊不正確"}</NativeSelectOption>
              <NativeSelectOption value="stale">{english?"Outdated information":"資料已過期"}</NativeSelectOption>
              <NativeSelectOption value="missing_source">{english?"Missing source":"缺少官方來源"}</NativeSelectOption>
              <NativeSelectOption value="unclear">{english?"Unclear explanation":"說明不清楚"}</NativeSelectOption>
              <NativeSelectOption value="unsafe">{english?"Potentially unsafe":"可能不安全"}</NativeSelectOption>
              <NativeSelectOption value="wrong_route">{english?"Wrong destination":"路線不正確"}</NativeSelectOption>
              <NativeSelectOption value="other">{english?"Other":"其他"}</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label className="assistant-feedback-resolved">
            <CheckboxField
              type="checkbox"
              checked={resolved}
              onChange={(event) => setResolved(event.target.checked)}
            />
            {english?"I still resolved my question":"我仍然解決了需求"}
          </Label>
          <Label>
            {english?"Additional comments (optional)":"補充說明（選填）"}
            <Textarea
              maxLength={1000}
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Label>
          <Button type="submit" disabled={state === "saving"}>
            {state === "saving" ? (english?"Saving…":"儲存中…") : (english?"Send feedback":"送出意見")}
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
