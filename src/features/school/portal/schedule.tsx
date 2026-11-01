import { CheckboxField } from "@/components/form-controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useMemo, useState } from "react";
import type { CrmUser } from "../../crm/authService";
import { ScheduleOperations } from "../AcademicOperations";
import {
  buildUnifiedCalendar,
  type UnifiedCalendarEvent,
} from "../schoolCalendar";
import type { PlatformData } from "../types";

import type { SchedulePosterOptions } from "./shared";
import { downloadSchedulePng, PageIntro } from "./shared";
export function SchedulePngGenerator({
  events,
  user,
  onToast,
}: {
  events: UnifiedCalendarEvent[];
  user: CrmUser;
  onToast: (message: string) => void;
}) {
  const [options, setOptions] = useState<SchedulePosterOptions>({
    title: "My Class Schedule",
    theme: "heritage",
    includeWeekends: false,
    includeLocation: true,
    includeDeadlines: true,
  });
  const [busy, setBusy] = useState(false);
  return (
    <section className="schedule-poster school-card">
      <div>
        <h2>Make your class schedule</h2>
        <p>
          Generate a high-resolution PNG with the school identity, your class
          times, rooms, and optional upcoming deadlines.
        </p>
      </div>
      <div className="schedule-poster-options">
        <Label>
          Poster title
          <Input
            value={options.title}
            maxLength={70}
            onChange={(event) =>
              setOptions({ ...options, title: event.target.value })
            }
          />
        </Label>
        <Label>
          Color style
          <NativeSelect
            value={options.theme}
            onChange={(event) =>
              setOptions({
                ...options,
                theme: event.target.value as SchedulePosterOptions["theme"],
              })
            }
          >
            <NativeSelectOption value="heritage">
              STU heritage green
            </NativeSelectOption>
            <NativeSelectOption value="ocean">Ocean blue</NativeSelectOption>
            <NativeSelectOption value="sunrise">Sunrise</NativeSelectOption>
          </NativeSelect>
        </Label>
        <Label className="check">
          <CheckboxField
            type="checkbox"
            checked={options.includeLocation}
            onChange={(event) =>
              setOptions({ ...options, includeLocation: event.target.checked })
            }
          />{" "}
          Include rooms
        </Label>
        <Label className="check">
          <CheckboxField
            type="checkbox"
            checked={options.includeDeadlines}
            onChange={(event) =>
              setOptions({ ...options, includeDeadlines: event.target.checked })
            }
          />{" "}
          Include upcoming deadlines
        </Label>
        <Label className="check">
          <CheckboxField
            type="checkbox"
            checked={options.includeWeekends}
            onChange={(event) =>
              setOptions({ ...options, includeWeekends: event.target.checked })
            }
          />{" "}
          Include Sunday
        </Label>
      </div>
      <Button variant="outline"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void downloadSchedulePng(events, user, options)
            .then(() => onToast("Your branded schedule PNG is ready."))
            .catch((error: unknown) =>
              onToast(
                error instanceof Error
                  ? error.message
                  : "Schedule export failed.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Designing PNG…" : "Download schedule PNG"}
      </Button>
    </section>
  );
}

export function ScheduleView({
  data,
  currentUser,
  initialSectionId,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  initialSectionId: string;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [calendarMode, setCalendarMode] = useState<"month" | "week" | "agenda">(
    "month",
  );
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [category, setCategory] = useState("all");
  const [selectedEvent, setSelectedEvent] =
    useState<UnifiedCalendarEvent | null>(null);
  const allEvents = useMemo(
    () => buildUnifiedCalendar(data, currentUser),
    [currentUser, data],
  );
  const filteredEvents = useMemo(
    () =>
      allEvents.filter(
        (event) => category === "all" || event.category === category,
      ),
    [allEvents, category],
  );
  const monthStart = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    1,
  );
  const monthGridStart = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    1 - monthStart.getDay(),
  );
  const monthDays = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        monthGridStart.getFullYear(),
        monthGridStart.getMonth(),
        monthGridStart.getDate() + index,
      ),
  );
  const weekStart = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate() - anchorDate.getDay(),
  );
  const weekDays = Array.from(
    { length: 7 },
    (_, index) =>
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + index,
      ),
  );
  const sameDay = (value: string, day: Date) => {
    const date = new Date(value);
    return (
      date.getFullYear() === day.getFullYear() &&
      date.getMonth() === day.getMonth() &&
      date.getDate() === day.getDate()
    );
  };
  const visibleAgenda = filteredEvents
    .filter(
      (event) =>
        new Date(event.endsAt) >=
        new Date(
          anchorDate.getFullYear(),
          anchorDate.getMonth(),
          anchorDate.getDate(),
        ),
    )
    .slice(0, 40);
  function move(direction: number) {
    setAnchorDate((current) =>
      calendarMode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() + direction * (calendarMode === "week" ? 7 : 30),
          ),
    );
  }
  const focusedCourse = data.courses.find(
    (course) => course.sectionId === initialSectionId,
  );
  const todayEvents = allEvents.filter((event) =>
    sameDay(event.startsAt, new Date()),
  );
  const upcomingImportant = allEvents
    .filter(
      (event) =>
        event.importance !== "normal" && new Date(event.endsAt) >= new Date(),
    )
    .slice(0, 5);
  const renderEvent = (event: UnifiedCalendarEvent, compact = false) => (
    <Button variant="outline"
      type="button"
      key={event.id}
      className={`unified-calendar-event ${event.category} ${event.importance}`}
      onClick={() => setSelectedEvent(event)}
      title={event.title}
    >
      <time>
        {new Intl.DateTimeFormat("en", {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(event.startsAt))}
      </time>
      <span>{event.title}</span>
      {compact ? null : <small>{event.scope}</small>}
    </Button>
  );
  return (
    <>
      <PageIntro
        title="Schedule"
        description="Classes, deadlines and events."
      />
      {focusedCourse ? (
        <div className="workspace-focus-banner">
          <b>Showing {focusedCourse.code} first</b>
          <span>
            {focusedCourse.title} · {focusedCourse.sectionCode}
          </span>
        </div>
      ) : null}
      {currentUser.role === "student" ? (
        <SchedulePngGenerator
          events={allEvents}
          user={currentUser}
          onToast={onToast}
        />
      ) : null}
      <section className="unified-calendar school-card">
        <header className="unified-calendar-head">
          <div>
            <span>YOUR TIME, IN ONE PLACE</span>
            <h2>
              {new Intl.DateTimeFormat("en", {
                month: "long",
                year: "numeric",
              }).format(anchorDate)}
            </h2>
            <p>
              {todayEvents.length
                ? `${todayEvents.length} item${todayEvents.length === 1 ? "" : "s"} today`
                : "Nothing scheduled today"}{" "}
              · {upcomingImportant.length} important coming up
            </p>
          </div>
          <div className="unified-calendar-actions">
            <Button variant="outline"
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous period"
            >
              ‹
            </Button>
            <Button variant="outline" type="button" onClick={() => setAnchorDate(new Date())}>
              Today
            </Button>
            <Button variant="outline"
              type="button"
              onClick={() => move(1)}
              aria-label="Next period"
            >
              ›
            </Button>
          </div>
        </header>
        <div className="unified-calendar-toolbar">
          <div>
            {(["month", "week", "agenda"] as const).map((mode) => (
              <Button variant="outline"
                type="button"
                key={mode}
                className={calendarMode === mode ? "active" : ""}
                onClick={() => setCalendarMode(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
          <NativeSelect
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter calendar"
          >
            <NativeSelectOption value="all">
              Everything important
            </NativeSelectOption>
            <NativeSelectOption value="class">Classes</NativeSelectOption>
            <NativeSelectOption value="assessment">
              Assessments
            </NativeSelectOption>
            <NativeSelectOption value="deadline">Deadlines</NativeSelectOption>
            <NativeSelectOption value="meeting">Meetings</NativeSelectOption>
            <NativeSelectOption value="campus">
              Campus events
            </NativeSelectOption>
            <NativeSelectOption value="personal">Personal</NativeSelectOption>
            <NativeSelectOption value="academic">
              Academic dates
            </NativeSelectOption>
          </NativeSelect>
        </div>
        {calendarMode === "month" ? (
          <div className="unified-month">
            <div className="unified-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <b key={day}>{day}</b>
              ))}
            </div>
            <div className="unified-month-grid">
              {monthDays.map((day) => (
                <section
                  key={day.toISOString()}
                  className={`${day.getMonth() !== anchorDate.getMonth() ? "outside" : ""} ${sameDay(new Date().toISOString(), day) ? "today" : ""}`}
                >
                  <time>{day.getDate()}</time>
                  <div>
                    {filteredEvents
                      .filter((event) => sameDay(event.startsAt, day))
                      .slice(0, 3)
                      .map((event) => renderEvent(event, true))}
                    {filteredEvents.filter((event) =>
                      sameDay(event.startsAt, day),
                    ).length > 3 ? (
                      <small>
                        +
                        {filteredEvents.filter((event) =>
                          sameDay(event.startsAt, day),
                        ).length - 3}{" "}
                        more
                      </small>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
        {calendarMode === "week" ? (
          <div className="unified-week">
            {weekDays.map((day) => (
              <section
                key={day.toISOString()}
                className={
                  sameDay(new Date().toISOString(), day) ? "today" : ""
                }
              >
                <header>
                  <span>
                    {new Intl.DateTimeFormat("en", { weekday: "short" }).format(
                      day,
                    )}
                  </span>
                  <b>{day.getDate()}</b>
                </header>
                <div>
                  {filteredEvents
                    .filter((event) => sameDay(event.startsAt, day))
                    .map((event) => renderEvent(event))}
                  {!filteredEvents.some((event) =>
                    sameDay(event.startsAt, day),
                  ) ? (
                    <small>Open</small>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        ) : null}
        {calendarMode === "agenda" ? (
          <div className="unified-agenda">
            {visibleAgenda.map((event) => (
              <Card key={event.id}>
                <time>
                  <b>
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(event.startsAt))}
                  </b>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(event.startsAt))}
                  </small>
                </time>
                <i className={event.category} />
                <div>
                  <b>{event.title}</b>
                  <span>{event.description}</span>
                  <small>
                    {event.scope} · {event.location}
                  </small>
                </div>
                <Button variant="outline" type="button" onClick={() => setSelectedEvent(event)}>
                  Details
                </Button>
              </Card>
            ))}
            {!visibleAgenda.length ? (
              <div className="unified-calendar-empty">
                <b>Your agenda is clear</b>
                <span>No matching events from this date forward.</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <footer className="unified-calendar-legend">
          <span>
            <i className="class" />
            Class
          </span>
          <span>
            <i className="assessment" />
            Assessment
          </span>
          <span>
            <i className="deadline" />
            Deadline
          </span>
          <span>
            <i className="meeting" />
            Meeting
          </span>
          <span>
            <i className="campus" />
            Campus
          </span>
          <span>
            <i className="personal" />
            Personal
          </span>
          <span>
            <i className="academic" />
            Academic date
          </span>
        </footer>
      </section>
      {selectedEvent ? (
        <div
          className="calendar-event-detail"
          role="dialog"
          aria-modal="false"
          aria-label="Calendar event details"
        >
          <Button
            type="button"
            className="calendar-detail-close"
            onClick={() => setSelectedEvent(null)}
            aria-label="Close details"
            variant="ghost"
          >
            ×
          </Button>
          <span>{selectedEvent.scope}</span>
          <h3>{selectedEvent.title}</h3>
          <p>{selectedEvent.description || "No additional notes."}</p>
          <dl>
            <div>
              <dt>When</dt>
              <dd>
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "full",
                  timeStyle: "short",
                }).format(new Date(selectedEvent.startsAt))}
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{selectedEvent.location || "Not specified"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {selectedEvent.source} · {selectedEvent.category}
              </dd>
            </div>
            {selectedEvent.sectionId ? (
              <div>
                <dt>Class</dt>
                <dd>
                  {data.courses.find(
                    (course) => course.sectionId === selectedEvent.sectionId,
                  )?.code ?? "Class section"}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
      <ScheduleOperations
        data={data}
        currentUser={currentUser}
        onChanged={onChanged}
        onToast={onToast}
      />
    </>
  );
}
