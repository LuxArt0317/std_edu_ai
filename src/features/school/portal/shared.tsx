import { Home, BookOpen, ClipboardCheck, GraduationCap, CalendarDays, Users, ListTodo, UserRound, TriangleAlert, Inbox, Send, Library, ChartNoAxesCombined, Settings2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import type { CrmUser } from "../../crm/authService";
import { type NexusInputAttachment } from "../platformAi";
import { type UnifiedCalendarEvent } from "../schoolCalendar";
import type { PlatformRole, PortalSection } from "../types";

export type PortalView = PortalSection | "crm" | "students" | "success" | "admissions" | "cases" | "campaigns" | "knowledge" | "analytics";

export type NexusActivityState =
  | "idle"
  | "thinking"
  | "executing"
  | "refreshing"
  | "waiting"
  | "complete"
  | "blocked";

export function browserUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function readNexusAttachment(file: File): Promise<NexusInputAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve({
            name: file.name,
            mimeType: file.type,
            size: file.size,
            dataUrl: reader.result,
          })
        : reject(new Error(`Could not read ${file.name}.`));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export const leadershipRoles = new Set<PlatformRole>([
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
  "registrar",
  "department_head",
]);

export const teachingRoles = new Set<PlatformRole>([
  "owner",
  "admin",
  "dean",
  "department_head",
  "faculty",
]);

export const crmRoles = new Set<PlatformRole>([
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
  "registrar",
  "department_head",
  "faculty",
  "advisor",
  "admissions",
  "finance",
  "support",
  "librarian",
]);

export const roleNames: Record<PlatformRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  president: "President",
  vice_president: "Vice President",
  dean: "Dean",
  registrar: "Registrar",
  department_head: "Department Head",
  faculty: "Teacher",
  advisor: "Academic Advisor",
  admissions: "Admissions Officer",
  finance: "Finance Officer",
  support: "Student Support",
  librarian: "Librarian",
  student: "Student",
};

export const navMeta: Record<PortalView, { label: string; icon: LucideIcon }> = {
  home: { label: "Overview", icon: Home },
  academics: { label: "Academics", icon: Settings2 },
  learning: { label: "Courses", icon: BookOpen },
  teaching: { label: "Courses", icon: BookOpen },
  assessments: { label: "Assessments", icon: ClipboardCheck },
  grades: { label: "Grades", icon: GraduationCap },
  schedule: { label: "Calendar", icon: CalendarDays },
  people: { label: "Users", icon: Users },
  crm: { label: "Tasks", icon: ListTodo },
  students: { label: "Students", icon: UserRound },
  success: { label: "Alerts", icon: TriangleAlert },
  admissions: { label: "Admissions", icon: Inbox },
  cases: { label: "Cases", icon: Inbox },
  campaigns: { label: "Messages", icon: Send },
  knowledge: { label: "Knowledge", icon: Library },
  analytics: { label: "Reports", icon: ChartNoAxesCombined },
};

export function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*_-";
  const bytes = crypto.getRandomValues(new Uint8Array(28));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export const supportViews: PortalView[] = ["crm", "students", "success", "admissions", "cases", "campaigns", "knowledge", "analytics"];

export function navigationFor(role: PlatformRole): PortalView[] {
  if (role === "student")
    return ["home", "learning", "assessments", "grades", "schedule"];
  if (role === "faculty")
    return ["home", "teaching", "assessments", "grades", "schedule", ...supportViews];
  if (leadershipRoles.has(role))
    return [
      "home",
      "academics",
      "teaching",
      "assessments",
      "grades",
      "schedule",
      "people",
      ...supportViews,
    ];
  return [
    "home",
    "learning",
    "schedule",
    ...(crmRoles.has(role) ? supportViews : []),
  ];
}

export function formatMoment(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function Pill({
  children,
  tone = "teal",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <Badge variant="secondary" className={`school-pill ${tone}`}>{children}</Badge>;
}

export function PortalLoading() {
  return (
    <div className="school-loading">
      <span>樹</span>
      <strong>Loading</strong>
      <p>Loading your records…</p>
    </div>
  );
}

export function PageIntro({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="school-page-intro">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </section>
  );
}

export type SchedulePosterOptions = {
  title: string;
  theme: "heritage" | "ocean" | "sunrise";
  includeWeekends: boolean;
  includeLocation: boolean;
  includeDeadlines: boolean;
};

export async function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 5000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      window.clearTimeout(timer);
      finish(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    image.src = src;
  });
}

export async function downloadSchedulePng(
  events: UnifiedCalendarEvent[],
  user: CrmUser,
  options: SchedulePosterOptions,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot create a schedule image.");
  const palettes = {
    heritage: {
      ink: "#103f39",
      accent: "#147b6f",
      soft: "#e7f4f1",
      paper: "#fbfdfc",
    },
    ocean: {
      ink: "#153f5b",
      accent: "#2478a7",
      soft: "#e8f4fb",
      paper: "#fbfdff",
    },
    sunrise: {
      ink: "#5f382c",
      accent: "#c96f42",
      soft: "#fff1e8",
      paper: "#fffdfb",
    },
  };
  const color = palettes[options.theme];
  context.fillStyle = color.paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color.ink;
  context.fillRect(0, 0, canvas.width, 210);
  const logo = await loadCanvasImage(
    "https://www.stu.edu.tw/wp-content/uploads/2026/01/stu-logo-2.png",
  );
  if (logo) context.drawImage(logo, 72, 46, 300, 92);
  else {
    context.fillStyle = "#fff";
    context.beginPath();
    context.roundRect(72, 46, 84, 84, 20);
    context.fill();
    context.fillStyle = color.ink;
    context.font = "700 44px serif";
    context.fillText("樹", 92, 104);
    context.fillStyle = "#fff";
    context.font = "700 27px sans-serif";
    context.fillText("SHU-TE UNIVERSITY", 180, 100);
  }
  context.fillStyle = "#fff";
  context.font = "700 46px sans-serif";
  context.fillText(options.title || "My Class Schedule", 700, 82);
  context.font = "25px sans-serif";
  context.fillStyle = "#cce9e3";
  context.fillText(
    `${user.name} · Generated ${new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date())}`,
    700,
    132,
  );
  const days = options.includeWeekends
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIndex = (date: Date) =>
    options.includeWeekends
      ? date.getDay()
      : date.getDay() === 0
        ? -1
        : date.getDay() - 1;
  const classEvents = [
    ...new Map(
      events
        .filter(
          (event) =>
            event.category === "class" &&
            dayIndex(new Date(event.startsAt)) >= 0,
        )
        .map((event) => {
          const start = new Date(event.startsAt),
            end = new Date(event.endsAt);
          return [
            `${dayIndex(start)}:${start.getHours()}:${start.getMinutes()}:${end.getHours()}:${end.getMinutes()}:${event.title}:${event.location}`,
            event,
          ] as const;
        }),
    ).values(),
  ];
  const startHour = Math.min(
    8,
    ...classEvents.map((event) => new Date(event.startsAt).getHours()),
  );
  const endHour = Math.max(
    18,
    ...classEvents.map((event) =>
      Math.ceil(
        new Date(event.endsAt).getHours() +
          new Date(event.endsAt).getMinutes() / 60,
      ),
    ),
  );
  const left = 150,
    top = 285,
    right = 1740,
    bottom = 1030,
    col = (right - left) / days.length,
    row = (bottom - top) / (endHour - startHour);
  context.strokeStyle = "#cbded9";
  context.lineWidth = 2;
  context.font = "700 22px sans-serif";
  context.textAlign = "center";
  days.forEach((day, index) => {
    context.fillStyle = color.soft;
    context.fillRect(left + index * col, 230, col, 55);
    context.fillStyle = color.ink;
    context.fillText(day, left + index * col + col / 2, 266);
  });
  for (let hour = startHour; hour <= endHour; hour++) {
    const y = top + (hour - startHour) * row;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.textAlign = "right";
    context.fillStyle = "#647b76";
    context.font = "20px sans-serif";
    context.fillText(
      new Intl.DateTimeFormat("en", { hour: "numeric" }).format(
        new Date(2020, 1, 1, hour),
      ),
      left - 18,
      y + 7,
    );
  }
  for (let index = 0; index <= days.length; index++) {
    const x = left + index * col;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
  for (const event of classEvents) {
    const start = new Date(event.startsAt),
      end = new Date(event.endsAt),
      index = dayIndex(start);
    const x = left + index * col + 7,
      y =
        top +
        (start.getHours() + start.getMinutes() / 60 - startHour) * row +
        5,
      h = Math.max(
        55,
        ((end.getTime() - start.getTime()) / 3600000) * row - 10,
      );
    context.fillStyle = color.accent;
    context.beginPath();
    context.roundRect(x, y, col - 14, h, 14);
    context.fill();
    context.fillStyle = "#fff";
    context.textAlign = "left";
    context.font = "700 21px sans-serif";
    const title =
      event.title.length > 25 ? `${event.title.slice(0, 24)}…` : event.title;
    context.fillText(title, x + 14, y + 28);
    context.font = "17px sans-serif";
    context.fillText(
      new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
      }).format(start),
      x + 14,
      y + 52,
    );
    if (options.includeLocation && h > 78)
      context.fillText(event.location || "Location TBA", x + 14, y + 75);
  }
  context.textAlign = "left";
  context.fillStyle = color.ink;
  context.font = "700 21px sans-serif";
  context.fillText("STU Nexus · Official personal schedule export", 72, 1145);
  if (options.includeDeadlines) {
    const upcoming = events
      .filter(
        (event) =>
          ["assessment", "deadline"].includes(event.category) &&
          new Date(event.startsAt) >= new Date(),
      )
      .slice(0, 3);
    context.textAlign = "right";
    context.font = "18px sans-serif";
    context.fillStyle = "#657d78";
    context.fillText(
      upcoming.length
        ? `Upcoming: ${upcoming.map((event) => event.title).join(" · ")}`
        : "No upcoming deadlines",
      1728,
      1145,
    );
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 1),
  );
  if (!blob) throw new Error("The schedule image could not be generated.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stu-class-schedule-${new Date().toISOString().slice(0, 10)}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
