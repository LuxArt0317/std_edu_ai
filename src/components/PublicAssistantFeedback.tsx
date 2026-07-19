import { useState } from "react";
import {
  submitAssistantFeedback,
  type AssistantFeedbackCapability,
} from "../services/researchAssistant";

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
        <button
          type="button"
          disabled={state === "saving"}
          onClick={() => {
            setChoice("yes");
            void save(true);
          }}
          aria-label="This answer was helpful"
        >
          有幫助
        </button>
        <button
          type="button"
          disabled={state === "saving"}
          onClick={() => setChoice("no")}
          aria-expanded={choice === "no"}
        >
          需要修正
        </button>
      </div>
      {choice === "no" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <label>
            問題類型
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              <option value="incorrect">資訊不正確</option>
              <option value="stale">資料已過期</option>
              <option value="missing_source">缺少官方來源</option>
              <option value="unclear">說明不清楚</option>
              <option value="unsafe">可能不安全</option>
              <option value="wrong_route">路線不正確</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="assistant-feedback-resolved">
            <input
              type="checkbox"
              checked={resolved}
              onChange={(event) => setResolved(event.target.checked)}
            />
            我仍然解決了需求
          </label>
          <label>
            補充說明（選填）
            <textarea
              maxLength={1000}
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <button type="submit" disabled={state === "saving"}>
            {state === "saving" ? "儲存中…" : "送出意見"}
          </button>
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
