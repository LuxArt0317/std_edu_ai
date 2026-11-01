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
import type { ChangeEvent } from "react";
import { useState } from "react";
import type { CrmUser } from "../../crm/authService";
import { scanGradeSheet } from "../platformAi";
import {
  correctPublishedGrade,
  publishGrade,
  recordGradeScan,
  saveReviewedScan,
  updateGradeRecord,
} from "../platformRepository";
import { RichTextContent, RichTextEditor } from "../RichTextEditor";
import type { GradeScanResult, PlatformData, PlatformRole } from "../types";

import { PageIntro, Pill, teachingRoles } from "./shared";
export function GradesView({
  data,
  role,
  initialSectionId,
  currentUser,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  role: PlatformRole;
  initialSectionId: string;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const teacherMode = teachingRoles.has(role);
  const [gradeItemId, setGradeItemId] = useState(
    data.gradeItems.find((item) => item.sectionId === initialSectionId)?.id ??
      data.gradeItems[0]?.id ??
      "",
  );
  const [scan, setScan] = useState<GradeScanResult | null>(null);
  const [scanJobId, setScanJobId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [editingGradeId, setEditingGradeId] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [publishingGradeId, setPublishingGradeId] = useState("");
  const selectedItem =
    data.gradeItems.find((item) => item.id === gradeItemId) ??
    data.gradeItems[0];
  const selectedCourse = data.courses.find(
    (course) => course.sectionId === selectedItem?.sectionId,
  );
  const previewStudent = data.students[0];
  const studentGrades =
    currentUser.role === "student"
      ? data.grades.filter((grade) => grade.profileId === currentUser.id)
      : data.grades.filter(
          (grade) =>
            grade.studentId === previewStudent?.id &&
            grade.status === "published",
        );

  async function handleScan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedItem || !selectedCourse) return;
    setScanning(true);
    setScan(null);
    try {
      const result = await scanGradeSheet(
        file,
        `${selectedCourse.code} · ${selectedItem.title}`,
        selectedItem.maxScore,
        data.students.filter((student) =>
          selectedCourse.enrolledStudentIds.includes(student.id),
        ),
      );
      const jobId = await recordGradeScan(
        selectedCourse.sectionId,
        selectedItem.id,
        file.name,
        result,
      );
      setScan(result);
      setScanJobId(jobId);
      onToast("Grade candidates extracted. Review is required before saving.");
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "The grade sheet could not be scanned.",
      );
    } finally {
      setScanning(false);
      event.target.value = "";
    }
  }

  async function approveScan() {
    if (!scan || !scanJobId || !selectedItem) return;
    try {
      const count = await saveReviewedScan(scanJobId, scan, data.students);
      onToast(
        `${count} reviewed grade${count === 1 ? "" : "s"} saved as drafts.`,
      );
      setScan(null);
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Reviewed grades could not be saved.",
      );
    }
  }

  if (!teacherMode)
    return (
      <>
        <PageIntro
          eyebrow="MY ACADEMIC RECORD"
          title="Grades and feedback"
          description="Only your own published grades appear here. Draft and teacher-review records remain private."
        />
        {currentUser.isOwner ? (
          <div className="student-preview-note">
            Preview learner:{" "}
            <strong>
              {previewStudent?.name || "No demonstration learner"}
            </strong>
          </div>
        ) : null}
        <section className="student-grade-grid">
          {studentGrades.length ? (
            studentGrades.map((grade) => {
              const item = data.gradeItems.find(
                (entry) => entry.id === grade.gradeItemId,
              );
              const course = data.courses.find(
                (entry) => entry.sectionId === item?.sectionId,
              );
              const percentage = item
                ? Math.round((grade.score / item.maxScore) * 100)
                : 0;
              return (
                <Card key={grade.id}>
                  <header>
                    <span>{course?.code}</span>
                    <Pill tone="teal">published</Pill>
                  </header>
                  <h3>{item?.title}</h3>
                  <div className="grade-score">
                    <strong>{grade.score}</strong>
                    <span>
                      / {item?.maxScore}
                      <small>
                        {percentage}% · {grade.letterGrade}
                      </small>
                    </span>
                  </div>
                  {grade.feedback ? (
                    <RichTextContent html={grade.feedback} />
                  ) : (
                    <p>No feedback yet.</p>
                  )}
                </Card>
              );
            })
          ) : (
            <div className="school-empty">
              No published grades are available yet.
            </div>
          )}
        </section>
      </>
    );

  const itemGrades = data.grades.filter(
    (grade) => grade.gradeItemId === selectedItem?.id,
  );
  const roster = data.students.filter((student) =>
    selectedCourse?.enrolledStudentIds.includes(student.id),
  );
  return (
    <>
      <PageIntro
        eyebrow="TEACHER GRADEBOOK"
        title="Grades and AI scan review"
        description="Review the class record, scan handwritten or printed grade sheets, and publish only after human confirmation."
        action={
          <Label
            className={`school-primary upload-button ${scanning ? "disabled" : ""}`}
          >
            {scanning ? "Scanning image…" : "▣ Scan grade sheet"}
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={scanning}
              onChange={(event) => void handleScan(event)}
            />
          </Label>
        }
      />
      {selectedCourse && initialSectionId ? (
        <div className="workspace-focus-banner">
          <b>Opened from Academic Office</b>
          <span>
            {selectedCourse.code} · {selectedCourse.title} ·{" "}
            {selectedCourse.sectionCode}
          </span>
        </div>
      ) : null}
      <div className="grade-controls">
        <Label>
          <span>Grade item</span>
          <NativeSelect
            value={selectedItem?.id ?? ""}
            onChange={(event) => {
              setGradeItemId(event.target.value);
              setScan(null);
            }}
          >
            {data.gradeItems.map((item) => {
              const course = data.courses.find(
                (entry) => entry.sectionId === item.sectionId,
              );
              return (
                <NativeSelectOption key={item.id} value={item.id}>
                  {course?.code} · {item.title} ({item.maxScore})
                </NativeSelectOption>
              );
            })}
          </NativeSelect>
        </Label>
        <div>
          <span>HUMAN REVIEW</span>
          <b>AI never publishes grades</b>
        </div>
      </div>
      <section className="school-card gradebook">
        <header>
          <div>
            <span>
              {selectedCourse?.code || "COURSE"} · {selectedItem?.category}
            </span>
            <h3>{selectedItem?.title}</h3>
          </div>
          <Pill tone="blue">{selectedItem?.weight}% weight</Pill>
        </header>
        <div className="gradebook-head">
          <span>Student</span>
          <span>Score</span>
          <span>Grade</span>
          <span>Status</span>
          <span />
        </div>
        {roster.map((student) => {
          const grade = itemGrades.find(
            (item) => item.studentId === student.id,
          );
          return (
            <div className="gradebook-row" key={student.id}>
              <span>
                <b>{student.name}</b>
                <small>{student.studentNumber}</small>
              </span>
              <strong>
                {grade ? `${grade.score} / ${selectedItem?.maxScore}` : "—"}
              </strong>
              <span>{grade?.letterGrade || "Pending"}</span>
              <Pill
                tone={
                  grade?.status === "published"
                    ? "teal"
                    : grade?.status === "reviewed"
                      ? "blue"
                      : "amber"
                }
              >
                {grade?.status || "not graded"}
              </Pill>
              {grade ? (
                <div className="grade-row-actions">
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingGradeId(grade.id);
                      setGradeFeedback(grade.feedback);
                    }}
                  >
                    Edit
                  </Button>
                  {grade.status !== "published" ? (
                    <Button
                      type="button"
                      onClick={() => setPublishingGradeId(grade.id)}
                    >
                      Publish
                    </Button>
                  ) : null}
                </div>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </section>
      {scan ? (
        <section className="scan-review">
          <header>
            <div>
              <span>AI EXTRACTION · REVIEW REQUIRED</span>
              <h3>{scan.rows.length} candidate grades</h3>
              <p>
                Overall confidence {Math.round(scan.overallConfidence * 100)}%.
                Low-confidence or unmatched rows will not be saved.
              </p>
            </div>
            <Button type="button" onClick={() => void approveScan()}>
              Approve reviewed drafts →
            </Button>
          </header>
          {scan.warnings.length ? (
            <div className="scan-warnings">
              {scan.warnings.map((warning) => (
                <span key={warning}>! {warning}</span>
              ))}
            </div>
          ) : null}
          <div className="scan-table">
            <div>
              <span>Student number</span>
              <span>Name</span>
              <span>Score</span>
              <span>Confidence</span>
              <span>Review note</span>
            </div>
            {scan.rows.map((row, index) => (
              <div
                key={`${row.studentNumber}-${index}`}
                className={row.confidence < 0.6 ? "low-confidence" : ""}
              >
                <span>{row.studentNumber || "Unmatched"}</span>
                <span>{row.studentName}</span>
                <strong>{row.score ?? "Unreadable"}</strong>
                <span>{Math.round(row.confidence * 100)}%</span>
                <small>{row.notes}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {publishingGradeId ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setPublishingGradeId(""))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Publish final grade"
          >
            <DialogDescription className="sr-only">
              Review the details and submit to save your changes.
            </DialogDescription>
            <header>
              <div>
                <span>CONTROLLED ACADEMIC RECORD</span>
                <DialogTitle asChild>
                  <h2>Publish this final grade?</h2>
                </DialogTitle>
                <p>
                  The student will see it immediately. Later changes require the
                  audited correction workflow.
                </p>
              </div>
              <Button type="button" onClick={() => setPublishingGradeId("")}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const reason = String(
                  new FormData(event.currentTarget).get("reason"),
                );
                void publishGrade(publishingGradeId, reason)
                  .then(() => {
                    setPublishingGradeId("");
                    onToast(
                      "Final grade published with immutable audit evidence.",
                    );
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Grade could not be published.",
                    ),
                  );
              }}
            >
              <Label>
                <span>Publication reason</span>
                <Textarea
                  name="reason"
                  minLength={12}
                  maxLength={1000}
                  rows={4}
                  required
                  placeholder="Confirm grading review and publication basis."
                />
              </Label>
              <footer>
                <span>
                  Actor, timestamp, reason, and before/after state are
                  preserved.
                </span>
                <Button>Publish final grade</Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {editingGradeId
        ? (() => {
            const grade = data.grades.find(
              (item) => item.id === editingGradeId,
            );
            const item = data.gradeItems.find(
              (entry) => entry.id === grade?.gradeItemId,
            );
            if (!grade) return null;
            return (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open) (() => setEditingGradeId(""))();
                }}
              >
                <DialogContent
                  showCloseButton={false}
                  className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Edit grade"
                >
                  <DialogDescription className="sr-only">
                    Review the details and submit to save your changes.
                  </DialogDescription>
                  <header>
                    <div>
                      <span>TEACHER GRADEBOOK</span>
                      <DialogTitle asChild>
                        <h2>Edit {grade.studentName}'s grade</h2>
                      </DialogTitle>
                      <p>
                        Correct the score, letter grade, feedback, and
                        publication state.
                      </p>
                    </div>
                    <Button type="button" onClick={() => setEditingGradeId("")}>
                      ×
                    </Button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      const operation =
                        grade.status === "published"
                          ? correctPublishedGrade({
                              gradeId: grade.id,
                              score: Number(f.get("score")),
                              letterGrade: String(f.get("letterGrade")),
                              feedback: gradeFeedback,
                              reason: String(f.get("reason")),
                            })
                          : updateGradeRecord(grade.id, {
                              score: Number(f.get("score")),
                              letterGrade: String(f.get("letterGrade")),
                              feedback: gradeFeedback,
                              status: String(f.get("status")) as
                                "draft" | "reviewed" | "published",
                            });
                      void operation
                        .then(() => {
                          setEditingGradeId("");
                          onToast("Grade updated.");
                          onChanged();
                        })
                        .catch((error: unknown) =>
                          onToast(
                            error instanceof Error
                              ? error.message
                              : "Grade update failed.",
                          ),
                        );
                    }}
                  >
                    <div className="academic-form-grid">
                      <Label>
                        <span>Score out of {item?.maxScore}</span>
                        <Input
                          name="score"
                          type="number"
                          min="0"
                          max={item?.maxScore ?? 100}
                          step="0.01"
                          required
                          defaultValue={grade.score}
                        />
                      </Label>
                      {grade.status === "published" ? (
                        <Label>
                          <span>Required correction reason</span>
                          <Textarea
                            name="reason"
                            minLength={12}
                            maxLength={1000}
                            rows={4}
                            required
                          />
                        </Label>
                      ) : null}
                      <Label>
                        <span>Letter grade</span>
                        <Input
                          name="letterGrade"
                          maxLength={8}
                          defaultValue={grade.letterGrade}
                        />
                      </Label>
                      <Label>
                        <span>Status</span>
                        <NativeSelect
                          name="status"
                          defaultValue={grade.status}
                          disabled={grade.status === "published"}
                        >
                          {grade.status === "published" ? (
                            <NativeSelectOption value="published">
                              Published
                            </NativeSelectOption>
                          ) : null}
                          {grade.status !== "published" ? (
                            <NativeSelectOption value="draft">
                              Draft
                            </NativeSelectOption>
                          ) : null}
                          {grade.status !== "published" ? (
                            <NativeSelectOption value="reviewed">
                              Reviewed
                            </NativeSelectOption>
                          ) : null}
                        </NativeSelect>
                      </Label>
                      <Label className="wide">
                        <span>Feedback</span>
                        <RichTextEditor
                          value={gradeFeedback}
                          onChange={setGradeFeedback}
                        />
                      </Label>
                    </div>
                    <footer>
                      <Button
                        type="button"
                        onClick={() => setEditingGradeId("")}
                      >
                        Cancel
                      </Button>
                      <Button type="submit">Save grade changes</Button>
                    </footer>
                  </form>
                </DialogContent>
              </Dialog>
            );
          })()
        : null}
    </>
  );
}
