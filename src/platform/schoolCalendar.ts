import type { CrmUser } from "../crm/authService";
import type { PlatformData, PortalSection } from "./types";

export type UnifiedCalendarEvent = {
  id: string;
  source: "schedule" | "assessment" | "attendance" | "initiative" | "term" | "learning" | "grade";
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  category: "class" | "assessment" | "deadline" | "meeting" | "campus" | "personal" | "academic";
  scope: "For you" | "Your class" | "Your role" | "School-wide";
  importance: "normal" | "important" | "urgent";
  destination: PortalSection;
  sectionId: string | null;
};

const leadership = new Set(["owner", "admin", "president", "vice_president", "dean", "registrar", "department_head"]);
const plusMinutes = (value: string, minutes: number) => new Date(new Date(value).getTime() + minutes * 60_000).toISOString();

export function buildUnifiedCalendar(data: PlatformData, user: CrmUser): UnifiedCalendarEvent[] {
  const visibleSections = new Set(data.courses.map((course) => course.sectionId));
  const events: UnifiedCalendarEvent[] = data.schedule.map((item) => ({
    id: `schedule:${item.id}`,
    source: "schedule",
    title: item.title,
    description: item.description,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    location: item.location,
    category: item.type === "exam" ? "assessment" : item.type as UnifiedCalendarEvent["category"],
    scope: item.ownerProfileId === user.id ? "For you" : item.sectionId ? "Your class" : item.audienceRoles.length ? "Your role" : "School-wide",
    importance: item.type === "exam" || item.type === "deadline" ? "important" : "normal",
    destination: item.type === "exam" || item.type === "deadline" ? "assessments" : "schedule",
    sectionId: item.sectionId,
  }));

  for (const assessment of data.assessments) {
    if (!assessment.dueAt || !visibleSections.has(assessment.sectionId)) continue;
    events.push({
      id: `assessment:${assessment.id}`, source: "assessment", title: `${assessment.title} due`,
      description: `${assessment.type} · ${assessment.maxScore} points`, startsAt: assessment.dueAt,
      endsAt: plusMinutes(assessment.dueAt, 30), location: "Online submission", category: "assessment",
      scope: "Your class", importance: assessment.type === "exam" ? "urgent" : "important",
      destination: "assessments", sectionId: assessment.sectionId,
    });
  }

  for (const session of data.attendanceSessions) {
    if (!visibleSections.has(session.sectionId) || session.status === "cancelled") continue;
    events.push({
      id: `attendance:${session.id}`, source: "attendance", title: session.title,
      description: "Attendance session", startsAt: session.startsAt, endsAt: session.endsAt,
      location: data.courses.find((course) => course.sectionId === session.sectionId)?.room ?? "Class location",
      category: "class", scope: "Your class", importance: "normal", destination: "schedule", sectionId: session.sectionId,
    });
  }

  for (const module of data.modules) {
    if (!module.unlocksAt || !visibleSections.has(module.sectionId) || module.status === "archived") continue;
    events.push({
      id: `learning:${module.id}`, source: "learning", title: `${module.title} available`,
      description: module.description || "Learning module opens", startsAt: module.unlocksAt,
      endsAt: plusMinutes(module.unlocksAt, 30), location: "Learning workspace", category: "academic",
      scope: "Your class", importance: "normal", destination: "learning", sectionId: module.sectionId,
    });
  }

  for (const item of data.gradeItems) {
    if (!item.dueAt || item.assessmentId || !visibleSections.has(item.sectionId)) continue;
    events.push({
      id: `grade:${item.id}`, source: "grade", title: `${item.title} due`,
      description: `${item.category} · ${item.maxScore} points`, startsAt: item.dueAt,
      endsAt: plusMinutes(item.dueAt, 30), location: "Grades workspace", category: "deadline",
      scope: "Your class", importance: "important", destination: "grades", sectionId: item.sectionId,
    });
  }

  for (const initiative of data.initiatives) {
    if (!initiative.dueAt || initiative.status === "completed" || initiative.status === "rejected") continue;
    if (!leadership.has(user.role) && initiative.ownerId !== user.id && initiative.createdBy !== user.id) continue;
    events.push({
      id: `initiative:${initiative.id}`, source: "initiative", title: initiative.title,
      description: `${initiative.type.replaceAll("_", " ")} · ${initiative.status.replaceAll("_", " ")}`,
      startsAt: initiative.dueAt, endsAt: plusMinutes(initiative.dueAt, 30), location: initiative.scope,
      category: "deadline", scope: initiative.ownerId === user.id ? "For you" : "Your role",
      importance: initiative.priority === "urgent" ? "urgent" : initiative.priority === "high" ? "important" : "normal",
      destination: "home", sectionId: null,
    });
  }

  for (const term of data.terms.filter((item) => item.status !== "archived")) {
    const boundaries = [
      { label: "enrollment opens", date: term.enrollmentStartsOn },
      { label: "enrollment closes", date: term.enrollmentEndsOn },
      { label: "begins", date: term.startsOn },
      { label: "ends", date: term.endsOn },
    ].filter((boundary): boundary is { label: string; date: string } => Boolean(boundary.date));
    for (const boundary of boundaries) {
      const startsAt = new Date(`${boundary.date}T08:00:00`).toISOString();
      events.push({
        id: `term:${term.id}:${boundary.label}`, source: "term", title: `${term.name} ${boundary.label}`,
        description: `Academic term ${boundary.label}`, startsAt, endsAt: plusMinutes(startsAt, 60), location: "University-wide",
        category: "academic", scope: "School-wide", importance: "important", destination: "academics", sectionId: null,
      });
    }
  }

  return events.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}
