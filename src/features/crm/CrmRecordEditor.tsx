import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { CheckboxField } from '@/components/form-controls'
import { useState } from "react";
import type { FormEvent } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
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
  ownerId?: string | null;
  sectionId?: string | null;
  recipientStudentIds?: string[];
  audienceRoles?: string[];
  recipients?: Campaign["recipients"];
  assignedTo?: string;
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
  const initialStudentId=value.kind==="task"||value.kind==="case"?(value.record?.studentId??("studentId" in value?value.studentId:"")??""):"";
  const [selectedStudentId,setSelectedStudentId]=useState(initialStudentId);
  const [selectedCaseId,setSelectedCaseId]=useState(value.kind==="task"?value.record?.caseId??"":"");
  const [audienceScope,setAudienceScope]=useState<NonNullable<Campaign["audienceScope"]>>(value.kind==="campaign"?value.record?.audienceScope??"institution":"institution");
  const studentCases=database.cases.filter((item)=>item.studentId===selectedStudentId);
  const staff=database.staff??[];
  const title =
    value.kind === "student"
      ? "Edit student"
      : `${value.record ? "Edit" : "Create"} ${value.kind}`;

  const [formError, setFormError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(event.currentTarget);
    try {
      if (value.kind === "student")
        await saveCrmStudent(value.record.id, {
          name: String(f.get("name")),
          studentNumber: String(f.get("studentNumber")),
          programId: String(f.get("programId")),
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
          ownerId: String(f.get("ownerId")),
        });
      if (value.kind === "lead")
        await saveAdmissionLead(value.record?.id ?? null, {
          name: String(f.get("name")),
          email: String(f.get("email")),
          phone: String(f.get("phone")),
          programId: String(f.get("programId")),
          ownerId: String(f.get("ownerId")),
          source: String(f.get("source")),
          stage: String(f.get("stage")) as AdmissionLead["stage"],
          probability: Number(f.get("probability")),
          nextStep: String(f.get("nextStep")),
        });
      if (value.kind === "campaign")
        await saveCampaign(value.record?.id ?? null, {
          name: String(f.get("name")),
          audienceScope,
          programId:String(f.get("programId")),
          sectionId:String(f.get("sectionId")),
          studentIds:f.getAll("studentIds").map(String),
          riskLevels:f.getAll("riskLevels").map(String),
          roles:f.getAll("roles").map(String),
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
          assignedTo:String(f.get("assignedTo")),
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
      setFormError(error instanceof Error ? error.message : "The record could not be saved.");
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
    <Dialog open onOpenChange={(open) => { if (!open) (onClose)(); }}><DialogContent showCloseButton={false}
        className="academic-modal crm-record-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      ><DialogDescription className="sr-only">Review the details and submit to save your changes.</DialogDescription>{formError ? <p role="alert" className="text-destructive">{formError}</p> : null}
        <header>
          <div>
            <span>COMPLETE RECORD</span>
            <DialogTitle asChild><h2>{title}</h2></DialogTitle>
            <p>
              Every mutable field is available here; status shortcuts are
              optional conveniences.
            </p>
          </div>
          <Button type="button" onClick={onClose}>
            ×
          </Button>
        </header>
        <form className="academic-form" onSubmit={submit}>
          <div className="academic-form-grid">
            {value.kind === "student" ? (
              <>
                <Label>
                  <span>Full name</span>
                  <Input name="name" required defaultValue={record.name} />
                </Label>
                <Label>
                  <span>Student number</span>
                  <Input
                    name="studentNumber"
                    required
                    defaultValue={record.studentNumber}
                  />
                </Label>
                <Label>
                  <span>Program</span>
                  <NativeSelect name="programId" required defaultValue={record.programId??""}><NativeSelectOption value="">Choose an academic program…</NativeSelectOption>{(database.programs??[]).map((program)=><NativeSelectOption key={program.id} value={program.id}>{program.code} · {program.name}</NativeSelectOption>)}</NativeSelect>
                  <Input type="hidden" name="program" value={(database.programs??[]).find((program)=>program.id===record.programId)?.code??record.program??""}/>
                </Label>
                <Label>
                  <span>Year level</span>
                  <Input
                    name="yearLevel"
                    required
                    defaultValue={record.yearLevel}
                  />
                </Label>
                <Label>
                  <span>Email</span>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={record.email}
                  />
                </Label>
                <Label>
                  <span>Phone</span>
                  <Input name="phone" defaultValue={record.phone} />
                </Label>
                <Label>
                  <span>GPA</span>
                  <Input
                    name="gpa"
                    type="number"
                    min="0"
                    max="4"
                    step="0.01"
                    defaultValue={record.gpa}
                  />
                </Label>
                <Label>
                  <span>Attendance %</span>
                  <Input
                    name="attendance"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record.attendance}
                  />
                </Label>
                <Label>
                  <span>Engagement %</span>
                  <Input
                    name="engagement"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record.engagement}
                  />
                </Label>
                <Label>
                  <span>Outstanding balance</span>
                  <Input
                    name="balance"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={record.balance}
                  />
                </Label>
                <Label>
                  <span>Risk score</span>
                  <Input
                    name="riskScore"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record.riskScore}
                  />
                </Label>
                <Label>
                  <span>Risk level</span>
                  <NativeSelect name="riskLevel" defaultValue={record.riskLevel}>
                    <NativeSelectOption value="critical">Critical</NativeSelectOption>
                    <NativeSelectOption value="high">High</NativeSelectOption>
                    <NativeSelectOption value="medium">Medium</NativeSelectOption>
                    <NativeSelectOption value="low">Low</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label className="wide">
                  <span>Next best action</span>
                  <Textarea
                    name="nextAction"
                    rows={3}
                    defaultValue={record.nextAction}
                  />
                </Label>
                <Label className="wide">
                  <span>Tags, comma separated</span>
                  <Input
                    name="tags"
                    defaultValue={(record.tags ?? []).join(", ")}
                  />
                </Label>
              </>
            ) : null}
            {value.kind === "case" ? (
              <>
                <Label>
                  <span>Student</span>
                  <NativeSelect
                    name="studentId"
                    required
                    value={selectedStudentId}
                    onChange={(event)=>setSelectedStudentId(event.target.value)}
                  >
                    <NativeSelectOption value="">Select student…</NativeSelectOption>
                    {database.students.map((student) => (
                      <NativeSelectOption key={student.id} value={student.id}>
                        {student.studentNumber} · {student.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Label>
                <Label><span>Accountable owner</span><NativeSelect name="ownerId" required defaultValue={record.ownerId??""}><NativeSelectOption value="">Choose support staff…</NativeSelectOption>{staff.filter((item)=>["owner","admin","advisor","support","registrar"].includes(item.role)).map((item)=><NativeSelectOption key={item.id} value={item.id}>{item.name} · {item.role.replaceAll("_"," ")}</NativeSelectOption>)}</NativeSelect></Label>
                <Label>
                  <span>Title</span>
                  <Input name="title" required defaultValue={record?.title} />
                </Label>
                <Label>
                  <span>Category</span>
                  <Input
                    name="category"
                    required
                    defaultValue={record?.category ?? "Student support"}
                  />
                </Label>
                <Label>
                  <span>Priority</span>
                  <NativeSelect
                    name="priority"
                    defaultValue={record?.priority ?? "normal"}
                  >
                    <NativeSelectOption>urgent</NativeSelectOption>
                    <NativeSelectOption>high</NativeSelectOption>
                    <NativeSelectOption>normal</NativeSelectOption>
                    <NativeSelectOption>low</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Status</span>
                  <NativeSelect name="status" defaultValue={record?.status ?? "open"}>
                    <NativeSelectOption value="open">Open</NativeSelectOption>
                    <NativeSelectOption value="in_progress">In progress</NativeSelectOption>
                    <NativeSelectOption value="waiting">Waiting</NativeSelectOption>
                    <NativeSelectOption value="resolved">Resolved</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Due</span>
                  <Input
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={record?.dueAtIso?.slice(0, 16) ?? ""}
                  />
                </Label>
                <Label className="wide">
                  <span>Description and case plan</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </Label>
              </>
            ) : null}
            {value.kind === "lead" ? (
              <>
                <Label>
                  <span>Full name</span>
                  <Input name="name" required defaultValue={record?.name} />
                </Label>
                <Label>
                  <span>Program interest</span>
                  <NativeSelect name="programId" required defaultValue={record?.programId??""}><NativeSelectOption value="">Choose an academic program…</NativeSelectOption>{(database.programs??[]).map((program)=><NativeSelectOption key={program.id} value={program.id}>{program.code} · {program.name}</NativeSelectOption>)}</NativeSelect>
                </Label>
                <Label><span>Admissions owner</span><NativeSelect name="ownerId" required defaultValue={record.ownerId??""}><NativeSelectOption value="">Choose accountable staff…</NativeSelectOption>{staff.filter((item)=>["owner","admin","admissions","registrar"].includes(item.role)).map((item)=><NativeSelectOption key={item.id} value={item.id}>{item.name} · {item.role.replaceAll("_"," ")}</NativeSelectOption>)}</NativeSelect></Label>
                <Label>
                  <span>Email</span>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={record?.email}
                  />
                </Label>
                <Label>
                  <span>Phone</span>
                  <Input name="phone" defaultValue={record?.phone} />
                </Label>
                <Label>
                  <span>Source</span>
                  <Input name="source" required defaultValue={record?.source} />
                </Label>
                <Label>
                  <span>Stage</span>
                  <NativeSelect
                    name="stage"
                    defaultValue={record?.stage ?? "inquiry"}
                  >
                    <NativeSelectOption>inquiry</NativeSelectOption>
                    <NativeSelectOption>engaged</NativeSelectOption>
                    <NativeSelectOption>application</NativeSelectOption>
                    <NativeSelectOption>review</NativeSelectOption>
                    <NativeSelectOption>admitted</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Probability %</span>
                  <Input
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={record?.probability ?? 10}
                  />
                </Label>
                <Label className="wide">
                  <span>Next step</span>
                  <Textarea
                    name="nextStep"
                    rows={3}
                    defaultValue={record?.nextStep}
                  />
                </Label>
              </>
            ) : null}
            {value.kind === "campaign" ? (
              <>
                <Label>
                  <span>Name</span>
                  <Input name="name" required defaultValue={record?.name} />
                </Label>
                <Label>
                  <span>Audience scope</span>
                  <NativeSelect value={audienceScope} onChange={(event)=>setAudienceScope(event.target.value as typeof audienceScope)}><NativeSelectOption value="institution">All active students</NativeSelectOption><NativeSelectOption value="program">Academic program</NativeSelectOption><NativeSelectOption value="class">Class roster</NativeSelectOption><NativeSelectOption value="role">Canonical role</NativeSelectOption><NativeSelectOption value="risk">Risk segment</NativeSelectOption><NativeSelectOption value="explicit">Selected students</NativeSelectOption></NativeSelect>
                </Label>
                {audienceScope==="program"?<Label><span>Academic program</span><NativeSelect name="programId" required defaultValue={record.programId??""}><NativeSelectOption value="">Choose a program…</NativeSelectOption>{(database.programs??[]).map((program)=><NativeSelectOption key={program.id} value={program.id}>{program.code} · {program.name}</NativeSelectOption>)}</NativeSelect></Label>:null}
                {audienceScope==="class"?<Label><span>Class roster</span><NativeSelect name="sectionId" required defaultValue={record.sectionId??""}><NativeSelectOption value="">Choose a class…</NativeSelectOption>{(database.sections??[]).map((section)=><NativeSelectOption key={section.id} value={section.id}>{section.code} · {section.title}</NativeSelectOption>)}</NativeSelect></Label>:null}
                {audienceScope==="role"?<Label><span>Learner role</span><NativeSelect name="roles" required defaultValue={record.audienceRoles?.[0]??"student"}>{(database.roles??[]).filter((role)=>role.code==="student").map((role)=><NativeSelectOption key={role.code} value={role.code}>{role.name}</NativeSelectOption>)}</NativeSelect><small>Campaign delivery currently targets enrolled learner identities.</small></Label>:null}
                {audienceScope==="risk"?<Label><span>Risk levels</span><NativeSelect name="riskLevels" multiple required defaultValue={["critical","high"]}><NativeSelectOption value="critical">Critical</NativeSelectOption><NativeSelectOption value="high">High</NativeSelectOption><NativeSelectOption value="medium">Medium</NativeSelectOption><NativeSelectOption value="low">Low</NativeSelectOption></NativeSelect></Label>:null}
                {audienceScope==="explicit"?<Label className="wide"><span>Included students</span><NativeSelect name="studentIds" multiple required defaultValue={record.recipientStudentIds??[]}>{database.students.map((student)=><NativeSelectOption key={student.id} value={student.id}>{student.studentNumber} · {student.name} · {student.program}</NativeSelectOption>)}</NativeSelect></Label>:null}
                {record.recipients?.length?<div className="wide campaign-recipient-review"><strong>{record.recipients.length} included · {Math.max(0,database.students.length-record.recipients.length)} excluded</strong><p>Recipients are rebuilt from the selected authoritative audience while the campaign is editable.</p>{record.recipients.slice(0,20).map((recipient)=>{const student=database.students.find((item)=>item.id===recipient.studentId);return <span key={recipient.studentId}>{student?.studentNumber} · {student?.name} <b>{recipient.status}</b>{recipient.openedAt?" · opened":recipient.deliveredAt?" · delivered":""}</span>;})}</div>:null}
                <Label>
                  <span>Channel</span>
                  <NativeSelect
                    name="channel"
                    defaultValue={record?.channel ?? "Email"}
                  >
                    <NativeSelectOption>Email</NativeSelectOption>
                    <NativeSelectOption>SMS</NativeSelectOption>
                    <NativeSelectOption>LINE</NativeSelectOption>
                    <NativeSelectOption>Multi-channel</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Status</span>
                  <NativeSelect
                    name="status"
                    defaultValue={record?.status ?? "draft"}
                  >
                    <NativeSelectOption>draft</NativeSelectOption>
                    <NativeSelectOption>scheduled</NativeSelectOption>
                    <NativeSelectOption>active</NativeSelectOption>
                    <NativeSelectOption>completed</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Scheduled for</span>
                  <Input
                    name="scheduledFor"
                    type="datetime-local"
                    defaultValue={record?.scheduledForIso?.slice(0, 16) ?? ""}
                  />
                </Label>
                <Label className="wide">
                  <span>Message</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </Label>
              </>
            ) : null}
            {value.kind === "task" ? (
              <>
                <Label className="wide">
                  <span>Task</span>
                  <Input name="title" required defaultValue={record?.title} />
                </Label>
                <Label>
                  <span>Student</span>
                  <NativeSelect
                    name="studentId"
                    value={selectedStudentId}
                    onChange={(event)=>{setSelectedStudentId(event.target.value);setSelectedCaseId("");}}
                  >
                    <NativeSelectOption value="">No student</NativeSelectOption>
                    {database.students.map((student) => (
                      <NativeSelectOption key={student.id} value={student.id}>
                        {student.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Case</span>
                  <NativeSelect name="caseId" value={selectedCaseId} onChange={(event)=>{const caseId=event.target.value;setSelectedCaseId(caseId);const selected=database.cases.find((item)=>item.id===caseId);if(selected)setSelectedStudentId(selected.studentId);}}>
                    <NativeSelectOption value="">No case</NativeSelectOption>
                    {studentCases.map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Label>
                <Label><span>Assigned staff</span><NativeSelect name="assignedTo" required defaultValue={record.assignedTo??""}><NativeSelectOption value="">Choose accountable staff…</NativeSelectOption>{staff.map((item)=><NativeSelectOption key={item.id} value={item.id}>{item.name} · {item.role.replaceAll("_"," ")}</NativeSelectOption>)}</NativeSelect></Label>
                <Label>
                  <span>Due</span>
                  <Input
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={record?.dueAtIso?.slice(0, 16) ?? ""}
                  />
                </Label>
                <Label>
                  <span>Priority</span>
                  <NativeSelect
                    name="priority"
                    defaultValue={record?.priority ?? "normal"}
                  >
                    <NativeSelectOption>high</NativeSelectOption>
                    <NativeSelectOption>normal</NativeSelectOption>
                    <NativeSelectOption>low</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>
                    <CheckboxField
                      name="completed"
                      type="checkbox"
                      defaultChecked={record?.completed}
                    />{" "}
                    Completed
                  </span>
                </Label>
              </>
            ) : null}
            {value.kind === "signal" ? (
              <>
                <Label>
                  <span>Signal label</span>
                  <Input name="label" required defaultValue={record.label} />
                </Label>
                <Label>
                  <span>Type</span>
                  <NativeSelect
                    name="signalType"
                    defaultValue={record.severity ?? "support"}
                  >
                    <NativeSelectOption value="academic">Academic</NativeSelectOption>
                    <NativeSelectOption value="attendance">Attendance</NativeSelectOption>
                    <NativeSelectOption value="engagement">Engagement</NativeSelectOption>
                    <NativeSelectOption value="financial">Financial</NativeSelectOption>
                    <NativeSelectOption value="support">Support</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Severity</span>
                  <NativeSelect
                    name="severity"
                    defaultValue={record.severity ?? "warning"}
                  >
                    <NativeSelectOption>critical</NativeSelectOption>
                    <NativeSelectOption>high</NativeSelectOption>
                    <NativeSelectOption>medium</NativeSelectOption>
                    <NativeSelectOption>low</NativeSelectOption>
                    <NativeSelectOption>positive</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>
                    <CheckboxField
                      name="active"
                      type="checkbox"
                      defaultChecked={record.active ?? true}
                    />{" "}
                    Active signal
                  </span>
                </Label>
                <Label className="wide">
                  <span>Signal detail</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </Label>
              </>
            ) : null}
            {value.kind === "interaction" ? (
              <>
                <Label>
                  <span>Interaction type</span>
                  <NativeSelect name="interactionType">
                    <NativeSelectOption value="call">Call</NativeSelectOption>
                    <NativeSelectOption value="email">Email</NativeSelectOption>
                    <NativeSelectOption value="meeting">Meeting</NativeSelectOption>
                    <NativeSelectOption value="message">Message</NativeSelectOption>
                    <NativeSelectOption value="case_note">Case note</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Subject</span>
                  <Input name="subject" required />
                </Label>
                <Label className="wide">
                  <span>Summary / notes</span>
                  <RichTextEditor
                    value={richText}
                    onChange={setRichText}
                    onImageUpload={uploadInstitutionalImage}
                  />
                </Label>
              </>
            ) : null}
          </div>
          <footer>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </footer>
        </form>
      </DialogContent></Dialog>
  );
}
