import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readAssessmentReview,
  recordAssessmentIntegrityEvent,
  submitAssessment,
} from "../platformRepository";
import { RichTextContent } from "../RichTextEditor";
import type {
  AssessmentAttemptResult,
  AssessmentReview,
  PlatformData,
  PlatformRole,
  SchoolAssessment,
} from "../types";

import { browserUuid, formatDate, PageIntro, Pill } from "./shared";
export function AssessmentsView({
  data,
  role,
  initialSectionId,
  onComplete,
}: {
  data: PlatformData;
  role: PlatformRole;
  initialSectionId: string;
  onComplete: (message: string) => void;
}) {
  const [active, setActive] = useState<SchoolAssessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightMessages, setPreflightMessages] = useState<string[]>([]);
  const [review, setReview] = useState<AssessmentReview | null>(null);
  const integritySession = useRef(browserUuid());
  const learnerMode = role === "student";
  const assessments = useMemo(
    () =>
      [...data.assessments].sort(
        (left, right) =>
          Number(right.sectionId === initialSectionId) -
          Number(left.sectionId === initialSectionId),
      ),
    [data.assessments, initialSectionId],
  );
  const focusedCourse = data.courses.find(
    (course) => course.sectionId === initialSectionId,
  );

  const writeIntegrity = useCallback(
    (
      eventType: Parameters<
        typeof recordAssessmentIntegrityEvent
      >[0]["eventType"],
      severity: "info" | "warning" | "critical" = "info",
      details: Record<string, string | number | boolean | null> = {},
    ) => {
      if (!active || !learnerMode) return;
      void recordAssessmentIntegrityEvent({
        assessmentId: active.id,
        sessionId: integritySession.current,
        eventType,
        severity,
        details,
      }).catch(() => undefined);
    },
    [active, learnerMode],
  );

  useEffect(() => {
    if (!active || !assessmentStarted || !learnerMode) return;
    const visibility = () =>
      writeIntegrity(
        document.hidden ? "focus_lost" : "focus_returned",
        document.hidden ? "warning" : "info",
        { visibility: document.visibilityState },
      );
    const blur = () => {
      if (active.monitorFocus)
        writeIntegrity("focus_lost", "warning", { source: "window_blur" });
    };
    const fullscreen = () =>
      writeIntegrity(
        document.fullscreenElement ? "fullscreen_entered" : "fullscreen_exited",
        document.fullscreenElement ? "info" : "warning",
      );
    const clipboard = (event: Event) => {
      if (!active.preventCopyPaste) return;
      event.preventDefault();
      writeIntegrity("clipboard_blocked", "warning", { operation: event.type });
      onComplete(
        "Copy, cut, paste, and the context menu are disabled for this assessment.",
      );
    };
    if (active.monitorFocus) {
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("blur", blur);
    }
    if (active.requireFullscreen)
      document.addEventListener("fullscreenchange", fullscreen);
    for (const name of ["copy", "cut", "paste", "contextmenu"])
      document.addEventListener(name, clipboard);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      document.removeEventListener("fullscreenchange", fullscreen);
      for (const name of ["copy", "cut", "paste", "contextmenu"])
        document.removeEventListener(name, clipboard);
    };
  }, [active, assessmentStarted, learnerMode, onComplete, writeIntegrity]);

  async function beginAssessment() {
    if (!active || preflightBusy) return;
    setPreflightBusy(true);
    setPreflightMessages([]);
    integritySession.current = browserUuid();
    await recordAssessmentIntegrityEvent({
      assessmentId: active.id,
      sessionId: integritySession.current,
      eventType: "preflight_started",
    }).catch(() => undefined);
    const messages: string[] = [];
    try {
      if (active.detectExtendedDisplay) {
        const extended = (window.screen as Screen & { isExtended?: boolean })
          .isExtended;
        if (extended === undefined) {
          messages.push(
            "This browser cannot verify multiple displays; that limitation was recorded.",
          );
          writeIntegrity("display_check_unavailable", "warning");
        } else if (extended) {
          messages.push(
            "An extended display was detected and recorded for teacher review.",
          );
          writeIntegrity("extended_display_detected", "warning");
        } else messages.push("Single-display check passed.");
      }
      if (active.requireCamera || active.detectMultipleCameras) {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "This browser cannot perform the required camera preflight.",
          );
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        const cameras = (
          await navigator.mediaDevices.enumerateDevices()
        ).filter((device) => device.kind === "videoinput");
        stream.getTracks().forEach((track) => track.stop());
        if (!cameras.length) {
          writeIntegrity("camera_missing", "critical");
          throw new Error("No camera was available for this assessment.");
        }
        writeIntegrity("camera_verified", "info", {
          cameraCount: cameras.length,
        });
        messages.push(
          "Camera availability verified. No image or video was stored.",
        );
        if (active.detectMultipleCameras && cameras.length > 1) {
          writeIntegrity("multiple_cameras_detected", "warning", {
            cameraCount: cameras.length,
          });
          messages.push(
            `${cameras.length} camera devices were detected and recorded.`,
          );
        }
      }
      if (active.requireFullscreen) {
        if (!document.documentElement.requestFullscreen)
          throw new Error(
            "This browser does not support the required fullscreen mode.",
          );
        await document.documentElement.requestFullscreen();
        writeIntegrity("fullscreen_entered");
        messages.push("Fullscreen mode enabled.");
      }
      await recordAssessmentIntegrityEvent({
        assessmentId: active.id,
        sessionId: integritySession.current,
        eventType: "preflight_passed",
        details: { checks: messages.length },
      });
      setPreflightMessages(messages);
      setAssessmentStarted(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Assessment preflight failed.";
      setPreflightMessages([...messages, message]);
      await recordAssessmentIntegrityEvent({
        assessmentId: active.id,
        sessionId: integritySession.current,
        eventType: "preflight_failed",
        severity: "critical",
        details: { message },
      }).catch(() => undefined);
    } finally {
      setPreflightBusy(false);
    }
  }
  function closeAssessment() {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    setActive(null);
    setAssessmentStarted(false);
    setPreflightMessages([]);
    setReview(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!active || submitting) return;
    setSubmitting(true);
    try {
      const submission = active.questions.map((question) =>
        question.type === "short_answer"
          ? { questionId: question.id, text: answers[question.id] ?? "" }
          : { questionId: question.id, optionId: answers[question.id] },
      );
      const response = await submitAssessment(active.id, submission);
      setResult(response);
      writeIntegrity("assessment_submitted", "info", {
        attemptId: response.attemptId,
      });
      if (
        active.reviewMode === "responses" ||
        active.reviewMode === "full_review"
      )
        setReview(await readAssessmentReview(active.id));
      onComplete(
        response.score === null
          ? "Assessment submitted. Your result is awaiting release."
          : `Assessment scored: ${response.score} / ${response.maxScore}`,
      );
    } catch (error) {
      onComplete(
        error instanceof Error
          ? error.message
          : "Assessment submission failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow={learnerMode ? "PRACTICE & CHECK" : "ASSESSMENT OPERATIONS"}
        title="Assessments"
        description={
          learnerMode
            ? "Complete published quizzes and receive immediate, explainable feedback."
            : "Preview and review assessments with protected answer keys and deterministic scoring."
        }
      />
      {focusedCourse ? (
        <div className="workspace-focus-banner">
          <b>Opened from Academic Office</b>
          <span>
            {focusedCourse.code} · {focusedCourse.title} ·{" "}
            {focusedCourse.sectionCode}
          </span>
        </div>
      ) : null}
      <section className="assessment-list">
        {assessments.map((assessment) => {
          const course = data.courses.find(
            (item) => item.sectionId === assessment.sectionId,
          );
          return (
            <Card key={assessment.id}>
              <header>
                <span>{course?.code || "COURSE"}</span>
                <Pill
                  tone={assessment.status === "published" ? "teal" : "amber"}
                >
                  {assessment.status}
                </Pill>
              </header>
              <h3>{assessment.title}</h3>
              {learnerMode
                ? (() => {
                    const attempts = data.assessmentAttempts.filter(
                      (attempt) => attempt.assessmentId === assessment.id,
                    );
                    const latest = attempts.at(-1);
                    return latest ? (
                      <p>
                        <b>Attempt {latest.attemptNumber}:</b>{" "}
                        {latest.score === null
                          ? "Result awaiting teacher release"
                          : `${latest.score} / ${latest.maxScore}`}{" "}
                        · {latest.status.replaceAll("_", " ")}
                      </p>
                    ) : null;
                  })()
                : null}
              {assessment.instructions ? (
                <RichTextContent html={assessment.instructions} />
              ) : (
                <p>No instructions provided.</p>
              )}
              <div>
                <span>◷ {assessment.durationMinutes ?? "Untimed"} min</span>
                <span>↻ {assessment.attemptLimit} attempts</span>
                <span>✓ {assessment.maxScore} points</span>
              </div>
              {assessment.requireFullscreen ||
              assessment.monitorFocus ||
              assessment.requireCamera ||
              assessment.detectExtendedDisplay ? (
                <div
                  className="assessment-integrity-badges"
                  aria-label="Assessment integrity requirements"
                >
                  {assessment.requireFullscreen ? (
                    <span>⛶ Fullscreen</span>
                  ) : null}
                  {assessment.monitorFocus ? <span>◉ Focus events</span> : null}
                  {assessment.detectExtendedDisplay ? (
                    <span>▣ Display check</span>
                  ) : null}
                  {assessment.requireCamera ? (
                    <span>● Camera check</span>
                  ) : null}
                </div>
              ) : null}
              <footer>
                <small>Due {formatDate(assessment.dueAt)}</small>
                <Button
                  type="button"
                  onClick={() => {
                    setActive(assessment);
                    setAnswers({});
                    setResult(null);
                    setReview(null);
                    setAssessmentStarted(!learnerMode);
                    setPreflightMessages([]);
                  }}
                >
                  {learnerMode ? "Start assessment →" : "Preview assessment →"}
                </Button>
              </footer>
            </Card>
          );
        })}
      </section>
      {active ? (
        <div className="quiz-layer">
          <Button
            className="quiz-backdrop"
            type="button"
            aria-label="Close assessment"
            onClick={closeAssessment}
            variant="ghost"
          />
          <section className="quiz-panel">
            <header>
              <div>
                <span>ASSESSMENT</span>
                <h2>{active.title}</h2>
                {active.instructions ? (
                  <RichTextContent html={active.instructions} />
                ) : (
                  <p>No instructions provided.</p>
                )}
              </div>
              <Button type="button" onClick={closeAssessment}>
                ×
              </Button>
            </header>
            {result ? (
              <div className="quiz-result">
                <span>✓</span>
                <h2>
                  {active.releaseScoresImmediately
                    ? `${result.score} / ${result.maxScore}`
                    : "Submitted for release"}
                </h2>
                <p>
                  {!active.releaseScoresImmediately
                    ? "Your attempt is recorded. Your score will appear after the teacher releases it."
                    : result.status === "needs_review"
                      ? "Objective answers were scored. A teacher will review the remaining response."
                      : "Your answers were checked against the protected answer key."}
                </p>
                {active.reviewMode === "closed" ? (
                  <p>
                    This assessment is closed after submission by your teacher.
                  </p>
                ) : null}
                {active.reviewMode === "responses" ||
                active.reviewMode === "full_review" ? (
                  <div className="quiz-review-list">
                    {active.questions.map((question) => {
                      const selected = question.options.find(
                        (option) => option.id === answers[question.id],
                      );
                      const reviewed = review?.questions.find(
                        (item) => item.questionId === question.id,
                      );
                      const correct = question.options.find(
                        (option) => option.id === reviewed?.correctOptionId,
                      );
                      return (
                        <Card key={question.id}>
                          <b>
                            {question.position}. {question.prompt}
                          </b>
                          <p>
                            Your response:{" "}
                            {selected?.label ??
                              answers[question.id] ??
                              "No response"}
                          </p>
                          {active.reviewMode === "full_review" ? (
                            <>
                              <p className="correct">
                                Correct answer:{" "}
                                {correct?.label ?? "Teacher review pending"}
                              </p>
                              {reviewed?.explanation ? (
                                <small>{reviewed.explanation}</small>
                              ) : null}
                            </>
                          ) : null}
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
                <Button type="button" onClick={closeAssessment}>
                  Return to assessments
                </Button>
              </div>
            ) : learnerMode && !assessmentStarted ? (
              <div className="quiz-preflight">
                <span>BEFORE YOU BEGIN</span>
                <h2>Assessment requirements</h2>
                <p>
                  {active.integrityInstructions ||
                    "Review the requirements below before starting."}
                </p>
                <ul>
                  <li>
                    <b>
                      {active.requireFullscreen ? "Required" : "Not required"}
                    </b>{" "}
                    Browser fullscreen
                  </li>
                  <li>
                    <b>{active.monitorFocus ? "Recorded" : "Not recorded"}</b>{" "}
                    Tab and window focus changes
                  </li>
                  <li>
                    <b>
                      {active.detectExtendedDisplay
                        ? "Checked when supported"
                        : "Not checked"}
                    </b>{" "}
                    Extended/multiple display signal
                  </li>
                  <li>
                    <b>
                      {active.requireCamera
                        ? "Permission required"
                        : active.detectMultipleCameras
                          ? "Devices checked"
                          : "Not used"}
                    </b>{" "}
                    Camera availability (no recording is stored)
                  </li>
                  <li>
                    <b>{active.preventCopyPaste ? "Disabled" : "Available"}</b>{" "}
                    Copy, cut, paste, and context menu
                  </li>
                </ul>
                <aside>
                  <b>Your privacy and fairness</b>
                  <p>
                    Technical events are evidence for human review, not
                    automatic findings. Browser limitations are recorded
                    honestly. Camera preflight stops immediately after device
                    verification.
                  </p>
                </aside>
                {preflightMessages.length ? (
                  <div className="quiz-preflight-results">
                    {preflightMessages.map((message) => (
                      <p key={message}>{message}</p>
                    ))}
                  </div>
                ) : null}
                <Button
                  type="button"
                  disabled={preflightBusy}
                  onClick={() => void beginAssessment()}
                >
                  {preflightBusy
                    ? "Checking your device…"
                    : "I understand · Run checks and begin"}
                </Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                {active.questions.map((question) => (
                  <fieldset key={question.id}>
                    <legend>
                      <span>{question.position}</span>
                      {question.prompt}
                      <small>
                        {question.points} point
                        {question.points === 1 ? "" : "s"}
                      </small>
                    </legend>
                    {question.type === "short_answer" ? (
                      <Input
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder="Type a concise answer"
                        required
                      />
                    ) : (
                      <div className="quiz-options">
                        {question.options.map((option) => (
                          <Label key={option.id}>
                            <Input
                              type="radio"
                              name={question.id}
                              value={option.id}
                              checked={answers[question.id] === option.id}
                              onChange={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: option.id,
                                }))
                              }
                              required
                            />
                            <span>{option.label}</span>
                          </Label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ))}
                <footer>
                  <span>
                    {Object.keys(answers).length} of {active.questions.length}{" "}
                    answered
                  </span>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Checking answers…" : "Submit and check →"}
                  </Button>
                </footer>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
