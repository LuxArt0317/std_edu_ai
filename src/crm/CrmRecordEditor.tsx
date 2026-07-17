import { useState } from "react";
import type { FormEvent } from "react";
import { RichTextEditor } from "../platform/RichTextEditor";
import {
  saveAdmissionLead,
  saveCampaign,
  saveCrmCase,
  saveCrmStudent,
  saveCrmTask,
  saveStudentSignal,
  logStudentInteraction,
  uploadInstitutionalImage,
} from "./crmRepository";
import type {
  AdmissionLead,
  Campaign,
  CrmDatabase,
  CrmTask,
  Student,
  StudentSignal,
  SupportCase,
} from "./types";

export type EditableCrmRecord =
  | { kind: "student"; record: Student }
  | { kind: "case"; record: SupportCase | null; studentId?: string }
  | { kind: "lead"; record: AdmissionLead | null }
  | { kind: "campaign"; record: Campaign | null }
  | { kind: "task"; record: CrmTask | null }
  | { kind: "signal"; record: StudentSignal | null; studentId: string }
  | { kind: "interaction"; record: null; studentId: string };

type EditorRecord = Partial<Student> & {
  title?: string;
  studentId?: string;
  category?: string;
  priority?: string;
  status?: string;
  dueAtIso?: string;
  source?: string;
  stage?: string;
  probability?: number;
  nextStep?: string;
  audience?: string;
  channel?: string;
  scheduledForIso?: string;
  caseId?: string;
  completed?: boolean;
  label?: string;
  detail?: string;
  severity?: string;
  active?: boolean;
};

export function CrmRecordEditor({
  value,
  database,
  onClose,
  onSaved,
  onError,
}: {
  value: EditableCrmRecord;
  database: CrmDatabase;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const initialRich =
    value.kind === "case"
      ? (value.record?.description ?? "")
      : value.kind === "campaign"
        ? (value.record?.message ?? "")
        : value.kind === "signal"
          ? (value.record?.detail ?? "")
          : "";
  const [richText, setRichText] = useState(initialRich);
  const title =
    value.kind === "student"
      ? "Edit student"
      : `${value.record ? "Edit" : "Create"} ${value.kind}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      if (value.kind === "student")
        await saveCrmStudent(value.record.id, {
          name: String(f.get("name")),
          studentNumber: String(f.get("studentNumber")),
          program: String(f.get("program")),
          yearLevel: String(f.get("yearLevel")),
          email: String(f.get("email")),
          phone: String(f.get("phone")),
          gpa: Number(f.get("gpa")),
          attendance: Number(f.get("attendance")),
          engagement: Number(f.get("engagement")),
          balance: Number(f.get("balance")),
          riskScore: Number(f.get("riskScore")),
          riskLevel: String(f.get("riskLevel")) as Student["riskLevel"],
          nextAction: String(f.get("nextAction")),
          tags: String(f.get("tags"))
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        });
      if (value.kind === "case")
        await saveCrmCase(value.record?.id ?? null, {
          studentId: String(f.get("studentId")),
          title: String(f.get("title")),
          description: richText,
          category: String(f.get("category")),
          priority: String(f.get("priority")) as SupportCase["priority"],
          status: String(f.get("status")) as SupportCase["status"],
          dueAt: String(f.get("dueAt")),
        });
      if (value.kind === "lead")
        await saveAdmissionLead(value.record?.id ?? null, {
          name: String(f.get("name")),
          email: String(f.get("email")),
          phone: String(f.get("phone")),
          program: String(f.get("program")),
          source: String(f.get("source")),
          stage: String(f.get("stage")) as AdmissionLead["stage"],
          probability: Number(f.get("probability")),
          nextStep: String(f.get("nextStep")),
        });
      if (value.kind === "campaign")
        await saveCampaign(value.record?.id ?? null, {
          name: String(f.get("name")),
          audience: String(f.get("audience")),
          channel: String(f.get("channel")) as Campaign["channel"],
          status: String(f.get("status")) as Campaign["status"],
          scheduledFor: String(f.get("scheduledFor")),
          message: richText,
        });
      if (value.kind === "task")
        await saveCrmTask(value.record?.id ?? null, {
          title: String(f.get("title")),
          studentId: String(f.get("studentId")),
          caseId: String(f.get("caseId")),
          dueAt: String(f.get("dueAt")),
          priority: String(f.get("priority")) as CrmTask["priority"],
          completed: f.get("completed") === "on",
        });
      if (value.kind === "signal")
        await saveStudentSignal(value.record?.id ?? null, {
          studentId: value.studentId,
          label: String(f.get("label")),
          detail: richText,
          severity: String(f.get("severity")),
          signalType: String(f.get("signalType")),
          active: f.get("active") === "on",
        });
      if (value.kind === "interaction")
        await logStudentInteraction({
          studentId: value.studentId,
          subject: String(f.get("subject")),
          summary: richText,
          interactionType: String(f.get("interactionType")),
        });
      onSaved(`${value.kind[0].toUpperCase()}${value.kind.slice(1)} saved.`);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const record = (value.record ?? {}) as EditorRecord;
  return (
    <div className="academic-modal-layer">
      <button
        type="button"
        className="academic-modal-backdrop"
        aria-label="Close editor"
        onClick={onClose}
      />
      <section
        className="academic-modal crm-record-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span>COMPLETE RECORD</span>
            <h2>{title}</h2>
            <p>
              Every mutable field is available here; status shortcuts are
              optional conveniences.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <form className="academic-form" onSubmit={submit}>
          <div className="academic-form-grid">
            {value.kind === "student" ? (
              <>
                <label>
                  <span>Full name</span>
                  <input name="name" required defaultValue={record.name} />
                </label>
                <label>
                  <span>Student number</span>
                  <input
                    name="studentNumber"
                    required
                    defaultValue={record.studentNumber}
                  />
                </label>
                <label>
                  <span>Program</span>
                  <input
                    name="program"
                    required
                    defaultValue={record.program}
                  />
                </label>
                <label>
                  <span>Year level</span>
                  <input
                    name="yearLevel"
                    required
                    defaultValue={record.yearLevel}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={record.email}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input name="phone" defaultValue={record.phone} />
                </label>
                <label>
                  <span>GPA</span>
                  <input
                    name="gpa"
                    type="number"
                    min="0"
                    max="4"
                    step="0.01"
                    defaultValue={record.gpa}
                  />
                </label>
                <label>
                  <span>Attendance %</span>
                  <input
                    name="attendance"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record.attendance}
                  />
                </label>
                <label>
                  <span>Engagement %</span>
                  <input
                    name="engagement"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record.engagement}
                  />
                </label>
                <label>
                  <span>Outstanding balance</span>
                  <input
                    name="balance"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={record.balance}
                  />
                </label>
                <label>
                  <span>Risk score</span>
                  <input
                    name="riskScore"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record.riskScore}
                  />
                </label>
                <label>
                  <span>Risk level</span>
                  <select name="riskLevel" defaultValue={record.riskLevel}>
                    <option>critical</option>
                    <option>warning</option>
                    <option>info</option>
                  </select>
                </label>
                <label className="wide">
                  <span>Next best action</span>
                  <textarea
                    name="nextAction"
                    rows={3}
                    defaultValue={record.nextAction}
                  />
                </label>
                <label className="wide">
                  <span>Tags, comma separated</span>
                  <input
                    name="tags"
                    defaultValue={(record.tags ?? []).join(", ")}
                  />
                </label>
              </>
            ) : null}
            {value.kind === "case" ? (
              <>
                <label>
                  <span>Student</span>
                  <select
                    name="studentId"
                    required
                    defaultValue={record?.studentId ?? value.studentId ?? ""}
                  >
                    <option value="">Select student…</option>
                    {database.students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.studentNumber} · {student.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Title</span>
                  <input name="title" required defaultValue={record?.title} />
                </label>
                <label>
                  <span>Category</span>
                  <input
                    name="category"
                    required
                    defaultValue={record?.category ?? "Student support"}
                  />
                </label>
                <label>
                  <span>Priority</span>
                  <select
                    name="priority"
                    defaultValue={record?.priority ?? "normal"}
                  >
                    <option>urgent</option>
                    <option>high</option>
                    <option>normal</option>
                    <option>low</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select name="status" defaultValue={record?.status ?? "open"}>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label>
                  <span>Due</span>
                  <input
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={record?.dueAtIso?.slice(0, 16) ?? ""}
                  />
                </label>
                <label className="wide">
                  <span>Description and case plan</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </label>
              </>
            ) : null}
            {value.kind === "lead" ? (
              <>
                <label>
                  <span>Full name</span>
                  <input name="name" required defaultValue={record?.name} />
                </label>
                <label>
                  <span>Program interest</span>
                  <input
                    name="program"
                    required
                    defaultValue={record?.program}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={record?.email}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input name="phone" defaultValue={record?.phone} />
                </label>
                <label>
                  <span>Source</span>
                  <input name="source" required defaultValue={record?.source} />
                </label>
                <label>
                  <span>Stage</span>
                  <select
                    name="stage"
                    defaultValue={record?.stage ?? "inquiry"}
                  >
                    <option>inquiry</option>
                    <option>engaged</option>
                    <option>application</option>
                    <option>review</option>
                    <option>admitted</option>
                  </select>
                </label>
                <label>
                  <span>Probability %</span>
                  <input
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record?.probability ?? 10}
                  />
                </label>
                <label className="wide">
                  <span>Next step</span>
                  <textarea
                    name="nextStep"
                    rows={3}
                    defaultValue={record?.nextStep}
                  />
                </label>
              </>
            ) : null}
            {value.kind === "campaign" ? (
              <>
                <label>
                  <span>Name</span>
                  <input name="name" required defaultValue={record?.name} />
                </label>
                <label>
                  <span>Audience segment</span>
                  <input
                    name="audience"
                    required
                    defaultValue={record?.audience}
                  />
                </label>
                <label>
                  <span>Channel</span>
                  <select
                    name="channel"
                    defaultValue={record?.channel ?? "Email"}
                  >
                    <option>Email</option>
                    <option>SMS</option>
                    <option>LINE</option>
                    <option>Multi-channel</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    name="status"
                    defaultValue={record?.status ?? "draft"}
                  >
                    <option>draft</option>
                    <option>scheduled</option>
                    <option>active</option>
                    <option>completed</option>
                  </select>
                </label>
                <label>
                  <span>Scheduled for</span>
                  <input
                    name="scheduledFor"
                    type="datetime-local"
                    defaultValue={record?.scheduledForIso?.slice(0, 16) ?? ""}
                  />
                </label>
                <label className="wide">
                  <span>Message</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </label>
              </>
            ) : null}
            {value.kind === "task" ? (
              <>
                <label className="wide">
                  <span>Task</span>
                  <input name="title" required defaultValue={record?.title} />
                </label>
                <label>
                  <span>Student</span>
                  <select
                    name="studentId"
                    defaultValue={record?.studentId ?? ""}
                  >
                    <option value="">No student</option>
                    {database.students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Case</span>
                  <select name="caseId" defaultValue={record?.caseId ?? ""}>
                    <option value="">No case</option>
                    {database.cases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Due</span>
                  <input
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={record?.dueAtIso?.slice(0, 16) ?? ""}
                  />
                </label>
                <label>
                  <span>Priority</span>
                  <select
                    name="priority"
                    defaultValue={record?.priority ?? "normal"}
                  >
                    <option>high</option>
                    <option>normal</option>
                    <option>low</option>
                  </select>
                </label>
                <label>
                  <span>
                    <input
                      name="completed"
                      type="checkbox"
                      defaultChecked={record?.completed}
                    />{" "}
                    Completed
                  </span>
                </label>
              </>
            ) : null}
            {value.kind === "signal" ? (
              <>
                <label>
                  <span>Signal label</span>
                  <input name="label" required defaultValue={record.label} />
                </label>
                <label>
                  <span>Type</span>
                  <select
                    name="signalType"
                    defaultValue={record.severity ?? "support"}
                  >
                    <option value="academic">Academic</option>
                    <option value="attendance">Attendance</option>
                    <option value="engagement">Engagement</option>
                    <option value="financial">Financial</option>
                    <option value="support">Support</option>
                  </select>
                </label>
                <label>
                  <span>Severity</span>
                  <select
                    name="severity"
                    defaultValue={record.severity ?? "warning"}
                  >
                    <option>critical</option>
                    <option>high</option>
                    <option>medium</option>
                    <option>low</option>
                    <option>positive</option>
                  </select>
                </label>
                <label>
                  <span>
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={record.active ?? true}
                    />{" "}
                    Active signal
                  </span>
                </label>
                <label className="wide">
                  <span>Signal detail</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </label>
              </>
            ) : null}
            {value.kind === "interaction" ? (
              <>
                <label>
                  <span>Interaction type</span>
                  <select name="interactionType">
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="message">Message</option>
                    <option value="case_note">Case note</option>
                  </select>
                </label>
                <label>
                  <span>Subject</span>
                  <input name="subject" required />
                </label>
                <label className="wide">
                  <span>Summary / notes</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </label>
              </>
            ) : null}
          </div>
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
