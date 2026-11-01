import { useCurrentTime } from '@/hooks/use-current-time';
import { upcomingEvents } from '@/lib/upcoming-events';
import { buildUnifiedCalendar } from '../schoolCalendar';
import { requestText } from "@/lib/decisions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import type { CrmUser } from "../../crm/authService";
import {
  createInstitutionalInitiative,
  createStudentSupportRequest,
  transitionInstitutionalInitiative,
} from "../platformRepository";
import type { PlatformData, PlatformRole } from "../types";

import type { PortalView } from "./shared";
import {
  formatMoment,
  leadershipRoles,
  teachingRoles,
  PageIntro,
  Pill,
  roleNames,
} from "./shared";
export function HomeView({
  data,
  role,
  user,
  onNavigate,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  role: PlatformRole;
  user: CrmUser;
  onNavigate: (view: PortalView) => void;
  onAsk: () => void;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const [initiativeBusy, setInitiativeBusy] = useState(false);
  const [assignInitiativeId, setAssignInitiativeId] = useState("");
  const now = useCurrentTime();
  const futureEvents = upcomingEvents(buildUnifiedCalendar(data, user), now);
  const upcoming = futureEvents.slice(0, 3);
  const student = data.students.find((item) => item.profileId === user.id);
  const supportRequests = student
    ? data.supportRequests.filter((item) => item.studentId === student.id)
    : [];
  return (
    <>
      <PageIntro title="Overview" description="" />
      <section className="overview-counts" aria-label="School summary">
        <Button type="button" variant="ghost" onClick={() => onNavigate(teachingRoles.has(role) ? "teaching" : "learning")}><strong>{data.courses.length}</strong><span>Courses</span></Button>
        <div><strong>{data.assessments.length}</strong><span>Assessments</span></div>
        <Button type="button" variant="ghost" onClick={() => onNavigate("schedule")}><strong>{futureEvents.length}</strong><span>Upcoming events</span></Button>
        <div><strong>{data.announcements.length}</strong><span>Announcements</span></div>
      </section>
      <section className="school-home-grid">
        <Card className="school-card next-events">
          <header>
            <div>
              <h3>Upcoming</h3>
            </div>
            <Button variant="outline" type="button" onClick={() => onNavigate("schedule")}>
              View calendar
            </Button>
          </header>
          {upcoming.length ? (
            upcoming.map((event) => (
              <div key={event.id}>
                <time>{formatMoment(event.startsAt)}</time>
                <span className={`event-icon ${event.category}`}>◷</span>
                <p>
                  <b>{event.title}</b>
                  <small>{event.location}</small>
                </p>
              </div>
            ))
          ) : (
            <div className="school-empty">
              No upcoming events.
            </div>
          )}
        </Card>
        <Card className="school-card announcement-feed">
          <header>
            <div>
              <h3>Announcements</h3>
            </div>
          </header>
          {data.announcements.slice(0, 3).map((item) => (
            <div key={item.id}>
              <Pill tone={item.priority === "urgent" ? "coral" : "blue"}>
                {item.priority}
              </Pill>
              <p>
                <b>{item.title}</b>
                <span>{item.body}</span>
                <small>{item.publishedAt}</small>
              </p>
            </div>
          ))}
        </Card>
      </section>
      {role === "student" ? (
        <section className="school-card student-support-center">
          <header>
            <div>
              <h3>My support requests</h3>
            </div>
            <Button variant="outline" type="button" onClick={() => setSupportOpen(true)}>
              + Request support
            </Button>
          </header>
          {supportRequests.length ? (
            supportRequests.map((request) => (
              <Card key={request.id}>
                <div>
                  <b>{request.title}</b>
                  <span>{request.category}</span>
                </div>
                <Pill tone={request.status === "resolved" ? "green" : "amber"}>
                  {request.status.replaceAll("_", " ")}
                </Pill>
                <p>{request.description}</p>
                <small>Updated {formatMoment(request.updatedAt)}</small>
              </Card>
            ))
          ) : (
            <div className="school-empty">You have no support requests.</div>
          )}
        </section>
      ) : null}
      {leadershipRoles.has(role) ? (
        <section className="school-card institutional-initiatives">
          <header>
            <div>
              <h3>School projects</h3>
            </div>
            {[
              "owner",
              "admin",
              "president",
              "vice_president",
              "dean",
              "department_head",
            ].includes(role) ? (
              <Button variant="outline" type="button" onClick={() => setInitiativeOpen(true)}>
                Add project
              </Button>
            ) : null}
          </header>
          {data.initiatives.length ? (
            data.initiatives.map((item) => (
              <Card key={item.id}>
                <div>
                  <Pill
                    tone={
                      item.priority === "urgent"
                        ? "coral"
                        : item.priority === "high"
                          ? "amber"
                          : "teal"
                    }
                  >
                    {item.status.replaceAll("_", " ")}
                  </Pill>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                  <small>
                    {item.type.replaceAll("_", " ")} · {item.scope} · Owner:{" "}
                    {data.profiles.find(
                      (profile) => profile.id === item.ownerId,
                    )?.name ?? "Unassigned"}
                  </small>
                </div>
                <div className="crm-inline-actions">
                  {(["owner", "admin", "president", "vice_president"].includes(
                    role,
                  ) ||
                    (role === "dean" &&
                      ["teaching_plan", "content_correction"].includes(
                        item.type,
                      ))) &&
                  item.status === "proposed" ? (
                    <Button variant="outline"
                      type="button"
                      onClick={async () => {
                        const reason = await requestText(
                          "Approval reason (at least 12 characters)",
                        );
                        if (reason)
                          void transitionInstitutionalInitiative({
                            initiativeId: item.id,
                            action: "approve",
                            ownerId: null,
                            reason,
                          })
                            .then(() => {
                              onToast(
                                "Project approved.",
                              );
                              onChanged();
                            })
                            .catch((error: unknown) =>
                              onToast(
                                error instanceof Error
                                  ? error.message
                                  : "Approval failed.",
                              ),
                            );
                      }}
                    >
                      Approve policy / initiative
                    </Button>
                  ) : null}
                  {[
                    "owner",
                    "admin",
                    "president",
                    "vice_president",
                    "dean",
                    "department_head",
                  ].includes(role) && item.status !== "completed" ? (
                    <Button variant="outline"
                      type="button"
                      onClick={() => setAssignInitiativeId(item.id)}
                    >
                      Assign owner
                    </Button>
                  ) : null}
                  {item.ownerId === user.id && item.status === "in_progress" ? (
                    <Button variant="outline"
                      type="button"
                      onClick={async () => {
                        const reason = await requestText(
                          "Completion outcome (at least 12 characters)",
                        );
                        if (reason)
                          void transitionInstitutionalInitiative({
                            initiativeId: item.id,
                            action: "complete",
                            ownerId: null,
                            reason,
                          })
                            .then(() => {
                              onToast("Initiative completed.");
                              onChanged();
                            })
                            .catch((error: unknown) =>
                              onToast(
                                error instanceof Error
                                  ? error.message
                                  : "Completion failed.",
                              ),
                            );
                      }}
                    >
                      Complete
                    </Button>
                  ) : null}
                  {role === "vice_president" ? (
                    <Button variant="outline"
                      type="button"
                      onClick={async () => {
                        const reason = await requestText(
                          "Escalation reason (at least 12 characters)",
                        );
                        if (reason)
                          void transitionInstitutionalInitiative({
                            initiativeId: item.id,
                            action: "escalate",
                            ownerId: null,
                            reason,
                          })
                            .then(() => {
                              onToast("Matter escalated to executive review.");
                              onChanged();
                            })
                            .catch((error: unknown) =>
                              onToast(
                                error instanceof Error
                                  ? error.message
                                  : "Escalation failed.",
                              ),
                            );
                      }}
                    >
                      Escalate
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))
          ) : (
            <div className="school-empty">
              No projects yet.
            </div>
          )}
        </section>
      ) : null}
      {initiativeOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setInitiativeOpen(false))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Add project"
          >
            <DialogDescription className="sr-only">
              Update the fields and save.
            </DialogDescription>
            <header>
              <div>
                <span>Governed strategic work</span>
                <DialogTitle asChild>
                  <h2>Add project</h2>
                </DialogTitle>
                <p>
                  Projects require approval before work starts.
                </p>
              </div>
              <Button variant="outline" type="button" onClick={() => setInitiativeOpen(false)}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                setInitiativeBusy(true);
                void createInstitutionalInitiative({
                  type: String(f.get("type")) as
                    | "policy"
                    | "initiative"
                    | "teaching_plan"
                    | "content_correction",
                  title: String(f.get("title")),
                  description: String(f.get("description")),
                  scope: String(f.get("scope")),
                  priority: String(f.get("priority")) as
                    "normal" | "high" | "urgent",
                  dueAt: String(f.get("dueAt")) || null,
                })
                  .then(() => {
                    setInitiativeOpen(false);
                    onToast("Initiative proposed for review.");
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Proposal failed.",
                    ),
                  )
                  .finally(() => setInitiativeBusy(false));
              }}
            >
              <div className="academic-form-grid">
                <Label>
                  <span>Type</span>
                  <NativeSelect name="type">
                    <NativeSelectOption value="initiative">
                      Institutional initiative
                    </NativeSelectOption>
                    <NativeSelectOption value="policy">
                      Policy
                    </NativeSelectOption>
                    <NativeSelectOption value="teaching_plan">
                      Teaching plan
                    </NativeSelectOption>
                    <NativeSelectOption value="content_correction">
                      Content correction
                    </NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Priority</span>
                  <NativeSelect name="priority">
                    <NativeSelectOption value="normal">
                      Normal
                    </NativeSelectOption>
                    <NativeSelectOption value="high">High</NativeSelectOption>
                    <NativeSelectOption value="urgent">
                      Urgent
                    </NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Title</span>
                  <Input name="title" minLength={3} maxLength={180} required />
                </Label>
                <Label>
                  <span>Scope</span>
                  <Input
                    name="scope"
                    defaultValue="Institution-wide"
                    maxLength={180}
                    required
                  />
                </Label>
                <Label className="wide">
                  <span>Description and expected outcome</span>
                  <Textarea
                    name="description"
                    minLength={12}
                    maxLength={10000}
                    rows={6}
                    required
                  />
                </Label>
                <Label>
                  <span>Due date</span>
                  <Input name="dueAt" type="datetime-local" />
                </Label>
              </div>
              <footer>
                <span>
                  Submission creates a governed proposal, not automatic
                  approval.
                </span>
                <Button disabled={initiativeBusy}>
                  {initiativeBusy ? "Saving…" : "Submit proposal"}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {assignInitiativeId ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setAssignInitiativeId(""))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Assign initiative owner"
          >
            <DialogDescription className="sr-only">
              Update the fields and save.
            </DialogDescription>
            <header>
              <div>
                <span>Accountable ownership</span>
                <DialogTitle asChild>
                  <h2>Assign initiative owner</h2>
                </DialogTitle>
                <p>
                  Choose an active staff profile. The relationship and reason
                  are written to the governed audit trail.
                </p>
              </div>
              <Button variant="outline" type="button" onClick={() => setAssignInitiativeId("")}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setInitiativeBusy(true);
                void transitionInstitutionalInitiative({
                  initiativeId: assignInitiativeId,
                  action: "assign",
                  ownerId: String(form.get("ownerId")),
                  reason: String(form.get("reason")),
                })
                  .then(() => {
                    setAssignInitiativeId("");
                    onToast("Strategic work assigned.");
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Assignment failed.",
                    ),
                  )
                  .finally(() => setInitiativeBusy(false));
              }}
            >
              <div className="academic-form-grid">
                <Label>
                  <span>Assigned to</span>
                  <NativeSelect
                    name="ownerId"
                    required
                    defaultValue={
                      data.initiatives.find(
                        (item) => item.id === assignInitiativeId,
                      )?.ownerId ?? ""
                    }
                  >
                    <NativeSelectOption value="">
                      Choose active staff…
                    </NativeSelectOption>
                    {data.profiles
                      .filter(
                        (profile) =>
                          profile.accountStatus === "active" &&
                          profile.role !== "student",
                      )
                      .map((profile) => (
                        <NativeSelectOption key={profile.id} value={profile.id}>
                          {profile.name} · {roleNames[profile.role]}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Label>
                <Label className="wide">
                  <span>Assignment reason</span>
                  <Textarea
                    name="reason"
                    required
                    minLength={12}
                    maxLength={1000}
                    rows={4}
                  />
                </Label>
              </div>
              <footer>
                <span>
                  The selected person becomes accountable for this initiative.
                </span>
                <Button disabled={initiativeBusy}>
                  {initiativeBusy ? "Assigning…" : "Assign owner"}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {supportOpen && student ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setSupportOpen(false))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Request support"
          >
            <DialogDescription className="sr-only">
              Update the fields and save.
            </DialogDescription>
            <header>
              <div>
                <span>Student self-service</span>
                <DialogTitle asChild>
                  <h2>Request support</h2>
                </DialogTitle>
                <p>
                  Your request is linked only to your own student record and
                  routed to authorized staff.
                </p>
              </div>
              <Button variant="outline" type="button" onClick={() => setSupportOpen(false)}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setSupportBusy(true);
                void createStudentSupportRequest({
                  studentId: student.id,
                  title: String(form.get("title")),
                  category: String(form.get("category")),
                  description: String(form.get("description")),
                  priority: String(form.get("priority")) as
                    "low" | "medium" | "high",
                })
                  .then(() => {
                    onToast("Support request submitted.");
                    setSupportOpen(false);
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Support request failed.",
                    ),
                  )
                  .finally(() => setSupportBusy(false));
              }}
            >
              <div className="academic-form-grid">
                <Label>
                  <span>Subject</span>
                  <Input name="title" maxLength={160} required />
                </Label>
                <Label>
                  <span>Category</span>
                  <NativeSelect name="category" defaultValue="academic">
                    <NativeSelectOption value="academic">
                      Academic
                    </NativeSelectOption>
                    <NativeSelectOption value="technical">
                      Technical
                    </NativeSelectOption>
                    <NativeSelectOption value="financial">
                      Financial
                    </NativeSelectOption>
                    <NativeSelectOption value="wellbeing">
                      Wellbeing
                    </NativeSelectOption>
                    <NativeSelectOption value="records">
                      Records
                    </NativeSelectOption>
                    <NativeSelectOption value="other">Other</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Priority</span>
                  <NativeSelect name="priority" defaultValue="medium">
                    <NativeSelectOption value="low">Low</NativeSelectOption>
                    <NativeSelectOption value="medium">
                      Medium
                    </NativeSelectOption>
                    <NativeSelectOption value="high">High</NativeSelectOption>
                  </NativeSelect>
                </Label>
                <Label className="wide">
                  <span>What do you need help with?</span>
                  <Textarea
                    name="description"
                    rows={6}
                    maxLength={5000}
                    required
                  />
                </Label>
              </div>
              <footer>
                <span>You can track the request status here.</span>
                <Button disabled={supportBusy}>
                  {supportBusy ? "Submitting…" : "Submit request"}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
