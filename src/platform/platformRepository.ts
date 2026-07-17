import { supabase } from "../utils/supabase";
import { withTimeout } from "../utils/async";
import type { Json, Tables } from "../types/database.generated";
import type {
  AssessmentAttemptResult,
  AssessmentOption,
  AssessmentQuestion,
  ChatMessage,
  ChatThread,
  GradeScanResult,
  PlatformData,
  PlatformProfile,
  PlatformRole,
  AuthDirectoryAccount,
  SchoolAssessment,
} from "./types";

type CourseRow = Tables<"courses">;
type SectionRow = Tables<"course_sections">;
type EnrollmentRow = Tables<"section_enrollments">;
type QuestionRow = Tables<"assessment_questions">;
type OptionRow = Tables<"assessment_options">;
type AnswerKeyRow = Tables<"assessment_answer_keys">;

type PlatformSnapshot = {
  userId: string;
  data: PlatformData;
  loadedAt: number;
};
let platformSnapshot: PlatformSnapshot | null = null;
let platformLoad: { userId: string; promise: Promise<PlatformData> } | null =
  null;

export function getPlatformDataSnapshot(userId: string) {
  return platformSnapshot?.userId === userId ? platformSnapshot.data : null;
}

export function clearPlatformDataSnapshot() {
  platformSnapshot = null;
  platformLoad = null;
}

export async function loadPlatformDataCached(userId: string, force = false) {
  if (!force && platformSnapshot?.userId === userId)
    return platformSnapshot.data;
  if (platformLoad?.userId === userId) return platformLoad.promise;
  const promise = loadPlatformData()
    .then((data) => {
      platformSnapshot = { userId, data, loadedAt: Date.now() };
      return data;
    })
    .finally(() => {
      if (platformLoad?.promise === promise) platformLoad = null;
    });
  platformLoad = { userId, promise };
  return promise;
}

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function rows<T>(
  result: { data: T[] | null; error: { message: string } | null },
  label: string,
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

function shortDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export async function loadPlatformData(): Promise<PlatformData> {
  const client = requireClient();
  const { data: authData, error: authError } = await withTimeout(
    client.auth.getUser(),
    12_000,
    "Session verification took too long. Check the connection and try again.",
  );
  if (authError || !authData.user)
    throw new Error("An authenticated STU Nexus session is required.");

  const [
    rolesResult,
    profilesResult,
    studentsResult,
    departmentsResult,
    programsResult,
    termsResult,
    coursesResult,
    sectionsResult,
    enrollmentsResult,
    topicsResult,
    assessmentsResult,
    questionsResult,
    optionsResult,
    answerKeysResult,
    gradeItemsResult,
    gradesResult,
    scheduleResult,
    announcementsResult,
    threadsResult,
    modulesResult,
    materialsResult,
    materialPagesResult,
    progressResult,
    submissionsResult,
    attendanceSessionsResult,
    attendanceRecordsResult,
    roleAuditsResult,
    accountAuditsResult,
    accessAuditsResult,
    supportRequestsResult,
    sectionAssignmentsResult,
    attendanceCorrectionsResult,
    controlledAuditsResult,
  ] = await withTimeout(
    Promise.all([
      client
        .from("role_definitions")
        .select("*")
        .order("hierarchy_level", { ascending: false }),
      client.from("profiles").select("*").order("full_name"),
      client.from("students").select("*").order("full_name"),
      client.from("departments").select("*").order("name"),
      client.from("academic_programs").select("*").order("name"),
      client
        .from("academic_terms")
        .select("*")
        .order("starts_on", { ascending: false }),
      client.from("courses").select("*").order("code"),
      client.from("course_sections").select("*").order("section_code"),
      client.from("section_enrollments").select("*"),
      client.from("course_topics").select("*").order("position"),
      client.from("assessments").select("*").order("due_at"),
      client.from("assessment_questions").select("*").order("position"),
      client.from("assessment_options").select("*").order("position"),
      client.from("assessment_answer_keys").select("*"),
      client.from("grade_items").select("*").order("due_at"),
      client
        .from("grades")
        .select("*")
        .order("updated_at", { ascending: false }),
      client.from("schedule_events").select("*").order("starts_at"),
      client
        .from("announcements")
        .select("*")
        .order("published_at", { ascending: false }),
      client
        .from("chat_threads")
        .select("*")
        .order("updated_at", { ascending: false }),
      client.from("learning_modules").select("*").order("position"),
      client.from("learning_materials").select("*").order("position"),
      client.from("learning_material_pages").select("*").order("position"),
      client.from("learning_progress").select("*"),
      client
        .from("assignment_submissions")
        .select("*")
        .order("updated_at", { ascending: false }),
      client
        .from("attendance_sessions")
        .select("*")
        .order("starts_at", { ascending: false }),
      client.from("attendance_records").select("*"),
      client
        .from("role_change_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("account_lifecycle_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("account_access_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      client.from("cases").select("*").order("updated_at", { ascending: false }),
      client.from("profile_section_assignments").select("*").order("created_at", { ascending: false }),
      client.from("attendance_correction_requests").select("*").order("created_at", { ascending: false }),
      client.from("controlled_action_audit").select("*").order("created_at", { ascending: false }).limit(100),
    ]),
    20_000,
    "The school workspace took too long to load. Check the connection and try again.",
  );

  const roleRows = rows(rolesResult, "Roles");
  const profileRows = rows(profilesResult, "People");
  const studentRows = rows(studentsResult, "Students");
  const departmentRows = rows(departmentsResult, "Departments");
  const programRows = rows(programsResult, "Programs");
  const termRows = rows(termsResult, "Terms");
  const courseRows = rows<CourseRow>(coursesResult, "Courses");
  const sectionRows = rows<SectionRow>(sectionsResult, "Course sections");
  const enrollmentRows = rows<EnrollmentRow>(enrollmentsResult, "Enrollments");
  const topicRows = rows(topicsResult, "Topics");
  const assessmentRows = rows(assessmentsResult, "Assessments");
  const questionRows = rows<QuestionRow>(
    questionsResult,
    "Assessment questions",
  );
  const optionRows = rows<OptionRow>(optionsResult, "Assessment choices");
  const answerKeyRows = rows<AnswerKeyRow>(
    answerKeysResult,
    "Assessment answer keys",
  );
  const gradeItemRows = rows(gradeItemsResult, "Grade items");
  const gradeRows = rows(gradesResult, "Grades");
  const scheduleRows = rows(scheduleResult, "Schedule");
  const announcementRows = rows(announcementsResult, "Announcements");
  const threadRows = rows(threadsResult, "AI conversations");
  const moduleRows = rows(modulesResult, "Learning modules");
  const materialRows = rows(materialsResult, "Learning materials");
  const materialPageRows = rows(materialPagesResult, "Learning material pages");
  const progressRows = rows(progressResult, "Learning progress");
  const submissionRows = rows(submissionsResult, "Assignment submissions");
  const attendanceSessionRows = rows(
    attendanceSessionsResult,
    "Attendance sessions",
  );
  const attendanceRecordRows = rows(
    attendanceRecordsResult,
    "Attendance records",
  );
  const roleAuditRows = rows(roleAuditsResult, "Role audit");
  const accountAuditRows = rows(accountAuditsResult, "Account audit");
  const accessAuditRows = rows(accessAuditsResult, "Account access audit");
  const supportRequestRows = rows(supportRequestsResult, "Support requests");
  const sectionAssignmentRows = rows(sectionAssignmentsResult, "Class responsibilities");
  const attendanceCorrectionRows = rows(attendanceCorrectionsResult, "Attendance corrections");
  const controlledAuditRows = rows(controlledAuditsResult, "Controlled action audit");

  const profilesById = new Map(
    profileRows.map((profile) => [profile.id, profile]),
  );
  const studentsById = new Map(
    studentRows.map((student) => [student.id, student]),
  );
  const termsById = new Map(termRows.map((term) => [term.id, term]));
  const coursesById = new Map(courseRows.map((course) => [course.id, course]));

  const courses = sectionRows.map((section) => {
    const course = coursesById.get(section.course_id);
    const term = termsById.get(section.term_id);
    const faculty = section.faculty_id
      ? profilesById.get(section.faculty_id)
      : null;
    const enrollments = enrollmentRows.filter(
      (item) => item.section_id === section.id && item.status !== "dropped",
    );
    return {
      sectionId: section.id,
      courseId: section.course_id,
      code: course?.code ?? "COURSE",
      title: course?.title ?? "Course",
      description: course?.description ?? "",
      credits: Number(course?.credits ?? 0),
      sectionCode: section.section_code,
      term: term?.name ?? "Academic term",
      termStatus: term?.status ?? "planning",
      facultyId: section.faculty_id,
      facultyName: faculty?.full_name ?? "Faculty assignment pending",
      modality: section.modality,
      room: section.room ?? "To be announced",
      capacity: section.capacity,
      status: section.status,
      enrolledStudentIds: enrollments.flatMap((item) =>
        item.student_id ? [item.student_id] : [],
      ),
      enrolledProfileIds: enrollments.flatMap((item) =>
        item.student_profile_id ? [item.student_profile_id] : [],
      ),
    };
  });

  const questions: AssessmentQuestion[] = questionRows.map((question) => ({
    id: question.id,
    assessmentId: question.assessment_id,
    prompt: question.prompt,
    type: question.question_type as AssessmentQuestion["type"],
    points: Number(question.points),
    position: question.position,
    explanation: question.explanation,
    options: optionRows
      .filter((option) => option.question_id === question.id)
      .map<AssessmentOption>((option) => ({
        id: option.id,
        label: option.label,
        position: option.position,
      })),
    correctOption: (() => {
      const optionId = answerKeyRows.find(
        (key) => key.question_id === question.id,
      )?.correct_option_id;
      return (
        optionRows.find((option) => option.id === optionId)?.position ?? null
      );
    })(),
  }));

  const assessments: SchoolAssessment[] = assessmentRows.map((assessment) => ({
    id: assessment.id,
    sectionId: assessment.section_id,
    title: assessment.title,
    instructions: assessment.instructions,
    type: assessment.assessment_type,
    status: assessment.status,
    opensAt: assessment.opens_at,
    dueAt: assessment.due_at,
    durationMinutes: assessment.duration_minutes,
    attemptLimit: assessment.attempt_limit,
    maxScore: Number(assessment.max_score),
    questions: questions.filter(
      (question) => question.assessmentId === assessment.id,
    ),
  }));

  return {
    roles: roleRows.map((role) => ({
      code: role.role_code as PlatformRole,
      name: role.display_name,
      level: role.hierarchy_level,
      category: role.category,
      description: role.description,
      capabilities: role.capabilities,
    })),
    profiles: profileRows.map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      role: profile.role as PlatformRole,
      department: profile.department ?? "",
      departmentId: profile.department_id ?? null,
      programId: profile.program_id ?? null,
      jobTitle: profile.job_title ?? "",
      isOwner: profile.is_platform_owner,
      accountStatus: (profile.account_status ??
        "active") as PlatformProfile["accountStatus"],
      statusChangedAt: profile.status_changed_at ?? null,
      statusReason: profile.status_reason ?? "",
    })),
    students: studentRows.map((student) => ({
      id: student.id,
      profileId: student.profile_id,
      studentNumber: student.student_number,
      name: student.preferred_name || student.full_name,
      program: student.program,
      yearLevel: student.year_level,
      email: student.email,
      fullName: student.full_name,
      preferredName: student.preferred_name ?? "",
      phone: student.phone ?? "",
      advisorId: student.advisor_id,
    })),
    departments: departmentRows.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      description: department.description,
      status: department.status,
      headId: department.head_id,
    })),
    programs: programRows.map((program) => ({
      id: program.id,
      code: program.code,
      name: program.name,
      level: program.level,
      departmentId: program.department_id,
      description: program.description,
      durationYears: Number(program.duration_years),
      status: program.status,
    })),
    terms: termRows.map((term) => ({
      id: term.id,
      code: term.code,
      name: term.name,
      startsOn: term.starts_on,
      endsOn: term.ends_on,
      enrollmentStartsOn: term.enrollment_starts_on,
      enrollmentEndsOn: term.enrollment_ends_on,
      status: term.status,
    })),
    catalogCourses: courseRows.map((course) => ({
      id: course.id,
      departmentId: course.department_id,
      programId: course.program_id,
      code: course.code,
      title: course.title,
      description: course.description,
      credits: Number(course.credits),
      status: course.status,
    })),
    courses,
    enrollments: enrollmentRows.map((enrollment) => ({
      id: enrollment.id,
      sectionId: enrollment.section_id,
      studentId: enrollment.student_id,
      profileId: enrollment.student_profile_id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolled_at,
    })),
    topics: topicRows.map((topic) => ({
      id: topic.id,
      sectionId: topic.section_id,
      title: topic.title,
      summary: topic.summary,
      content: topic.content_markdown,
      position: topic.position,
      minutes: topic.estimated_minutes,
      published: Boolean(topic.published_at),
    })),
    modules: moduleRows.map((module) => ({
      id: module.id,
      sectionId: module.section_id,
      title: module.title,
      description: module.description,
      position: module.position,
      status: module.status,
      unlocksAt: module.unlocks_at,
      publishedAt: module.published_at,
    })),
    materials: materialRows.map((material) => ({
      id: material.id,
      moduleId: material.module_id,
      title: material.title,
      description: material.description,
      type: material.material_type,
      content: material.content_markdown,
      externalUrl: material.external_url,
      storagePath: material.storage_path,
      position: material.position,
      minutes: material.estimated_minutes,
      required: material.is_required,
      status: material.status,
    })),
    materialPages: materialPageRows.map((page) => ({
      id: page.id,
      materialId: page.material_id,
      title: page.title,
      content: page.content_html,
      position: page.position,
    })),
    progress: progressRows.map((item) => ({
      id: item.id,
      materialId: item.material_id,
      profileId: item.student_profile_id,
      status: item.status,
      completedAt: item.completed_at,
    })),
    submissions: submissionRows.map((item) => ({
      id: item.id,
      assessmentId: item.assessment_id,
      profileId: item.student_profile_id,
      text: item.submission_text,
      storagePath: item.storage_path,
      status: item.status,
      submittedAt: item.submitted_at,
      score: item.score === null ? null : Number(item.score),
      feedback: item.feedback,
    })),
    attendanceSessions: attendanceSessionRows.map((item) => ({
      id: item.id,
      sectionId: item.section_id,
      title: item.title,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      status: item.status,
    })),
    attendanceRecords: attendanceRecordRows.map((item) => ({
      id: item.id,
      sessionId: item.session_id,
      profileId: item.student_profile_id,
      status: item.status,
      notes: item.notes,
    })),
    assessments,
    gradeItems: gradeItemRows.map((item) => ({
      id: item.id,
      sectionId: item.section_id,
      assessmentId: item.assessment_id,
      title: item.title,
      category: item.category,
      maxScore: Number(item.max_score),
      weight: Number(item.weight_percent),
      dueAt: item.due_at,
    })),
    grades: gradeRows.map((grade) => {
      const student = grade.student_id
        ? studentsById.get(grade.student_id)
        : null;
      const profile = grade.student_profile_id
        ? profilesById.get(grade.student_profile_id)
        : null;
      return {
        id: grade.id,
        gradeItemId: grade.grade_item_id,
        studentId: grade.student_id,
        profileId: grade.student_profile_id,
        studentName:
          student?.preferred_name ||
          student?.full_name ||
          profile?.full_name ||
          "Student",
        studentNumber: student?.student_number || "Portal learner",
        score: Number(grade.score),
        letterGrade: grade.letter_grade ?? "",
        feedback: grade.feedback ?? "",
        status: grade.status as "draft" | "reviewed" | "published",
        publishedAt: grade.published_at,
      };
    }),
    schedule: scheduleRows.map((event) => ({
      id: event.id,
      sectionId: event.section_id,
      title: event.title,
      description: event.description,
      type: event.event_type,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.location ?? "Online",
      ownerProfileId: event.owner_profile_id,
      audienceRoles: event.audience_roles,
      createdBy: event.created_by,
    })),
    announcements: announcementRows.map((announcement) => ({
      id: announcement.id,
      sectionId: announcement.section_id,
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      publishedAt: shortDate(announcement.published_at) ?? "Draft",
    })),
    threads: threadRows.map((thread) => ({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updated_at,
    })),
    roleAudits: roleAuditRows.map((item) => ({
      id: item.id,
      targetProfileId: item.target_profile_id,
      changedBy: item.changed_by,
      previousRole: item.previous_role,
      newRole: item.new_role,
      reason: item.reason,
      createdAt: item.created_at,
    })),
    accountAudits: accountAuditRows.map((item) => ({
      id: item.id,
      targetProfileId: item.target_profile_id,
      changedBy: item.changed_by,
      previousStatus: item.previous_status,
      newStatus: item.new_status,
      reason: item.reason,
      createdAt: item.created_at,
    })),
    accessAudits: accessAuditRows.map((item) => ({
      id: item.id,
      targetProfileId: item.target_profile_id,
      changedBy: item.acted_by,
      action: item.action,
      reason: item.reason,
      createdAt: item.created_at,
    })),
    supportRequests: supportRequestRows.map((item) => ({
      id: item.id,
      studentId: item.student_id,
      title: item.title,
      category: item.category,
      description: item.description,
      priority: item.priority,
      status: item.status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    sectionAssignments: sectionAssignmentRows.map((item) => ({
      id: item.id,
      profileId: item.profile_id,
      sectionId: item.section_id,
      responsibility: item.responsibility as "faculty" | "assistant" | "coordinator" | "observer",
      assignedBy: item.assigned_by,
      reason: item.reason,
      createdAt: item.created_at,
    })),
    attendanceCorrections: attendanceCorrectionRows.map((item) => ({
      id: item.id,
      attendanceRecordId: item.attendance_record_id,
      studentProfileId: item.student_profile_id,
      requestedStatus: item.requested_status as "present" | "absent" | "late" | "excused",
      reason: item.reason,
      status: item.status as "pending" | "approved" | "rejected" | "cancelled",
      decisionReason: item.decision_reason ?? "",
      decidedBy: item.decided_by,
      decidedAt: item.decided_at,
      createdAt: item.created_at,
    })),
    controlledAudits: controlledAuditRows.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entity_type,
      entityId: item.entity_id,
      actorId: item.actor_id,
      reason: item.reason,
      createdAt: item.created_at,
    })),
  };
}

export async function submitAssessment(
  assessmentId: string,
  answers: Array<{ questionId: string; optionId?: string; text?: string }>,
): Promise<AssessmentAttemptResult> {
  const client = requireClient();
  const { data, error } = await client.rpc("submit_assessment", {
    p_assessment_id: assessmentId,
    p_answers: answers as unknown as Json,
  });
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("The assessment did not return a result.");
  return {
    attemptId: result.attempt_id,
    score: Number(result.score),
    maxScore: Number(result.max_score),
    status: result.status,
  };
}

export async function createChatThread(title: string): Promise<ChatThread> {
  const client = requireClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error("Authentication is required.");
  const { data, error } = await client
    .from("chat_threads")
    .insert({
      owner_id: userData.user.id,
      title: title.trim().slice(0, 120) || "New conversation",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, title: data.title, updatedAt: data.updated_at };
}

export async function loadChatMessages(
  threadId: string,
): Promise<ChatMessage[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((message) => ({
    id: message.id,
    threadId: message.thread_id,
    role: message.author_role as ChatMessage["role"],
    content: message.content,
    citations: message.citations,
    createdAt: message.created_at,
  }));
}

export async function appendChatMessage(
  threadId: string,
  role: ChatMessage["role"],
  content: string,
  citations: string[] = [],
) {
  const client = requireClient();
  const { error } = await client
    .from("chat_messages")
    .insert({ thread_id: threadId, author_role: role, content, citations });
  if (error) throw new Error(error.message);
  await client
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
}

export async function recordGradeScan(
  sectionId: string,
  gradeItemId: string,
  sourceName: string,
  result: GradeScanResult,
) {
  const client = requireClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error("Authentication is required.");
  const { data, error } = await client
    .from("grade_scan_jobs")
    .insert({
      section_id: sectionId,
      grade_item_id: gradeItemId,
      uploaded_by: userData.user.id,
      source_name: sourceName.slice(0, 255),
      status: "needs_review",
      extracted_payload: result as unknown as Json,
      confidence: result.overallConfidence,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function saveReviewedScan(
  jobId: string,
  result: GradeScanResult,
  students: PlatformData["students"],
) {
  const client = requireClient();
  const reviewedRows = [];
  for (const row of result.rows) {
    if (row.score === null || row.confidence < 0.6) continue;
    const student = students.find(
      (item) =>
        item.studentNumber.toLowerCase() === row.studentNumber.toLowerCase() ||
        item.name.toLowerCase() === row.studentName.toLowerCase(),
    );
    if (!student) continue;
    reviewedRows.push({
      studentId: student.id,
      score: row.score,
      feedback: row.notes || "Imported from reviewed grade-sheet scan.",
    });
  }
  const { data, error } = await client.rpc("approve_grade_scan", {
    p_job_id: jobId,
    p_rows: reviewedRows as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return Number(data?.[0]?.saved_count ?? 0);
}

export async function publishGrade(gradeId: string, reason: string) {
  const client = requireClient();
  const { error } = await client.rpc("publish_final_grade", {
    p_grade_id: gradeId,
    p_reason: clean(reason, "Publication reason", 1000),
  });
  if (error) throw new Error(error.message);
}

export async function correctPublishedGrade(input: {
  gradeId: string;
  score: number;
  letterGrade: string;
  feedback: string;
  reason: string;
}) {
  const client = requireClient();
  const { error } = await client.rpc("correct_published_grade", {
    p_grade_id: input.gradeId,
    p_score: input.score,
    p_letter_grade: input.letterGrade.trim().slice(0, 8),
    p_feedback: input.feedback.trim().slice(0, 10000),
    p_reason: clean(input.reason, "Correction reason", 1000),
  });
  if (error) throw new Error(error.message);
}

export async function closeAcademicTerm(termId: string, reason: string) {
  const client = requireClient();
  const { error } = await client.rpc("close_academic_term", {
    p_term_id: termId,
    p_reason: clean(reason, "Closure reason", 1000),
  });
  if (error) throw new Error(error.message);
}

export async function requestAttendanceCorrection(input: {
  attendanceRecordId: string;
  studentProfileId: string;
  requestedStatus: "present" | "absent" | "late" | "excused";
  reason: string;
}) {
  const client = requireClient();
  const { error } = await client.from("attendance_correction_requests").insert({
    attendance_record_id: input.attendanceRecordId,
    student_profile_id: input.studentProfileId,
    requested_status: input.requestedStatus,
    reason: clean(input.reason, "Correction reason", 1000),
  });
  if (error) throw new Error(error.message);
}

export async function decideAttendanceCorrection(input: {
  requestId: string;
  approve: boolean;
  reason: string;
}) {
  const client = requireClient();
  const { error } = await client.rpc("decide_attendance_correction", {
    p_request_id: input.requestId,
    p_approve: input.approve,
    p_reason: clean(input.reason, "Decision reason", 1000),
  });
  if (error) throw new Error(error.message);
}

export async function assignProfileResponsibilities(input: {
  profileId: string;
  departmentId: string | null;
  programId: string | null;
  sectionId: string | null;
  responsibility: "faculty" | "assistant" | "coordinator" | "observer";
  reason: string;
}) {
  const client = requireClient();
  const reason = clean(input.reason, "Assignment reason", 500);
  const { error: profileError } = await client.from("profiles").update({
    department_id: input.departmentId,
    program_id: input.programId,
  }).eq("id", input.profileId);
  if (profileError) throw new Error(profileError.message);
  if (input.sectionId) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) throw new Error("An authenticated operator is required.");
    const { error } = await client.from("profile_section_assignments").upsert({
      profile_id: input.profileId,
      section_id: input.sectionId,
      responsibility: input.responsibility,
      assigned_by: userData.user.id,
      reason,
    }, { onConflict: "profile_id,section_id,responsibility" });
    if (error) throw new Error(error.message);
  }
}

export async function updateGradeRecord(
  gradeId: string,
  input: {
    score: number;
    letterGrade: string;
    feedback: string;
    status: "draft" | "reviewed" | "published";
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("grades")
    .update({
      score: input.score,
      letter_grade: input.letterGrade.trim().slice(0, 8) || null,
      feedback: input.feedback.trim().slice(0, 10000),
      status: input.status,
      published_at:
        input.status === "published" ? new Date().toISOString() : null,
    })
    .eq("id", gradeId);
  if (error) throw new Error(error.message);
}

export async function assignPlatformRole(
  profileId: string,
  role: PlatformRole,
  reason: string,
) {
  const client = requireClient();
  const { data, error } = await client.rpc("assign_platform_role", {
    p_profile_id: profileId,
    p_new_role: role,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error("The role change was not confirmed.");
  return data[0];
}

export async function updateRoleCapabilities(role: Exclude<PlatformRole, "owner">, capabilities: string[]) {
  const client = requireClient();
  const normalized = [...new Set(capabilities.map((item) => item.trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_")).filter(Boolean))].slice(0, 100);
  const { error } = await client.from("role_definitions").update({ capabilities: normalized }).eq("role_code", role);
  if (error) throw new Error(error.message);
}

export async function provisionRoleAccount(input: {
  email: string;
  password: string;
  role: Exclude<PlatformRole, "owner">;
  fullName: string;
}) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke(
    "provision-role-account",
    { body: input },
  );
  if (error) {
    const response =
      "context" in error && error.context instanceof Response
        ? error.context
        : null;
    if (response) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error || error.message);
    }
    throw new Error(error.message);
  }
  if (!data?.id) throw new Error("The account was not confirmed by Auth.");
  return data as {
    id: string;
    email: string;
    role: Exclude<PlatformRole, "owner">;
    status: "created" | "updated";
  };
}

export async function changeAccountLifecycle(input: {
  targetId: string;
  action: "activate" | "suspend" | "archive" | "restore";
  reason: string;
}) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke(
    "provision-role-account",
    { body: input },
  );
  if (error) {
    const response =
      "context" in error && error.context instanceof Response
        ? error.context
        : null;
    if (response) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error || error.message);
    }
    throw new Error(error.message);
  }
  if (!data?.id || !data?.status)
    throw new Error("The lifecycle change was not confirmed by Auth.");
  return data as { id: string; status: PlatformProfile["accountStatus"] };
}

async function invokeAccountControl(body: Record<string, unknown>) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke(
    "provision-role-account",
    { body },
  );
  if (error) {
    const response =
      "context" in error && error.context instanceof Response
        ? error.context
        : null;
    if (response) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error || error.message);
    }
    throw new Error(error.message);
  }
  return data;
}

export async function loadAccountDirectory(): Promise<AuthDirectoryAccount[]> {
  const data = await invokeAccountControl({ action: "directory" });
  if (!Array.isArray(data?.accounts))
    throw new Error("The Auth directory returned an invalid response.");
  return data.accounts as AuthDirectoryAccount[];
}

export async function revokeAccountSessions(input: {
  targetId: string;
  reason: string;
}) {
  const data = await invokeAccountControl({
    action: "revoke_sessions",
    ...input,
  });
  if (!data?.id || typeof data.revokedCount !== "number")
    throw new Error("Session revocation was not confirmed.");
  return data as { id: string; revokedCount: number };
}

export async function inviteRoleAccount(input: {
  email: string;
  role: Exclude<PlatformRole, "owner">;
  fullName: string;
}) {
  const data = await invokeAccountControl({ action: "invite", ...input });
  if (!data?.id || data.status !== "invited") throw new Error("The invitation was not confirmed by Auth.");
  return data as { id: string; email: string; status: "invited" };
}

export async function resendRoleInvitation(email: string) {
  const data = await invokeAccountControl({ action: "resend_invitation", email });
  if (!data?.id || data.status !== "invitation_resent") throw new Error("The invitation resend was not confirmed by Auth.");
  return data as { id: string; email: string; status: "invitation_resent" };
}

export async function createStudentSupportRequest(input: {
  studentId: string;
  title: string;
  category: string;
  description: string;
  priority: "low" | "medium" | "high";
}) {
  const client = requireClient();
  const { data, error } = await client
    .from("cases")
    .insert({
      student_id: input.studentId,
      title: clean(input.title, "Title", 160),
      category: clean(input.category, "Category", 80),
      description: clean(input.description, "Description", 5000),
      priority: input.priority,
      status: "open",
      owner_id: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

function clean(value: string, label: string, max = 160) {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required.`);
  if (result.length > max) throw new Error(`${label} is too long.`);
  return result;
}

export async function createDepartment(input: {
  code: string;
  name: string;
  description: string;
  headId?: string;
}) {
  const client = requireClient();
  const { data, error } = await client
    .from("departments")
    .insert({
      code: clean(input.code, "Department code", 20).toUpperCase(),
      name: clean(input.name, "Department name", 120),
      description: input.description.trim().slice(0, 1000),
      head_id: input.headId || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateDepartment(
  id: string,
  input: {
    code: string;
    name: string;
    description: string;
    headId?: string;
    status: string;
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("departments")
    .update({
      code: clean(input.code, "Department code", 20).toUpperCase(),
      name: clean(input.name, "Department name", 120),
      description: input.description.trim().slice(0, 1000),
      head_id: input.headId || null,
      status: input.status,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createProgram(input: {
  departmentId: string;
  code: string;
  name: string;
  level: string;
  durationYears: number;
  description: string;
}) {
  const client = requireClient();
  const { data, error } = await client
    .from("academic_programs")
    .insert({
      department_id: clean(input.departmentId, "Department"),
      code: clean(input.code, "Program code", 30).toUpperCase(),
      name: clean(input.name, "Program name", 160),
      level: input.level,
      duration_years: input.durationYears,
      description: input.description.trim().slice(0, 1500),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateProgram(
  id: string,
  input: {
    departmentId: string;
    code: string;
    name: string;
    level: string;
    durationYears: number;
    description: string;
    status: string;
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("academic_programs")
    .update({
      department_id: clean(input.departmentId, "Department"),
      code: clean(input.code, "Program code", 30).toUpperCase(),
      name: clean(input.name, "Program name", 160),
      level: input.level,
      duration_years: input.durationYears,
      description: input.description.trim().slice(0, 1500),
      status: input.status,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createAcademicTerm(input: {
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  enrollmentStartsOn?: string;
  enrollmentEndsOn?: string;
  status: string;
}) {
  const client = requireClient();
  const { data, error } = await client
    .from("academic_terms")
    .insert({
      code: clean(input.code, "Term code", 30).toUpperCase(),
      name: clean(input.name, "Term name", 120),
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      enrollment_starts_on: input.enrollmentStartsOn || null,
      enrollment_ends_on: input.enrollmentEndsOn || null,
      status: input.status,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateAcademicTerm(
  id: string,
  input: {
    code: string;
    name: string;
    startsOn: string;
    endsOn: string;
    enrollmentStartsOn?: string;
    enrollmentEndsOn?: string;
    status: string;
  },
) {
  if (new Date(input.endsOn) < new Date(input.startsOn))
    throw new Error("The term must end after it starts.");
  const client = requireClient();
  const { error } = await client
    .from("academic_terms")
    .update({
      code: clean(input.code, "Term code", 30).toUpperCase(),
      name: clean(input.name, "Term name", 120),
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      enrollment_starts_on: input.enrollmentStartsOn || null,
      enrollment_ends_on: input.enrollmentEndsOn || null,
      status: input.status,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createCatalogCourse(input: {
  departmentId: string;
  programId?: string;
  code: string;
  title: string;
  description: string;
  credits: number;
}) {
  const client = requireClient();
  const { data, error } = await client
    .from("courses")
    .insert({
      department_id: clean(input.departmentId, "Department"),
      program_id: input.programId || null,
      code: clean(input.code, "Subject code", 30).toUpperCase(),
      title: clean(input.title, "Subject title", 180),
      description: input.description.trim().slice(0, 2000),
      credits: input.credits,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateCatalogCourse(
  id: string,
  input: {
    departmentId: string;
    programId?: string;
    code: string;
    title: string;
    description: string;
    credits: number;
    status: string;
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("courses")
    .update({
      department_id: clean(input.departmentId, "Department"),
      program_id: input.programId || null,
      code: clean(input.code, "Subject code", 30).toUpperCase(),
      title: clean(input.title, "Subject title", 180),
      description: input.description.trim().slice(0, 2000),
      credits: input.credits,
      status: input.status,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createCourseSection(input: {
  courseId: string;
  termId: string;
  sectionCode: string;
  facultyId?: string;
  modality: string;
  room?: string;
  capacity: number;
  status: string;
}) {
  const client = requireClient();
  const { data, error } = await client
    .from("course_sections")
    .insert({
      course_id: clean(input.courseId, "Subject"),
      term_id: clean(input.termId, "Academic term"),
      section_code: clean(input.sectionCode, "Section code", 30).toUpperCase(),
      faculty_id: input.facultyId || null,
      modality: input.modality,
      room: input.room?.trim().slice(0, 120) || null,
      capacity: input.capacity,
      status: input.status,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateCourseSection(
  sectionId: string,
  input: {
    facultyId?: string;
    modality: string;
    room?: string;
    capacity: number;
    status: string;
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("course_sections")
    .update({
      faculty_id: input.facultyId || null,
      modality: input.modality,
      room: input.room?.trim().slice(0, 120) || null,
      capacity: input.capacity,
      status: input.status,
    })
    .eq("id", sectionId);
  if (error) throw new Error(error.message);
}

export async function manageSectionEnrollment(
  sectionId: string,
  studentId: string,
  status: string,
) {
  const client = requireClient();
  const { data, error } = await client.rpc("manage_section_enrollment", {
    p_section_id: sectionId,
    p_student_id: studentId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  return data?.[0];
}

export async function createScheduleEvent(input: {
  sectionId?: string;
  ownerProfileId?: string;
  title: string;
  description: string;
  eventType: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  audienceRoles?: PlatformRole[];
}) {
  const client = requireClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error("Authentication is required.");
  const { data, error } = await client
    .from("schedule_events")
    .insert({
      section_id: input.sectionId || null,
      owner_profile_id: input.ownerProfileId || null,
      title: clean(input.title, "Event title", 180),
      description: input.description.trim().slice(0, 2000),
      event_type: input.eventType,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      location: input.location?.trim().slice(0, 160) || null,
      audience_roles: input.audienceRoles ?? [],
      created_by: userData.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateScheduleEvent(
  eventId: string,
  input: {
    sectionId?: string;
    ownerProfileId?: string;
    title: string;
    description: string;
    eventType: string;
    startsAt: string;
    endsAt: string;
    location?: string;
    audienceRoles?: PlatformRole[];
  },
) {
  if (new Date(input.endsAt) <= new Date(input.startsAt))
    throw new Error("The event must end after it starts.");
  const client = requireClient();
  const { error } = await client
    .from("schedule_events")
    .update({
      section_id: input.sectionId || null,
      owner_profile_id: input.ownerProfileId || null,
      title: clean(input.title, "Event title", 180),
      description: input.description.trim().slice(0, 2000),
      event_type: input.eventType,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      location: input.location?.trim().slice(0, 160) || null,
      audience_roles: input.audienceRoles ?? [],
    })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function deleteScheduleEvent(eventId: string) {
  const client = requireClient();
  const { error } = await client
    .from("schedule_events")
    .delete()
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function createLearningModule(input: {
  sectionId: string;
  title: string;
  description: string;
  position: number;
  publish: boolean;
}) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { error } = await client.from("learning_modules").insert({
    section_id: input.sectionId,
    title: clean(input.title, "Module title", 180),
    description: input.description.trim().slice(0, 4000),
    position: input.position,
    status: input.publish ? "published" : "draft",
    published_at: input.publish ? new Date().toISOString() : null,
    created_by: user.user?.id,
  });
  if (error) throw new Error(error.message);
}

export async function setLearningModuleStatus(
  moduleId: string,
  status: "draft" | "published" | "archived",
) {
  const client = requireClient();
  const { error } = await client
    .from("learning_modules")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .eq("id", moduleId);
  if (error) throw new Error(error.message);
}

export async function updateLearningModule(
  moduleId: string,
  input: { title: string; description: string },
) {
  const client = requireClient();
  const { error } = await client
    .from("learning_modules")
    .update({
      title: clean(input.title, "Module title", 180),
      description: input.description.trim().slice(0, 4000),
    })
    .eq("id", moduleId);
  if (error) throw new Error(error.message);
}

export async function deleteLearningModule(moduleId: string) {
  const client = requireClient();
  const { error } = await client
    .from("learning_modules")
    .delete()
    .eq("id", moduleId);
  if (error) throw new Error(error.message);
}

export async function uploadLmsFile(
  sectionId: string,
  folder: "materials" | "submissions",
  file: File,
) {
  const client = requireClient();
  if (file.size > 52_428_800)
    throw new Error("Files must be 50 MB or smaller.");
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  const path =
    folder === "submissions"
      ? `${sectionId}/submissions/${user.user.id}/${crypto.randomUUID()}-${safeName}`
      : `${sectionId}/materials/${crypto.randomUUID()}-${safeName}`;
  const { error } = await client.storage
    .from("lms-files")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

export async function createLearningMaterial(input: {
  moduleId: string;
  title: string;
  description: string;
  type: string;
  content: string;
  externalUrl?: string;
  storagePath?: string;
  position: number;
  minutes: number;
  required: boolean;
  publish: boolean;
}) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { data, error } = await client
    .from("learning_materials")
    .insert({
      module_id: input.moduleId,
      title: clean(input.title, "Material title", 180),
      description: input.description.trim().slice(0, 4000),
      material_type: input.type,
      content_markdown: input.content.trim().slice(0, 100000),
      external_url: input.externalUrl?.trim() || null,
      storage_path: input.storagePath || null,
      position: input.position,
      estimated_minutes: input.minutes,
      is_required: input.required,
      status: input.publish ? "published" : "draft",
      published_at: input.publish ? new Date().toISOString() : null,
      created_by: user.user?.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateLearningMaterial(
  materialId: string,
  input: {
    title: string;
    description: string;
    type: string;
    content: string;
    externalUrl?: string;
    storagePath?: string;
    minutes: number;
    required: boolean;
    publish?: boolean;
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("learning_materials")
    .update({
      title: clean(input.title, "Material title", 180),
      description: input.description.trim().slice(0, 4000),
      material_type: input.type,
      content_markdown: input.content.trim().slice(0, 100000),
      external_url: input.externalUrl?.trim() || null,
      ...(input.storagePath ? { storage_path: input.storagePath } : {}),
      estimated_minutes: input.minutes,
      is_required: input.required,
      ...(typeof input.publish === "boolean"
        ? {
            status: input.publish ? "published" : "draft",
            published_at: input.publish ? new Date().toISOString() : null,
          }
        : {}),
    })
    .eq("id", materialId);
  if (error) throw new Error(error.message);
}

export async function deleteLearningMaterial(materialId: string) {
  const client = requireClient();
  const { error } = await client
    .from("learning_materials")
    .delete()
    .eq("id", materialId);
  if (error) throw new Error(error.message);
}

export async function createLearningMaterialPage(input: {
  materialId: string;
  title: string;
  content: string;
  position: number;
}) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { error } = await client.from("learning_material_pages").insert({
    material_id: input.materialId,
    title: clean(input.title, "Page title", 180),
    content_html: input.content.trim().slice(0, 150000),
    position: input.position,
    created_by: user.user?.id,
  });
  if (error) throw new Error(error.message);
}

export async function updateLearningMaterialPage(
  pageId: string,
  input: { title: string; content: string; position?: number },
) {
  const client = requireClient();
  const { error } = await client
    .from("learning_material_pages")
    .update({
      title: clean(input.title, "Page title", 180),
      content_html: input.content.trim().slice(0, 150000),
      ...(input.position ? { position: input.position } : {}),
    })
    .eq("id", pageId);
  if (error) throw new Error(error.message);
}

export async function deleteLearningMaterialPage(pageId: string) {
  const client = requireClient();
  const { error } = await client
    .from("learning_material_pages")
    .delete()
    .eq("id", pageId);
  if (error) throw new Error(error.message);
}

export async function uploadLearningImage(sectionId: string, file: File) {
  const client = requireClient();
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
  if (file.size > 8_388_608) throw new Error("Images must be 8 MB or smaller.");
  const extension =
    file.name
      .split(".")
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8) || "img";
  const path = `${sectionId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from("learning-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return client.storage.from("learning-media").getPublicUrl(path).data
    .publicUrl;
}

export async function getLmsFileUrl(path: string) {
  const client = requireClient();
  const { data, error } = await client.storage
    .from("lms-files")
    .createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function markLearningProgress(
  materialId: string,
  completed: boolean,
) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const now = new Date().toISOString();
  const { error } = await client.from("learning_progress").upsert(
    {
      material_id: materialId,
      student_profile_id: user.user.id,
      status: completed ? "completed" : "in_progress",
      started_at: now,
      completed_at: completed ? now : null,
      last_viewed_at: now,
    },
    { onConflict: "material_id,student_profile_id" },
  );
  if (error) throw new Error(error.message);
}

export async function createCourseAssessment(input: {
  sectionId: string;
  title: string;
  instructions: string;
  type: "quiz" | "exam" | "assignment" | "project";
  dueAt?: string;
  maxScore: number;
  publish: boolean;
  questions?: Array<{
    prompt: string;
    points: number;
    options: string[];
    correctOption: number;
    explanation?: string;
  }>;
}) {
  const client = requireClient();
  const { error } = await client.rpc("create_lms_assessment", {
    p_section_id: input.sectionId,
    p_title: clean(input.title, "Assessment title", 180),
    p_instructions: input.instructions.trim().slice(0, 10000),
    p_type: input.type,
    p_due_at: (input.dueAt || null) as unknown as string,
    p_max_score: input.maxScore,
    p_publish: input.publish,
    p_questions: (input.questions ?? []) as unknown as Json,
  });
  if (error) throw new Error(error.message);
}

export async function updateCourseAssessment(
  assessmentId: string,
  input: {
    title: string;
    instructions: string;
    type: "quiz" | "exam" | "assignment" | "project";
    dueAt?: string;
    maxScore: number;
    publish: boolean;
    questions?: Array<{
      prompt: string;
      points: number;
      options: string[];
      correctOption: number;
      explanation?: string;
    }>;
  },
) {
  const client = requireClient();
  const { error } = await client.rpc("update_lms_assessment", {
    p_assessment_id: assessmentId,
    p_title: clean(input.title, "Assessment title", 180),
    p_instructions: input.instructions.trim().slice(0, 10000),
    p_type: input.type,
    p_due_at: (input.dueAt || null) as unknown as string,
    p_max_score: input.maxScore,
    p_publish: input.publish,
    p_questions: (input.questions ?? []) as unknown as Json,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCourseAssessment(assessmentId: string) {
  const client = requireClient();
  const { count, error: attemptError } = await client
    .from("assessment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (attemptError) throw new Error(attemptError.message);
  if (count)
    throw new Error(
      "This assessment has student attempts and cannot be deleted. Unpublish it instead.",
    );
  const { error } = await client
    .from("assessments")
    .delete()
    .eq("id", assessmentId);
  if (error) throw new Error(error.message);
}

export async function submitAssignment(input: {
  assessmentId: string;
  sectionId: string;
  text: string;
  file?: File;
}) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error("Authentication is required.");
  const storagePath = input.file
    ? await uploadLmsFile(input.sectionId, "submissions", input.file)
    : null;
  const { error } = await client.from("assignment_submissions").upsert(
    {
      assessment_id: input.assessmentId,
      student_profile_id: user.user.id,
      submission_text: input.text.trim().slice(0, 100000),
      storage_path: storagePath,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "assessment_id,student_profile_id" },
  );
  if (error) throw new Error(error.message);
}

export async function gradeAssignmentSubmission(
  id: string,
  score: number,
  feedback: string,
) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { error } = await client
    .from("assignment_submissions")
    .update({
      score,
      feedback: feedback.trim().slice(0, 10000),
      status: "graded",
      graded_by: user.user?.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createAttendanceSession(input: {
  sectionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { data, error } = await client
    .from("attendance_sessions")
    .insert({
      section_id: input.sectionId,
      title: clean(input.title, "Attendance title", 180),
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: "open",
      created_by: user.user?.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateAttendanceSession(
  sessionId: string,
  input: { title: string; startsAt: string; endsAt: string; status: string },
) {
  if (new Date(input.endsAt) <= new Date(input.startsAt))
    throw new Error("Attendance must end after it starts.");
  const client = requireClient();
  const { error } = await client
    .from("attendance_sessions")
    .update({
      title: clean(input.title, "Attendance title", 180),
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: input.status,
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function deleteAttendanceSession(sessionId: string) {
  const client = requireClient();
  const { error } = await client
    .from("attendance_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function saveAttendance(
  sessionId: string,
  records: Array<{ profileId: string; status: string; notes?: string }>,
) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { error } = await client.from("attendance_records").upsert(
    records.map((record) => ({
      session_id: sessionId,
      student_profile_id: record.profileId,
      status: record.status,
      notes: record.notes?.trim().slice(0, 2000) || "",
      marked_by: user.user?.id,
    })),
    { onConflict: "session_id,student_profile_id" },
  );
  if (error) throw new Error(error.message);
}

export async function createCourseAnnouncement(input: {
  sectionId: string;
  title: string;
  body: string;
  priority: string;
}) {
  const client = requireClient();
  const { data: user } = await client.auth.getUser();
  const { error } = await client.from("announcements").insert({
    section_id: input.sectionId,
    author_id: user.user?.id,
    title: clean(input.title, "Announcement title", 180),
    body: clean(input.body, "Announcement", 10000),
    priority: input.priority,
    published_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function updateCourseAnnouncement(
  announcementId: string,
  input: { title: string; body: string; priority: string },
) {
  const client = requireClient();
  const { error } = await client
    .from("announcements")
    .update({
      title: clean(input.title, "Announcement title", 180),
      body: clean(input.body, "Announcement", 10000),
      priority: input.priority,
    })
    .eq("id", announcementId);
  if (error) throw new Error(error.message);
}

export async function deleteCourseAnnouncement(announcementId: string) {
  const client = requireClient();
  const { error } = await client
    .from("announcements")
    .delete()
    .eq("id", announcementId);
  if (error) throw new Error(error.message);
}

export async function updateStudentRecord(
  studentId: string,
  input: {
    fullName: string;
    preferredName?: string;
    studentNumber: string;
    program: string;
    yearLevel: string;
    email?: string;
    phone?: string;
    advisorId?: string;
  },
) {
  const client = requireClient();
  const { error } = await client
    .from("students")
    .update({
      full_name: clean(input.fullName, "Full name", 120),
      preferred_name: input.preferredName?.trim().slice(0, 120) || null,
      student_number: clean(input.studentNumber, "Student number", 32),
      program: clean(input.program, "Program", 160),
      year_level: clean(input.yearLevel, "Year level", 40),
      email: input.email?.trim().toLowerCase().slice(0, 254) || null,
      phone: input.phone?.trim().slice(0, 40) || null,
      advisor_id: input.advisorId || null,
    })
    .eq("id", studentId);
  if (error) throw new Error(error.message);
}

export async function updatePlatformProfile(
  profileId: string,
  input: { fullName: string; department: string; jobTitle: string },
) {
  const client = requireClient();
  const { error } = await client
    .from("profiles")
    .update({
      full_name: clean(input.fullName, "Full name", 120),
      department: input.department.trim().slice(0, 160) || null,
      job_title: input.jobTitle.trim().slice(0, 160) || null,
    })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
}

export async function createStudentAccount(input: {
  email: string;
  password: string;
  fullName: string;
  preferredName?: string;
  studentNumber: string;
  program: string;
  yearLevel: string;
  phone?: string;
  advisorId?: string;
}) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke(
    "manage-student-account",
    { body: input },
  );
  if (error) {
    const response =
      "context" in error && error.context instanceof Response
        ? error.context
        : null;
    if (response) {
      const payload = (await response
        .clone()
        .json()
        .catch(() => null)) as { error?: unknown } | null;
      if (typeof payload?.error === "string" && payload.error.trim()) {
        throw new Error(payload.error);
      }
      const code = response.headers.get("sb-error-code");
      if (code)
        throw new Error(
          `Student account service failed (${code}). Please sign in again and retry.`,
        );
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data.student as {
    id: string;
    profile_id: string;
    student_number: string;
    full_name: string;
  };
}
