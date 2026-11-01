import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  askSchoolAssistant,
  recordSchoolAgentAction,
  type NexusInputAttachment,
} from "../platformAi";
import {
  appendChatMessage,
  createAcademicCurriculum,
  createAcademicTerm,
  createAttendanceSession,
  createCatalogCourse,
  createChatThread,
  createCommunicationRequest,
  createCourseAnnouncement,
  createCourseAssessment,
  createCourseSection,
  createDepartment,
  createInstitutionalInitiative,
  createLearningMaterial,
  createLearningMaterialPage,
  createLearningModule,
  createProgram,
  createScheduleEvent,
  createStudentSupportRequest,
  decideAttendanceCorrection,
  deleteAttendanceSession,
  deleteChatThread,
  deleteCourseAnnouncement,
  deleteCourseAssessment,
  deleteLearningMaterial,
  deleteLearningMaterialPage,
  deleteLearningModule,
  deleteScheduleEvent,
  downloadNexusAttachments,
  enqueueNexusPrompt,
  loadChatMessages,
  loadNexusPromptQueue,
  manageSectionEnrollment,
  markLearningProgress,
  renameChatThread,
  requestAttendanceCorrection,
  transitionInstitutionalInitiative,
  updateAcademicTerm,
  updateAttendanceSession,
  updateCatalogCourse,
  updateCourseAnnouncement,
  updateCourseSection,
  updateDepartment,
  updateLearningMaterial,
  updateLearningMaterialPage,
  updateLearningModule,
  updateNexusPromptQueue,
  updateProgram,
  updateScheduleEvent,
  uploadNexusAttachments,
} from "../platformRepository";
import { normalizeLessonHtml } from "../richLessonContent";
import {
  actionFingerprint,
  addAgentObservation,
  runSafetyStop,
  startSchoolAgentRun,
  type SchoolAgentRun,
} from "../schoolAgentLoop";
import type {
  ChatMessage,
  NexusAttachment,
  NexusPromptQueueItem,
  PlatformData,
  PlatformRole,
  SchoolAiAction,
} from "../types";

import type { NexusActivityState, PortalView } from "./shared";
import {
  navigationFor,
  navMeta,
  readNexusAttachment,
  teachingRoles,
} from "./shared";
export function validateSchoolAiAction(
  action: SchoolAiAction,
  data: PlatformData,
): string {
  if (!action.title.trim() && action.type !== "navigate")
    return "A title is required.";
  if (action.type === "create_assessment") {
    if (
      !action.sectionId ||
      !data.courses.some((course) => course.sectionId === action.sectionId)
    )
      return "The selected class section does not exist.";
    if (action.assessmentType === "quiz" || action.assessmentType === "exam") {
      if (!action.questions?.length)
        return "A quiz or exam requires at least one complete question.";
      const invalidQuestion = action.questions.find(
        (question) =>
          !question.prompt.trim() ||
          question.points <= 0 ||
          question.options.length < 2 ||
          !Number.isInteger(question.correctOption) ||
          question.correctOption < 1 ||
          question.correctOption > question.options.length ||
          question.options.some((option) => !option.trim()),
      );
      if (invalidQuestion)
        return "Every quiz or exam question needs a prompt, positive points, choices, and a valid answer.";
    }
  }
  if (
    action.type === "create_material" &&
    (!action.moduleId ||
      !data.modules.some(
        (module) =>
          module.id === action.moduleId &&
          module.sectionId === action.sectionId,
      ))
  )
    return "The selected module does not belong to that class section.";
  if (
    action.type === "create_material_page" &&
    (!action.materialId ||
      !data.materials.some((material) => material.id === action.materialId))
  )
    return "The proposed material ID is stale or unavailable. Re-resolve the exact material from the refreshed module and material context, then continue the same goal.";
  if (
    action.type === "update_material_page" &&
    (!action.targetId ||
      !data.materialPages.some((page) => page.id === action.targetId))
  )
    return "The proposed lesson-page ID is stale or unavailable. Re-resolve the exact page from refreshed context before continuing.";
  if (
    action.type === "create_program" &&
    (!action.departmentId ||
      !data.departments.some(
        (department) =>
          department.id === action.departmentId &&
          department.status === "active",
      ))
  )
    return "The selected active department does not exist.";
  if (
    action.type === "create_section" &&
    (!action.courseId ||
      !data.catalogCourses.some((subject) => subject.id === action.courseId))
  )
    return "The selected subject does not exist.";
  return "";
}

export function NexusAvatar({ label = true }: { label?: boolean }) {
  return (
    <span
      className="nexus-assistant-avatar"
      aria-label={label ? "Nexus AI assistant" : undefined}
    >
      <b>N</b>
      <i aria-hidden="true" />
    </span>
  );
}

export function SchoolAssistant({
  open,
  onClose,
  data,
  view,
  role,
  actorId,
  onNavigate,
  onDataChanged,
  onActivityChange,
}: {
  open: boolean;
  onClose: () => void;
  data: PlatformData;
  view: PortalView;
  role: PlatformRole;
  actorId: string;
  onNavigate: (view: PortalView) => void;
  onDataChanged: () => Promise<PlatformData | null>;
  onActivityChange: (state: NexusActivityState) => void;
}) {
  const lastThreadKey = `stu-nexus:last-thread:${actorId}`;
  const mostRecentThreadId = useCallback(
    () =>
      [...data.threads].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )[0]?.id ?? "",
    [data.threads],
  );
  const [threadId, setThreadId] = useState(() => {
    try {
      const saved = window.localStorage.getItem(lastThreadKey) ?? "";
      if (data.threads.some((thread) => thread.id === saved)) return saved;
    } catch {
      // Storage continuity is optional; the authoritative thread list remains usable.
    }
    return mostRecentThreadId();
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const modeKey = `stu-nexus:mode:${actorId}`;
  const [assistantMode, setAssistantMode] = useState<"qa" | "agentic">(() => {
    try {
      return window.localStorage.getItem(modeKey) === "qa" ? "qa" : "agentic";
    } catch {
      return "agentic";
    }
  });
  const [composerAttachments, setComposerAttachments] = useState<
    Array<{ file: File; input: NexusInputAttachment }>
  >([]);
  const [queuedPrompts, setQueuedPrompts] = useState<NexusPromptQueueItem[]>(
    [],
  );
  const queueProcessingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [persistenceWarning, setPersistenceWarning] = useState("");
  const [threadNotice, setThreadNotice] = useState("");
  const [threadDialog, setThreadDialog] = useState<null | {
    mode: "rename" | "delete";
    threadId: string;
    title: string;
  }>(null);
  const [threadActionBusy, setThreadActionBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<SchoolAiAction | null>(
    null,
  );
  const [curriculumDepartmentId, setCurriculumDepartmentId] = useState("");
  const [agentRun, setAgentRun] = useState<SchoolAgentRun | null>(null);
  const [goalExpanded, setGoalExpanded] = useState(false);
  const [actionFeedbackOpen, setActionFeedbackOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState("");
  const [activity, setActivity] = useState<{
    state: NexusActivityState;
    label: string;
  }>({ state: "idle", label: "Ready for your next goal." });
  const activeRunId = useRef("");
  const activeAttachmentsRef = useRef<NexusInputAttachment[]>([]);
  const activeModeRef = useRef<"qa" | "agentic">(assistantMode);
  const rejectedProposalRef = useRef<{
    fingerprint: string;
    feedback: string;
  } | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const nearLatestMessageRef = useRef(true);
  const restoredThreadRef = useRef("");

  useEffect(
    () => onActivityChange(activity.state),
    [activity.state, onActivityChange],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(modeKey, assistantMode);
    } catch {
      /* Mode persistence is optional. */
    }
  }, [assistantMode, modeKey]);

  useEffect(() => {
    void loadNexusPromptQueue()
      .then(setQueuedPrompts)
      .catch(() =>
        setPersistenceWarning("Queued prompts could not be restored."),
      );
  }, []);

  useEffect(() => {
    if (!threadId) return;
    try {
      window.localStorage.setItem(lastThreadKey, threadId);
    } catch {
      // Conversation history still persists remotely when browser storage is unavailable.
    }
  }, [lastThreadKey, threadId]);

  useEffect(() => {
    if (!threadId || data.threads.some((thread) => thread.id === threadId))
      return;
    setThreadId(mostRecentThreadId());
  }, [data.threads, mostRecentThreadId, threadId]);

  useEffect(() => {
    if (!open) return;
    nearLatestMessageRef.current = true;
    restoredThreadRef.current = "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const isInitialRestore = restoredThreadRef.current !== threadId;
    if (!isInitialRestore && !nearLatestMessageRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      nearLatestMessageRef.current = true;
      restoredThreadRef.current = threadId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, threadId, messages.length, loading]);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    void loadChatMessages(threadId)
      .then(setMessages)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Conversation history is unavailable.",
        ),
      );
  }, [threadId]);

  function addAssistantMessage(
    activeThread: string,
    content: string,
    citations: string[],
  ) {
    const item: ChatMessage = {
      id: `assistant-${Date.now()}-${Math.random()}`,
      threadId: activeThread,
      role: "assistant",
      content,
      citations,
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, item]);
    void appendChatMessage(activeThread, "assistant", content, citations);
  }

  async function saveThreadRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!threadDialog || threadDialog.mode !== "rename" || threadActionBusy)
      return;
    const title = threadDialog.title.trim();
    if (!title) {
      setError("Enter a conversation name.");
      return;
    }
    setThreadActionBusy(true);
    setError("");
    try {
      await renameChatThread(threadDialog.threadId, title);
      await onDataChanged();
      setThreadDialog(null);
      setThreadNotice("Conversation renamed.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Conversation could not be renamed.",
      );
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function removeThread() {
    if (!threadDialog || threadDialog.mode !== "delete" || threadActionBusy)
      return;
    setThreadActionBusy(true);
    setError("");
    try {
      const removedId = threadDialog.threadId;
      await deleteChatThread(removedId);
      const nextId =
        [...data.threads]
          .filter((thread) => thread.id !== removedId)
          .sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime(),
          )[0]?.id ?? "";
      if (threadId === removedId) {
        setThreadId(nextId);
        setMessages([]);
        try {
          if (nextId) window.localStorage.setItem(lastThreadKey, nextId);
          else window.localStorage.removeItem(lastThreadKey);
        } catch {
          // Remote conversation state remains authoritative.
        }
      }
      setQueuedPrompts((current) =>
        current.filter((item) => item.threadId !== removedId),
      );
      await onDataChanged();
      setThreadDialog(null);
      setThreadNotice("Conversation deleted.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Conversation could not be deleted.",
      );
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function openMessageAttachment(attachment: NexusAttachment) {
    setError("");
    try {
      const [file] = await downloadNexusAttachments([attachment]);
      if (!file) throw new Error("The attachment is unavailable.");
      const url = URL.createObjectURL(file);
      const target = window.open(url, "_blank", "noopener,noreferrer");
      if (!target) {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Attachment could not be opened.",
      );
    }
  }

  async function advanceAgent(
    run: SchoolAgentRun,
    activeThread: string,
    contextData: PlatformData = data,
  ) {
    if (activeRunId.current !== run.id) return;
    const stopReason = runSafetyStop(run);
    if (stopReason) {
      const stopped = {
        ...run,
        status: "impossible" as const,
        terminalReason: stopReason,
      };
      setAgentRun(stopped);
      setActivity({ state: "blocked", label: stopReason });
      addAssistantMessage(activeThread, stopReason, ["Nexus safety limit"]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setActivity({
      state: "thinking",
      label: "Nexus is reviewing the goal and choosing the next safe action…",
    });
    try {
      const answer = await askSchoolAssistant(
        run.goal,
        messages,
        { view, data: contextData },
        {
          runId: run.id,
          goal: run.goal,
          step: run.step,
          maxSteps: run.maxSteps,
          observations: run.observations,
        },
        activeModeRef.current,
        activeAttachmentsRef.current,
      );
      if (activeRunId.current !== run.id) return;
      addAssistantMessage(activeThread, answer.answer, answer.citations);
      const decided: SchoolAgentRun = {
        ...run,
        status: answer.agent.status,
        summary: answer.agent.stepSummary,
        terminalReason: answer.agent.terminalReason,
        plan: answer.agent.plan,
        remainingWork: answer.agent.remainingWork,
        clarification: answer.agent.clarification,
      };
      if (answer.agent.status === "needs_input" && answer.agent.clarification) {
        setAgentRun({ ...decided, status: "awaiting_input" });
        setPendingAction(null);
        setActivity({
          state: "waiting",
          label: "Nexus needs one decision to continue this same goal.",
        });
        return;
      }
      if (answer.agent.status !== "working" || !answer.proposedAction) {
        setAgentRun(decided);
        setPendingAction(null);
        setActivity({
          state: answer.agent.status === "complete" ? "complete" : "blocked",
          label:
            answer.agent.status === "complete"
              ? "Goal complete."
              : answer.agent.terminalReason ||
                "Nexus cannot safely continue this goal.",
        });
        return;
      }
      const proposed = answer.proposedAction;
      const action: SchoolAiAction =
        proposed.type === "create_material_page" ||
        proposed.type === "update_material_page"
          ? { ...proposed, content: normalizeLessonHtml(proposed.content) }
          : proposed;
      const rejectedProposal = rejectedProposalRef.current;
      if (
        rejectedProposal &&
        actionFingerprint(action) === rejectedProposal.fingerprint
      ) {
        const unchanged = addAgentObservation(
          decided,
          {
            step: run.step,
            actionType: action.type,
            outcome: "blocked",
            summary: `The revised proposal did not change the rejected parameters. Required correction: ${rejectedProposal.feedback}`,
          },
          action,
        );
        await recordSchoolAgentAction(action.type, "blocked");
        setAgentRun(unchanged);
        setActivity({
          state: "thinking",
          label:
            "Nexus returned the same invalid parameters and is correcting them again…",
        });
        await advanceAgent(unchanged, activeThread, contextData);
        return;
      }
      const proposalProblem = validateSchoolAiAction(action, contextData);
      if (proposalProblem) {
        const corrected = addAgentObservation(decided, {
          step: run.step,
          actionType: action.type,
          outcome: "blocked",
          summary: `Proposed parameters were invalid and were not shown for review: ${proposalProblem}`,
        });
        await recordSchoolAgentAction(action.type, "blocked");
        setAgentRun(corrected);
        setActivity({
          state: "thinking",
          label: "Nexus is correcting an invalid proposal…",
        });
        await advanceAgent(corrected, activeThread, contextData);
        return;
      }
      if (action.type === "navigate") {
        if (
          !action.destination ||
          !navigationFor(role).includes(action.destination)
        ) {
          const blocked = addAgentObservation(
            decided,
            {
              step: run.step + 1,
              actionType: action.type,
              outcome: "blocked",
              summary: "The requested workspace is unavailable for this role.",
            },
            action,
          );
          await recordSchoolAgentAction(action.type, "blocked");
          setAgentRun(blocked);
          await advanceAgent(blocked, activeThread, contextData);
          return;
        }
        onNavigate(action.destination);
        setActivity({
          state: "executing",
          label: `Opening ${navMeta[action.destination].label}…`,
        });
        await recordSchoolAgentAction(action.type, "success");
        const progressed = addAgentObservation(
          decided,
          {
            step: run.step + 1,
            actionType: action.type,
            outcome: "success",
            summary: `Opened ${navMeta[action.destination].label}.`,
          },
          action,
        );
        setAgentRun(progressed);
        addAssistantMessage(
          activeThread,
          `Step ${progressed.step} complete — opened ${navMeta[action.destination].label}.`,
          ["Observed portal action"],
        );
        await advanceAgent(progressed, activeThread, contextData);
        return;
      }
      if (action.type === "create_curriculum") {
        const activeDepartments = contextData.departments.filter(
          (department) => department.status === "active",
        );
        const requestedDepartment = activeDepartments.find(
          (department) => department.id === action.departmentId,
        );
        setCurriculumDepartmentId(
          requestedDepartment?.id ??
            (activeDepartments.length === 1 ? activeDepartments[0].id : ""),
        );
      }
      setAgentRun({ ...decided, status: "awaiting_confirmation" });
      rejectedProposalRef.current = null;
      setPendingAction(action);
      setActivity({
        state: "waiting",
        label: `Waiting for confirmation: ${action.type.replaceAll("_", " ")}.`,
      });
    } catch (reason) {
      if (activeRunId.current !== run.id) return;
      const detail =
        reason instanceof Error
          ? reason.message
          : "Nexus AI could not continue the goal.";
      setAgentRun({ ...run, status: "impossible", terminalReason: detail });
      setActivity({ state: "blocked", label: detail });
      setError(detail);
    } finally {
      if (activeRunId.current === run.id) setLoading(false);
    }
  }

  const advanceQueuedAgentRef = useRef(advanceAgent);
  advanceQueuedAgentRef.current = advanceAgent;

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt =
      message.trim() ||
      (composerAttachments.length
        ? "Review and explain the attached files."
        : "");
    if (!prompt) return;
    setError("");
    setPersistenceWarning("");
    setMessage("");
    const selectedAttachments = [...composerAttachments];
    setComposerAttachments([]);
    try {
      let activeThread = threadId;
      if (!activeThread) {
        const created = await createChatThread(prompt.slice(0, 70));
        activeThread = created.id;
        setThreadId(created.id);
        onDataChanged();
      }
      const persistedAttachments = selectedAttachments.length
        ? await uploadNexusAttachments(
            activeThread,
            selectedAttachments.map((item) => item.file),
          )
        : [];
      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        threadId: activeThread,
        role: "user",
        content: prompt,
        citations: [],
        attachments: persistedAttachments,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, userMessage]);
      try {
        await appendChatMessage(
          activeThread,
          "user",
          prompt,
          [],
          persistedAttachments,
        );
      } catch {
        setPersistenceWarning(
          "Nexus can continue, but this message could not be added to conversation history.",
        );
      }
      const mustQueue =
        loading ||
        Boolean(pendingAction) ||
        Boolean(
          agentRun &&
          ["working", "awaiting_confirmation"].includes(agentRun.status),
        );
      if (mustQueue) {
        const queued = await enqueueNexusPrompt({
          threadId: activeThread,
          prompt,
          mode: assistantMode,
          attachments: persistedAttachments,
        });
        setQueuedPrompts((current) => [...current, queued]);
        setActivity((current) => ({
          ...current,
          label: `${current.label} ${queuedPrompts.length + 1} message${queuedPrompts.length ? "s are" : " is"} queued.`,
        }));
        return;
      }
      setPendingAction(null);
      if (
        agentRun?.status === "awaiting_input" &&
        activeRunId.current === agentRun.id
      ) {
        const resumed = addAgentObservation(
          { ...agentRun, status: "working", clarification: null },
          {
            step: agentRun.step,
            actionType: "reasoning",
            outcome: "success",
            summary: `User clarification: ${prompt.slice(0, 500)}`,
          },
        );
        setAgentRun(resumed);
        setActivity({
          state: "thinking",
          label:
            "Clarification received. Nexus is continuing the existing goal…",
        });
        await advanceAgent(resumed, activeThread);
        return;
      }
      activeModeRef.current = assistantMode;
      activeAttachmentsRef.current = selectedAttachments.map(
        (item) => item.input,
      );
      const run = startSchoolAgentRun(prompt);
      rejectedProposalRef.current = null;
      setGoalExpanded(false);
      activeRunId.current = run.id;
      setAgentRun(run);
      setActivity({
        state: "thinking",
        label:
          assistantMode === "qa"
            ? "Nexus is reviewing your question and attachments…"
            : "Nexus is starting the goal…",
      });
      await advanceAgent(run, activeThread);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Nexus AI could not start the goal.",
      );
      setActivity({
        state: "blocked",
        label:
          reason instanceof Error
            ? reason.message
            : "Nexus AI could not start the goal.",
      });
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      queueProcessingRef.current ||
      loading ||
      pendingAction ||
      !queuedPrompts.length
    )
      return;
    if (
      agentRun &&
      ["working", "awaiting_confirmation", "awaiting_input"].includes(
        agentRun.status,
      )
    )
      return;
    const queued = queuedPrompts[0];
    queueProcessingRef.current = true;
    void (async () => {
      try {
        await updateNexusPromptQueue(queued.id, "processing");
        setThreadId(queued.threadId);
        const files = queued.attachments.length
          ? await downloadNexusAttachments(queued.attachments)
          : [];
        const inputs = await Promise.all(files.map(readNexusAttachment));
        activeModeRef.current = queued.mode;
        activeAttachmentsRef.current = inputs;
        const run = startSchoolAgentRun(queued.prompt);
        activeRunId.current = run.id;
        setAgentRun(run);
        setActivity({
          state: "thinking",
          label:
            queued.mode === "qa"
              ? "Answering the next queued question…"
              : "Starting the next queued goal…",
        });
        await advanceQueuedAgentRef.current(run, queued.threadId);
        await updateNexusPromptQueue(queued.id, "completed");
        setQueuedPrompts((current) =>
          current.filter((item) => item.id !== queued.id),
        );
      } catch (reason) {
        const detail =
          reason instanceof Error
            ? reason.message
            : "The queued message could not be processed.";
        await updateNexusPromptQueue(queued.id, "failed", detail).catch(
          () => undefined,
        );
        setQueuedPrompts((current) =>
          current.filter((item) => item.id !== queued.id),
        );
        setError(detail);
      } finally {
        queueProcessingRef.current = false;
      }
    })();
  }, [agentRun, loading, pendingAction, queuedPrompts]);

  async function answerClarification(answer: string) {
    if (
      !agentRun ||
      agentRun.status !== "awaiting_input" ||
      !threadId ||
      loading
    )
      return;
    setError("");
    const userMessage: ChatMessage = {
      id: `clarification-${Date.now()}`,
      threadId,
      role: "user",
      content: answer,
      citations: [],
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    try {
      await appendChatMessage(threadId, "user", answer);
    } catch {
      setPersistenceWarning(
        "Nexus is continuing, but this answer could not be added to conversation history.",
      );
    }
    const resumed = addAgentObservation(
      { ...agentRun, status: "working", clarification: null },
      {
        step: agentRun.step,
        actionType: "reasoning",
        outcome: "success",
        summary: `User clarification: ${answer.slice(0, 500)}`,
      },
    );
    setAgentRun(resumed);
    setActivity({
      state: "thinking",
      label: "Answer received. Nexus is continuing the existing goal…",
    });
    await advanceAgent(resumed, threadId);
  }

  async function selectComposerAttachments(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []).map((file) => {
      if (file.type) return file;
      const extension = file.name.toLowerCase().split(".").pop();
      const mime =
        extension === "md"
          ? "text/markdown"
          : extension === "txt"
            ? "text/plain"
            : extension === "csv"
              ? "text/csv"
              : extension === "json"
                ? "application/json"
                : "";
      return mime
        ? new File([file], file.name, {
            type: mime,
            lastModified: file.lastModified,
          })
        : file;
    });
    event.target.value = "";
    if (composerAttachments.length + files.length > 5) {
      setError("Attach no more than five files to one message.");
      return;
    }
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/json",
      "text/markdown",
    ]);
    const invalid = files.find(
      (file) => !allowed.has(file.type) || file.size > 5 * 1024 * 1024,
    );
    if (invalid) {
      setError(
        `${invalid.name} is not a supported image, PDF, or text file under 5 MB.`,
      );
      return;
    }
    if (
      [...composerAttachments.map((item) => item.file), ...files].reduce(
        (total, file) => total + file.size,
        0,
      ) >
      6 * 1024 * 1024
    ) {
      setError("Keep the combined attachment size under 6 MB.");
      return;
    }
    try {
      const inputs = await Promise.all(files.map(readNexusAttachment));
      setComposerAttachments((current) => [
        ...current,
        ...files.map((file, index) => ({ file, input: inputs[index] })),
      ]);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The attachments could not be read.",
      );
    }
  }

  async function retryProposedAction() {
    const feedback = actionFeedback.trim();
    if (!pendingAction || !agentRun || !threadId || !feedback || loading)
      return;
    const rejectedType = pendingAction.type;
    rejectedProposalRef.current = {
      fingerprint: actionFingerprint(pendingAction),
      feedback: feedback.slice(0, 500),
    };
    const userMessage: ChatMessage = {
      id: `proposal-feedback-${Date.now()}`,
      threadId,
      role: "user",
      content: `Please revise the proposed ${rejectedType.replaceAll("_", " ")}: ${feedback}`,
      citations: [],
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    try {
      await appendChatMessage(threadId, "user", userMessage.content);
    } catch {
      setPersistenceWarning(
        "Nexus is continuing, but this correction could not be added to conversation history.",
      );
    }
    const resumed = addAgentObservation(
      { ...agentRun, status: "working" },
      {
        step: agentRun.step,
        actionType: rejectedType,
        outcome: "blocked",
        summary: `User rejected this proposal and requested a revision: ${feedback.slice(0, 500)}`,
      },
      pendingAction,
    );
    setPendingAction(null);
    setActionFeedback("");
    setActionFeedbackOpen(false);
    setAgentRun(resumed);
    setActivity({
      state: "thinking",
      label: "Nexus is revising the proposal from your comment…",
    });
    await advanceAgent(resumed, threadId);
  }

  async function confirmAction() {
    if (!pendingAction || loading) return;
    const action = pendingAction;
    const stopAsImpossible = (reason: string) => {
      setPendingAction(null);
      setError(reason);
      if (agentRun)
        setAgentRun({
          ...agentRun,
          status: "impossible",
          terminalReason: reason,
        });
    };
    const allowed =
      role === "student"
        ? new Set([
            "navigate",
            "mark_learning_progress",
            "create_communication_request",
            "create_support_request",
            "request_attendance_correction",
          ])
        : teachingRoles.has(role)
          ? new Set([
              "navigate",
              "create_module",
              "create_material",
              "create_material_page",
              "create_assessment",
              "create_announcement",
              "create_attendance",
              "create_schedule_event",
              "update_module",
              "delete_module",
              "update_material",
              "delete_material",
              "update_material_page",
              "delete_material_page",
              "delete_assessment",
              "update_announcement",
              "delete_announcement",
              "update_attendance",
              "delete_attendance",
              "update_schedule_event",
              "delete_schedule_event",
              "create_communication_request",
              "create_support_request",
              ...([
                "owner",
                "admin",
                "dean",
                "department_head",
                "faculty",
              ].includes(role)
                ? ["decide_attendance_correction"]
                : []),
              ...(["owner", "admin", "dean", "department_head"].includes(role)
                ? ["create_initiative", "transition_initiative"]
                : []),
              ...(["owner", "admin", "dean", "registrar"].includes(role)
                ? ["create_department"]
                : []),
              ...([
                "owner",
                "admin",
                "dean",
                "registrar",
                "department_head",
              ].includes(role)
                ? [
                    "create_program",
                    "create_academic_term",
                    "create_subject",
                    "create_section",
                    "enroll_student",
                    "update_department",
                    "update_program",
                    "update_academic_term",
                    "update_subject",
                    "update_section",
                  ]
                : []),
              ...(role === "faculty" ? [] : ["create_curriculum"]),
            ])
          : new Set([
              "navigate",
              "create_schedule_event",
              "update_schedule_event",
              "delete_schedule_event",
              "create_communication_request",
              ...(["advisor", "support"].includes(role)
                ? ["create_support_request"]
                : []),
              ...(role === "registrar" ? ["decide_attendance_correction"] : []),
              ...([
                "owner",
                "admin",
                "president",
                "vice_president",
                "dean",
                "registrar",
                "department_head",
              ].includes(role)
                ? ["create_initiative", "transition_initiative"]
                : []),
              ...(["owner", "admin", "dean", "registrar"].includes(role)
                ? ["create_department"]
                : []),
              ...([
                "owner",
                "admin",
                "dean",
                "registrar",
                "department_head",
              ].includes(role)
                ? [
                    "create_program",
                    "create_academic_term",
                    "create_subject",
                    "create_section",
                    "enroll_student",
                    "update_department",
                    "update_program",
                    "update_academic_term",
                    "update_subject",
                    "update_section",
                  ]
                : []),
              ...([
                "owner",
                "admin",
                "dean",
                "registrar",
                "department_head",
              ].includes(role)
                ? ["create_curriculum"]
                : []),
            ]);
    if (!allowed.has(action.type)) {
      void recordSchoolAgentAction(action.type, "blocked");
      setPendingAction(null);
      setError("That action is not available for your signed-in role.");
      if (agentRun)
        setAgentRun({
          ...agentRun,
          status: "impossible",
          terminalReason:
            "The signed-in role is not authorized for the proposed action.",
        });
      return;
    }
    if (role === "student" && action.type.includes("assessment")) {
      void recordSchoolAgentAction(action.type, "blocked");
      setPendingAction(null);
      setError("Nexus cannot complete or change assessed work for students.");
      if (agentRun)
        setAgentRun({
          ...agentRun,
          status: "impossible",
          terminalReason:
            "Student assessed work is permanently outside Nexus action authority.",
        });
      return;
    }
    if (action.type === "navigate") {
      if (
        !action.destination ||
        !navigationFor(role).includes(action.destination)
      ) {
        setError("That workspace is not available for your role.");
        return;
      }
      onNavigate(action.destination);
      void recordSchoolAgentAction(action.type, "success");
      const confirmation = `Done — I opened ${navMeta[action.destination].label}.`;
      setMessages((current) => [
        ...current,
        {
          id: `assistant-action-${Date.now()}`,
          threadId,
          role: "assistant",
          content: confirmation,
          citations: ["Confirmed portal action"],
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      if (threadId)
        void appendChatMessage(threadId, "assistant", confirmation, [
          "Confirmed portal action",
        ]);
      setPendingAction(null);
      return;
    }
    const course = data.courses.find(
      (item) => item.sectionId === action.sectionId,
    );
    const module = data.modules.find((item) => item.id === action.moduleId);
    const material = data.materials.find(
      (item) => item.id === action.materialId,
    );
    if (action.type === "mark_learning_progress") {
      if (!material || !action.materialId) {
        stopAsImpossible("That learning material is no longer available.");
        return;
      }
    } else if (action.type === "create_material_page") {
      if (!material || !action.materialId) {
        setPendingAction(null);
        setActivity({
          state: "refreshing",
          label:
            "The material reference changed. Refreshing and replanning the same goal…",
        });
        const refreshedData = (await onDataChanged()) ?? data;
        if (agentRun && threadId) {
          const replanning = addAgentObservation(
            { ...agentRun, status: "working" },
            {
              step: agentRun.step,
              actionType: action.type,
              outcome: "error",
              summary: `The proposed material ID ${action.materialId || "(missing)"} is stale or deleted. Re-resolve the intended material by its module and title from refreshed context, preserve the remaining page plan, and continue without repeating successful pages.`,
            },
            action,
          );
          setAgentRun(replanning);
          await advanceAgent(replanning, threadId, refreshedData);
        } else {
          setError(
            "The lesson changed before this page was saved. Ask Nexus to retry against the refreshed material list.",
          );
        }
        return;
      }
    } else if (
      action.type !== "create_material" &&
      action.type !== "create_schedule_event" &&
      action.type !== "create_department" &&
      action.type !== "create_program" &&
      action.type !== "create_academic_term" &&
      action.type !== "create_subject" &&
      action.type !== "create_section" &&
      action.type !== "update_department" &&
      action.type !== "update_program" &&
      action.type !== "update_academic_term" &&
      action.type !== "update_subject" &&
      action.type !== "update_section" &&
      action.type !== "update_module" &&
      action.type !== "delete_module" &&
      action.type !== "update_material" &&
      action.type !== "delete_material" &&
      action.type !== "update_material_page" &&
      action.type !== "delete_material_page" &&
      action.type !== "delete_assessment" &&
      action.type !== "update_announcement" &&
      action.type !== "delete_announcement" &&
      action.type !== "update_attendance" &&
      action.type !== "delete_attendance" &&
      action.type !== "update_schedule_event" &&
      action.type !== "delete_schedule_event" &&
      action.type !== "create_support_request" &&
      action.type !== "create_communication_request" &&
      action.type !== "request_attendance_correction" &&
      action.type !== "decide_attendance_correction" &&
      action.type !== "create_initiative" &&
      action.type !== "transition_initiative" &&
      action.type !== "create_curriculum" &&
      !course
    ) {
      stopAsImpossible(
        "That course is no longer available. Ask Nexus to prepare the change again.",
      );
      return;
    }
    if (
      action.type === "create_material" &&
      (!module || module.sectionId !== action.sectionId)
    ) {
      stopAsImpossible(
        "That learning module is no longer available. Ask Nexus to prepare the change again.",
      );
      return;
    }
    setLoading(true);
    setActivity({
      state: "executing",
      label: `Executing confirmed action: ${action.type.replaceAll("_", " ")}…`,
    });
    setError("");
    try {
      let createdId = "";
      let resultSummary = "";
      if (action.type === "create_department") {
        createdId = await createDepartment({
          code: action.code,
          name: action.title,
          description: action.description,
        });
        resultSummary = `Created academic department ${action.code.toUpperCase()} · ${action.title} with record ID ${createdId}.`;
      }
      if (action.type === "create_program") {
        createdId = await createProgram({
          departmentId: action.departmentId!,
          code: action.code,
          name: action.title,
          level: action.level || "bachelor",
          durationYears: action.durationYears ?? 4,
          description: action.description,
        });
      }
      if (action.type === "create_academic_term") {
        createdId = await createAcademicTerm({
          code: action.code,
          name: action.title,
          startsOn: action.startsAt!,
          endsOn: action.endsAt!,
          status: action.status || "planning",
        });
      }
      if (action.type === "create_subject") {
        createdId = await createCatalogCourse({
          departmentId: action.departmentId!,
          programId: action.programId ?? undefined,
          code: action.code,
          title: action.title,
          description: action.description,
          credits: action.credits ?? 3,
        });
      }
      if (action.type === "create_section") {
        createdId = await createCourseSection({
          courseId: action.courseId!,
          termId: action.termId!,
          sectionCode: action.code,
          facultyId: action.facultyId ?? undefined,
          modality: action.modality || "in_person",
          room: action.room || undefined,
          capacity: action.capacity ?? 40,
          status: action.status || "planned",
        });
      }
      if (action.type === "enroll_student") {
        const enrollment = await manageSectionEnrollment(
          action.sectionId!,
          action.studentId!,
          action.status || "enrolled",
        );
        createdId = enrollment?.enrollment_id ?? "";
      }
      if (action.type === "update_department")
        await updateDepartment(action.targetId!, {
          code: action.code,
          name: action.title,
          description: action.description,
          status: action.status || "active",
        });
      if (action.type === "update_program")
        await updateProgram(action.targetId!, {
          departmentId: action.departmentId!,
          code: action.code,
          name: action.title,
          level: action.level || "bachelor",
          durationYears: action.durationYears ?? 4,
          description: action.description,
          status: action.status || "active",
        });
      if (action.type === "update_academic_term")
        await updateAcademicTerm(action.targetId!, {
          code: action.code,
          name: action.title,
          startsOn: action.startsAt!,
          endsOn: action.endsAt!,
          status: action.status || "planning",
        });
      if (action.type === "update_subject")
        await updateCatalogCourse(action.targetId!, {
          departmentId: action.departmentId!,
          programId: action.programId ?? undefined,
          code: action.code,
          title: action.title,
          description: action.description,
          credits: action.credits ?? 3,
          status: action.status || "active",
        });
      if (action.type === "update_section")
        await updateCourseSection(action.sectionId!, {
          facultyId: action.facultyId ?? undefined,
          modality: action.modality || "in_person",
          room: action.room || undefined,
          capacity: action.capacity ?? 40,
          status: action.status || "planned",
        });
      if (action.type === "create_curriculum") {
        if (!action.curriculum)
          throw new Error(
            "The curriculum plan is missing its structured subject plan.",
          );
        const selectedDepartment = data.departments.find(
          (department) =>
            department.id === curriculumDepartmentId &&
            department.status === "active",
        );
        if (!selectedDepartment)
          throw new Error(
            "Select the active academic department that will own this curriculum.",
          );
        const result = await createAcademicCurriculum(
          selectedDepartment.id,
          agentRun?.id ?? `curriculum-${Date.now()}`,
          action.curriculum,
        );
        createdId = result.planId;
        resultSummary = `${result.status === "reused" ? "Reused" : "Created"} curriculum with ${result.subjects} subjects, ${result.prerequisites} prerequisite links, and ${result.blocks} block templates.`;
      }
      if (action.type === "create_module")
        createdId = await createLearningModule({
          sectionId: action.sectionId!,
          title: action.title,
          description: action.description,
          position:
            data.modules.filter((item) => item.sectionId === action.sectionId)
              .length + 1,
          publish: action.publish,
        });
      if (action.type === "update_module")
        await updateLearningModule(action.moduleId!, {
          title: action.title,
          description: action.description,
        });
      if (action.type === "delete_module")
        await deleteLearningModule(action.moduleId!);
      if (action.type === "create_material")
        createdId = await createLearningMaterial({
          moduleId: action.moduleId!,
          title: action.title,
          description: action.description,
          type: action.materialType ?? "lesson",
          content: action.content,
          externalUrl: action.externalUrl ?? undefined,
          position:
            data.materials.filter((item) => item.moduleId === action.moduleId)
              .length + 1,
          minutes: Math.max(1, Math.min(1440, action.minutes ?? 20)),
          required: action.required ?? true,
          publish: action.publish,
        });
      if (action.type === "update_material")
        await updateLearningMaterial(action.materialId!, {
          title: action.title,
          description: action.description,
          type: action.materialType ?? "lesson",
          content: action.content,
          externalUrl: action.externalUrl ?? undefined,
          minutes: Math.max(1, Math.min(1440, action.minutes ?? 20)),
          required: action.required ?? true,
          publish: action.publish,
        });
      if (action.type === "delete_material")
        await deleteLearningMaterial(action.materialId!);
      if (action.type === "create_material_page")
        await createLearningMaterialPage({
          materialId: action.materialId!,
          title: action.title,
          content: action.content,
          position:
            Math.max(
              0,
              ...data.materialPages
                .filter((item) => item.materialId === action.materialId)
                .map((item) => item.position),
            ) + 1,
        });
      if (action.type === "update_material_page")
        await updateLearningMaterialPage(action.targetId!, {
          title: action.title,
          content: action.content,
        });
      if (action.type === "delete_material_page")
        await deleteLearningMaterialPage(action.targetId!);
      if (action.type === "create_assessment")
        await createCourseAssessment({
          sectionId: action.sectionId!,
          title: action.title,
          instructions: action.content || action.description,
          type: action.assessmentType ?? "assignment",
          dueAt: action.dueAt ?? undefined,
          maxScore: Math.max(1, Math.min(1000, action.maxScore ?? 100)),
          publish: action.publish,
          questions: action.questions ?? [],
        });
      if (action.type === "delete_assessment")
        await deleteCourseAssessment(action.targetId!);
      if (action.type === "create_announcement")
        await createCourseAnnouncement({
          sectionId: action.sectionId!,
          title: action.title,
          body: action.content || action.description,
          priority: action.priority ?? "normal",
        });
      if (action.type === "update_announcement")
        await updateCourseAnnouncement(action.targetId!, {
          title: action.title,
          body: action.content || action.description,
          priority: action.priority ?? "normal",
        });
      if (action.type === "delete_announcement")
        await deleteCourseAnnouncement(action.targetId!);
      if (action.type === "create_attendance")
        await createAttendanceSession({
          sectionId: action.sectionId!,
          title: action.title,
          startsAt: action.startsAt ?? new Date().toISOString(),
          endsAt:
            action.endsAt ??
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      if (action.type === "update_attendance")
        await updateAttendanceSession(action.targetId!, {
          title: action.title,
          startsAt: action.startsAt!,
          endsAt: action.endsAt!,
          status: action.status || "open",
        });
      if (action.type === "delete_attendance")
        await deleteAttendanceSession(action.targetId!);
      if (action.type === "create_schedule_event")
        await createScheduleEvent({
          sectionId: action.sectionId ?? undefined,
          title: action.title,
          description: action.description || action.content,
          eventType: "school_event",
          startsAt: action.startsAt ?? new Date().toISOString(),
          endsAt:
            action.endsAt ??
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          location: action.location ?? undefined,
        });
      if (action.type === "update_schedule_event")
        await updateScheduleEvent(action.targetId!, {
          sectionId: action.sectionId ?? undefined,
          title: action.title,
          description: action.description || action.content,
          eventType: "school_event",
          startsAt: action.startsAt!,
          endsAt: action.endsAt!,
          location: action.location ?? undefined,
        });
      if (action.type === "delete_schedule_event")
        await deleteScheduleEvent(action.targetId!);
      if (action.type === "create_support_request")
        createdId = await createStudentSupportRequest({
          studentId: action.studentId || actorId,
          title: action.title,
          category: action.code || "general",
          description: action.description || action.content,
          priority:
            action.priority === "urgent"
              ? "high"
              : action.priority === "important"
                ? "medium"
                : "low",
        });
      if (action.type === "create_communication_request")
        await createCommunicationRequest({
          recipientId: action.recipientId!,
          subject: action.title,
          body: action.content || action.description,
          channel: "portal",
        });
      if (action.type === "request_attendance_correction")
        await requestAttendanceCorrection({
          attendanceRecordId: action.attendanceRecordId!,
          studentProfileId: actorId,
          requestedStatus: (action.status || "present") as
            "present" | "absent" | "late" | "excused",
          reason: action.reason || action.description,
        });
      if (action.type === "decide_attendance_correction")
        await decideAttendanceCorrection({
          requestId: action.requestId!,
          approve: action.approve ?? false,
          reason: action.reason || action.description,
        });
      if (action.type === "create_initiative")
        await createInstitutionalInitiative({
          type: (action.operation || "initiative") as
            "policy" | "initiative" | "teaching_plan" | "content_correction",
          title: action.title,
          description: action.description || action.content,
          scope: action.content || "Institution-wide",
          priority:
            action.priority === "urgent"
              ? "urgent"
              : action.priority === "important"
                ? "high"
                : "normal",
          dueAt: action.dueAt ?? null,
        });
      if (action.type === "transition_initiative")
        await transitionInstitutionalInitiative({
          initiativeId: action.initiativeId!,
          action: (action.operation || "assign") as
            "approve" | "assign" | "complete" | "reject" | "escalate",
          ownerId: action.ownerId ?? null,
          reason: action.reason || action.description,
        });
      if (action.type === "mark_learning_progress")
        await markLearningProgress(
          action.materialId!,
          action.completed ?? true,
        );
      await recordSchoolAgentAction(action.type, "success");
      const confirmation =
        "Done — the confirmed change is saved and your workspace is refreshing.";
      setMessages((current) => [
        ...current,
        {
          id: `assistant-action-${Date.now()}`,
          threadId,
          role: "assistant",
          content: confirmation,
          citations: ["Confirmed platform action"],
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      if (threadId)
        void appendChatMessage(threadId, "assistant", confirmation, [
          "Confirmed platform action",
        ]);
      setPendingAction(null);
      setActivity({
        state: "refreshing",
        label: "Action saved. Refreshing authoritative platform records…",
      });
      const refreshedData = await onDataChanged();
      if (agentRun && activeRunId.current === agentRun.id) {
        const progressed = addAgentObservation(
          agentRun,
          {
            step: agentRun.step + 1,
            actionType: action.type,
            outcome: "success",
            summary:
              resultSummary ||
              `The confirmed ${action.type.replaceAll("_", " ")} action was saved successfully${createdId ? ` with record ID ${createdId}` : ""}.`,
          },
          action,
        );
        setAgentRun(progressed);
        await advanceAgent(progressed, threadId, refreshedData ?? data);
      }
    } catch (reason) {
      void recordSchoolAgentAction(action.type, "error");
      setError(
        reason instanceof Error
          ? reason.message
          : "The proposed change could not be saved.",
      );
      const failure =
        reason instanceof Error
          ? reason.message
          : "The confirmed action failed.";
      if (agentRun)
        setAgentRun(
          addAgentObservation(
            { ...agentRun, status: "working" },
            {
              step: agentRun.step,
              actionType: action.type,
              outcome: "error",
              summary: `Execution failed: ${failure}. Revise the proposal parameters before retrying.`,
            },
            action,
          ),
        );
      setActivity({
        state: "waiting",
        label:
          "The action failed. Confirm again only after correcting the proposal.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
  return (
    <div className="school-ai-layer">
      <aside>
        <header>
          <NexusAvatar />
          <div>
            <small>STU NEXUS</small>
            <h2>School AI Assistant</h2>
            <p>Role-aware · grounded · persistent</p>
          </div>
          <Button type="button" onClick={onClose}>
            ×
          </Button>
        </header>
        <div className="chat-thread-bar">
          <NativeSelect
            value={threadId}
            onChange={(event) => setThreadId(event.target.value)}
          >
            <NativeSelectOption value="">New conversation</NativeSelectOption>
            {data.threads.map((thread) => (
              <NativeSelectOption key={thread.id} value={thread.id}>
                {thread.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="button"
            className="chat-thread-action"
            aria-label="Rename conversation"
            title="Rename conversation"
            disabled={!threadId || loading || Boolean(pendingAction)}
            onClick={() => {
              const thread = data.threads.find((item) => item.id === threadId);
              if (thread)
                setThreadDialog({
                  mode: "rename",
                  threadId,
                  title: thread.title,
                });
            }}
            variant="ghost"
          >
            <span aria-hidden="true">✎</span>
          </Button>
          <Button
            type="button"
            className="chat-thread-action destructive"
            aria-label="Delete conversation"
            title={
              loading || pendingAction
                ? "Finish or cancel the active work before deleting"
                : "Delete conversation"
            }
            disabled={!threadId || loading || Boolean(pendingAction)}
            onClick={() => {
              const thread = data.threads.find((item) => item.id === threadId);
              if (thread)
                setThreadDialog({
                  mode: "delete",
                  threadId,
                  title: thread.title,
                });
            }}
            variant="ghost"
          >
            <span aria-hidden="true">⌫</span>
          </Button>
          <Button
            type="button"
            className="chat-thread-new"
            aria-label="Start a new conversation"
            title="New conversation"
            onClick={() => {
              activeRunId.current = "";
              rejectedProposalRef.current = null;
              setAgentRun(null);
              setPendingAction(null);
              setThreadId("");
              setMessages([]);
            }}
          >
            +
          </Button>
        </div>
        {threadNotice ? (
          <div className="chat-thread-notice" role="status">
            {threadNotice}
            <Button
              type="button"
              aria-label="Dismiss"
              onClick={() => setThreadNotice("")}
            >
              ×
            </Button>
          </div>
        ) : null}
        <div
          className="nexus-mode-switch"
          role="group"
          aria-label="Nexus assistant mode"
        >
          <Button
            type="button"
            className={assistantMode === "qa" ? "active" : ""}
            aria-pressed={assistantMode === "qa"}
            onClick={() => setAssistantMode("qa")}
          >
            <b>Ask</b>
            <small>Answers only</small>
          </Button>
          <Button
            type="button"
            className={assistantMode === "agentic" ? "active" : ""}
            aria-pressed={assistantMode === "agentic"}
            onClick={() => setAssistantMode("agentic")}
          >
            <b>Agentic</b>
            <small>Can prepare actions</small>
          </Button>
        </div>
        <div
          className="chat-messages"
          ref={messageViewportRef}
          onScroll={(event) => {
            const viewport = event.currentTarget;
            nearLatestMessageRef.current =
              viewport.scrollHeight -
                viewport.scrollTop -
                viewport.clientHeight <
              96;
          }}
        >
          {messages.length ? (
            messages.map((item) => (
              <Card key={item.id} className={item.role}>
                {item.role === "assistant" ? (
                  <NexusAvatar />
                ) : (
                  <span className="chat-user-avatar">YOU</span>
                )}
                <div>
                  {item.role === "assistant" ? (
                    <small className="chat-sender-name">Nexus</small>
                  ) : null}
                  <p>{item.content}</p>
                  {item.attachments.length ? (
                    <div className="chat-message-attachments">
                      {item.attachments.map((attachment) => (
                        <Button
                          type="button"
                          key={attachment.storagePath}
                          title={attachment.name}
                          aria-label={`Open attachment ${attachment.name}`}
                          className={
                            attachment.mimeType.startsWith("image/")
                              ? "image"
                              : "file"
                          }
                          onClick={() => void openMessageAttachment(attachment)}
                        >
                          <span aria-hidden="true">
                            {attachment.mimeType.startsWith("image/")
                              ? "▧"
                              : "▤"}
                          </span>
                          <small>
                            {attachment.name
                              .split(".")
                              .pop()
                              ?.slice(0, 4)
                              .toUpperCase() || "FILE"}
                          </small>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {item.citations.length ? (
                    <footer>
                      {item.citations.map((citation) => (
                        <small key={citation}>◫ {citation}</small>
                      ))}
                    </footer>
                  ) : null}
                </div>
              </Card>
            ))
          ) : (
            <div className="chat-welcome">
              <NexusAvatar />
              <h3>What can I help you accomplish?</h3>
              <p>
                Ask about your courses, schedule, assessments, teaching work,
                student support, or verified school information.
              </p>
              <div>
                {[
                  "Summarize my day",
                  "Explain the next topic",
                  "Help plan this class",
                ].map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {agentRun && activeModeRef.current === "agentic" ? (
            <Card className="assistant agent-progress-reply" aria-live="polite">
              <NexusAvatar />
              <details
                className={`chat-agent-run ${agentRun.status}`}
                open={goalExpanded}
                onToggle={(event) => setGoalExpanded(event.currentTarget.open)}
              >
                <summary>
                  <b>
                    {activity.state === "thinking"
                      ? "Thinking"
                      : activity.state === "executing"
                        ? "Working"
                        : activity.state === "waiting"
                          ? "Waiting for you"
                          : activity.state === "complete"
                            ? "Goal complete"
                            : activity.state === "blocked"
                              ? "Stopped"
                              : "Goal progress"}
                  </b>
                  <small>
                    {agentRun.step} done · {agentRun.remainingWork.length}{" "}
                    remaining
                  </small>
                </summary>
                <div className={`chat-agent-activity ${activity.state}`}>
                  <i aria-hidden="true" />
                  <span>
                    <b>{agentRun.goal}</b>
                    <small>{activity.label}</small>
                  </span>
                </div>
                {agentRun.plan.length ? (
                  <ol>
                    {agentRun.plan.map((item, index) => (
                      <li
                        key={`${index}-${item}`}
                        className={index < agentRun.step ? "done" : ""}
                      >
                        <b>{index < agentRun.step ? "✓" : index + 1}</b>
                        <span>
                          <small>{item}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {agentRun.observations.length ? (
                  <ol>
                    {agentRun.observations.map((observation, index) => (
                      <li
                        key={`${index}-${observation.step}-${observation.actionType}`}
                      >
                        <b>{observation.outcome === "success" ? "✓" : "!"}</b>
                        <span>
                          <strong>
                            {observation.actionType.replaceAll("_", " ")}
                          </strong>
                          <small>{observation.summary}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {agentRun.status === "working" ||
                agentRun.status === "awaiting_confirmation" ? (
                  <Button
                    type="button"
                    onClick={() => {
                      activeRunId.current = "";
                      setPendingAction(null);
                      setAgentRun({
                        ...agentRun,
                        status: "cancelled",
                        terminalReason: "Cancelled by you.",
                      });
                      setLoading(false);
                      setActivity({
                        state: "blocked",
                        label: "Goal cancelled by you.",
                      });
                    }}
                  >
                    Cancel goal
                  </Button>
                ) : null}
              </details>
            </Card>
          ) : null}
          {agentRun?.status === "awaiting_input" && agentRun.clarification ? (
            <Card className="assistant agent-question-reply">
              <NexusAvatar />
              <section
                className="chat-agent-question"
                role="group"
                aria-label="Nexus clarification required"
              >
                <b>One question</b>
                <h3>{agentRun.clarification.question}</h3>
                <div>
                  {agentRun.clarification.options.map((option) => (
                    <Button
                      type="button"
                      key={option}
                      onClick={() => void answerClarification(option)}
                      disabled={loading}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
                <small>Or type your answer below.</small>
              </section>
            </Card>
          ) : null}
          {loading ? (
            <Card className="assistant thinking">
              <NexusAvatar />
              <div>
                <i />
                <i />
                <i />
              </div>
            </Card>
          ) : null}
        </div>
        {error ? <div className="chat-error">{error}</div> : null}
        {persistenceWarning ? (
          <div className="chat-warning">{persistenceWarning}</div>
        ) : null}
        {queuedPrompts.length ? (
          <section className="nexus-queue" aria-label="Queued Nexus messages">
            <header>
              <b>{queuedPrompts.length} queued</b>
              <small>Nexus will continue automatically</small>
            </header>
            {queuedPrompts.map((queued, index) => (
              <Card key={queued.id}>
                <span>{index + 1}</span>
                <div>
                  <b>{queued.prompt}</b>
                  <small>
                    {queued.mode === "qa" ? "Ask mode" : "Agentic mode"}
                    {queued.attachments.length
                      ? ` · ${queued.attachments.length} attachment${queued.attachments.length === 1 ? "" : "s"}`
                      : ""}
                  </small>
                </div>
                <Button
                  type="button"
                  aria-label={`Remove queued message ${index + 1}`}
                  onClick={() =>
                    void updateNexusPromptQueue(queued.id, "cancelled")
                      .then(() =>
                        setQueuedPrompts((current) =>
                          current.filter((item) => item.id !== queued.id),
                        ),
                      )
                      .catch((reason: unknown) =>
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : "Queue update failed.",
                        ),
                      )
                  }
                >
                  ×
                </Button>
              </Card>
            ))}
          </section>
        ) : null}
        {pendingAction ? (
          <section className="chat-action-card">
            <span>READY FOR REVIEW</span>
            <strong>{pendingAction.confirmation || pendingAction.title}</strong>
            <p>
              Nexus prepared this change but has not saved it. Review and
              confirm to apply it with your account permissions.
            </p>
            {pendingAction.type === "create_curriculum" &&
            pendingAction.curriculum ? (
              <div className="chat-curriculum-preview">
                <b>
                  {pendingAction.curriculum.programCode} ·{" "}
                  {pendingAction.curriculum.programName}
                </b>
                <span>
                  {pendingAction.curriculum.subjects.length} subjects ·{" "}
                  {pendingAction.curriculum.blocks.length} blocks · Effective{" "}
                  {pendingAction.curriculum.effectiveYear}
                </span>
                <Label>
                  <span>Owning academic department</span>
                  <NativeSelect
                    value={curriculumDepartmentId}
                    onChange={(event) => {
                      setCurriculumDepartmentId(event.target.value);
                      setError("");
                    }}
                  >
                    <NativeSelectOption value="">
                      Select a department
                    </NativeSelectOption>
                    {data.departments
                      .filter((department) => department.status === "active")
                      .map((department) => (
                        <NativeSelectOption
                          key={department.id}
                          value={department.id}
                        >
                          {department.code} · {department.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Label>
                <details>
                  <summary>Review the four-year subject plan</summary>
                  {[1, 2, 3, 4].map((year) => (
                    <section key={year}>
                      <strong>Year {year}</strong>
                      <ul>
                        {pendingAction
                          .curriculum!.subjects.filter(
                            (subject) => subject.yearLevel === year,
                          )
                          .map((subject) => (
                            <li key={subject.code}>
                              {subject.code} · {subject.title} · {subject.units}{" "}
                              units · Sem {subject.semester}
                            </li>
                          ))}
                      </ul>
                    </section>
                  ))}
                </details>
              </div>
            ) : null}
            {actionFeedbackOpen ? (
              <div className="chat-action-feedback">
                <Label htmlFor="nexus-action-feedback">
                  What should Nexus change?
                </Label>
                <Textarea
                  id="nexus-action-feedback"
                  rows={2}
                  value={actionFeedback}
                  onChange={(event) => setActionFeedback(event.target.value)}
                  placeholder="For example: add five multiple-choice questions and make it 20 points."
                  autoFocus
                />
                <Button
                  type="button"
                  disabled={!actionFeedback.trim() || loading}
                  onClick={() => void retryProposedAction()}
                >
                  Revise proposal
                </Button>
              </div>
            ) : null}
            <div>
              <Button
                type="button"
                onClick={() => {
                  activeRunId.current = "";
                  setPendingAction(null);
                  if (agentRun)
                    setAgentRun({
                      ...agentRun,
                      status: "cancelled",
                      terminalReason:
                        "The proposed change and goal were cancelled by you.",
                    });
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setActionFeedbackOpen((value) => !value)}
                disabled={loading}
              >
                {actionFeedbackOpen ? "Close comment" : "Request changes"}
              </Button>
              <Button
                type="button"
                disabled={
                  loading ||
                  (pendingAction.type === "create_curriculum" &&
                    !curriculumDepartmentId)
                }
                onClick={() => void confirmAction()}
              >
                Confirm change
              </Button>
            </div>
          </section>
        ) : null}
        <form onSubmit={send}>
          {composerAttachments.length ? (
            <div
              className="nexus-composer-attachments"
              aria-label="Selected attachments"
            >
              {composerAttachments.map(({ file, input }, index) => (
                <span
                  key={`${file.name}-${file.lastModified}`}
                  title={file.name}
                >
                  {file.type.startsWith("image/") ? (
                    <img src={input.dataUrl} alt="" />
                  ) : (
                    <b aria-hidden="true">
                      {file.name.split(".").pop()?.slice(0, 4).toUpperCase() ||
                        "FILE"}
                    </b>
                  )}
                  <Button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    title={`Remove ${file.name}`}
                    onClick={() =>
                      setComposerAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    ×
                  </Button>
                </span>
              ))}
            </div>
          ) : null}
          <Textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              )
                return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder="Message Nexus AI…"
          />
          <div>
            <span>
              <Button
                type="button"
                className="nexus-attach-button"
                onClick={() => attachmentInputRef.current?.click()}
                aria-label="Attach images or files"
                title="Attach images or files"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9.5 17.5 17 10a3.5 3.5 0 0 0-5-5l-8 8a5 5 0 0 0 7 7l8.5-8.5" />
                </svg>
              </Button>{" "}
              Enter to send · Shift+Enter for a new line
            </span>
            <Input
              ref={attachmentInputRef}
              className="sr-only"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,application/json,text/markdown,.md"
              onChange={(event) => void selectComposerAttachments(event)}
            />
            <Button
              type="submit"
              disabled={!message.trim() && !composerAttachments.length}
            >
              {loading || pendingAction ? "Queue →" : "Send →"}
            </Button>
          </div>
        </form>
        {threadDialog ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !threadActionBusy) setThreadDialog(null);
            }}
          >
            <DialogContent>
              <DialogDescription className="sr-only">
                Manage this saved conversation.
              </DialogDescription>
              <form className="grid gap-5" onSubmit={saveThreadRename}>
                <span aria-hidden="true">
                  {threadDialog.mode === "rename" ? "✎" : "⌫"}
                </span>
                <div>
                  <DialogTitle id="nexus-thread-dialog-title">
                    {threadDialog.mode === "rename"
                      ? "Rename conversation"
                      : "Delete conversation?"}
                  </DialogTitle>
                  {threadDialog.mode === "rename" ? (
                    <Label>
                      <span>Conversation name</span>
                      <Input
                        value={threadDialog.title}
                        maxLength={120}
                        autoFocus
                        onChange={(event) =>
                          setThreadDialog({
                            ...threadDialog,
                            title: event.target.value,
                          })
                        }
                      />
                    </Label>
                  ) : (
                    <p>
                      “{threadDialog.title}” and its messages and attachments
                      will be permanently deleted.
                    </p>
                  )}
                </div>
                <footer>
                  <Button
                    type="button"
                    disabled={threadActionBusy}
                    onClick={() => setThreadDialog(null)}
                  >
                    Cancel
                  </Button>
                  {threadDialog.mode === "rename" ? (
                    <Button
                      type="submit"
                      disabled={threadActionBusy || !threadDialog.title.trim()}
                    >
                      {threadActionBusy ? "Saving…" : "Save"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="destructive"
                      disabled={threadActionBusy}
                      onClick={() => void removeThread()}
                    >
                      {threadActionBusy ? "Deleting…" : "Delete"}
                    </Button>
                  )}
                </footer>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </aside>
    </div>
  );
}
