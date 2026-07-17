import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const credential = (email) => {
  const result = spawnSync(
    "/usr/bin/security",
    ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !result.stdout.trim())
    throw new Error(`Missing protected credential for ${email}`);
  return result.stdout.trim();
};
const make = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const faculty = make(),
  student = make();
const facultyEmail = "winsonbaring10+faculty@gmail.com",
  studentEmail = "winsonbaring10+student@gmail.com";
const { data: fa, error: fe } = await faculty.auth.signInWithPassword({
  email: facultyEmail,
  password: credential(facultyEmail),
});
const { data: sa, error: se } = await student.auth.signInWithPassword({
  email: studentEmail,
  password: credential(studentEmail),
});
if (
  fe ||
  se ||
  fa.user?.app_metadata.role !== "faculty" ||
  sa.user?.app_metadata.role !== "student"
)
  throw fe || se || new Error("LMS validation identities failed.");
const { data: enrollment, error: ee } = await student
  .from("section_enrollments")
  .select("section_id")
  .eq("student_profile_id", sa.user.id)
  .eq("status", "enrolled")
  .limit(1)
  .single();
if (ee) throw ee;
const marker = `LMS-${Date.now()}`;
let moduleId, assessmentId, quizId, sessionId, storagePath;
try {
  const moduleResult = await faculty
    .from("learning_modules")
    .insert({
      section_id: enrollment.section_id,
      title: marker,
      description: "Reversible production LMS verification",
      position: 999,
      status: "published",
      published_at: new Date().toISOString(),
      created_by: fa.user.id,
    })
    .select("id")
    .single();
  if (moduleResult.error) throw moduleResult.error;
  moduleId = moduleResult.data.id;
  const materialResult = await faculty
    .from("learning_materials")
    .insert({
      module_id: moduleId,
      title: `${marker} lesson`,
      material_type: "lesson",
      content_markdown: "Verified lesson",
      position: 1,
      status: "published",
      published_at: new Date().toISOString(),
      created_by: fa.user.id,
    })
    .select("id")
    .single();
  if (materialResult.error) throw materialResult.error;
  storagePath = `${enrollment.section_id}/materials/${marker}.txt`;
  const upload = await faculty.storage
    .from("lms-files")
    .upload(
      storagePath,
      new Blob(["Verified private learning file"], { type: "text/plain" }),
    );
  if (upload.error) throw upload.error;
  const fileMaterial = await faculty
    .from("learning_materials")
    .insert({
      module_id: moduleId,
      title: `${marker} file`,
      material_type: "file",
      storage_path: storagePath,
      position: 2,
      status: "published",
      published_at: new Date().toISOString(),
      created_by: fa.user.id,
    });
  if (fileMaterial.error) throw fileMaterial.error;
  const download = await student.storage
    .from("lms-files")
    .download(storagePath);
  if (
    download.error ||
    (await download.data.text()) !== "Verified private learning file"
  )
    throw download.error || new Error("Private material download failed.");
  const visible = await student
    .from("learning_materials")
    .select("id")
    .eq("id", materialResult.data.id)
    .single();
  if (visible.error) throw visible.error;
  const denied = await student
    .from("learning_modules")
    .insert({
      section_id: enrollment.section_id,
      title: "Denied module",
      position: 998,
    });
  if (!denied.error) throw new Error("Student created a teacher module.");
  const progress = await student
    .from("learning_progress")
    .insert({
      material_id: materialResult.data.id,
      student_profile_id: sa.user.id,
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  if (progress.error) throw progress.error;
  const assessmentResult = await faculty
    .from("assessments")
    .insert({
      section_id: enrollment.section_id,
      title: `${marker} assignment`,
      assessment_type: "assignment",
      status: "published",
      max_score: 10,
      created_by: fa.user.id,
    })
    .select("id")
    .single();
  if (assessmentResult.error) throw assessmentResult.error;
  assessmentId = assessmentResult.data.id;
  const submission = await student
    .from("assignment_submissions")
    .insert({
      assessment_id: assessmentId,
      student_profile_id: sa.user.id,
      submission_text: "Production validation submission",
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (submission.error) throw submission.error;
  const over = await faculty
    .from("assignment_submissions")
    .update({ score: 11, status: "graded" })
    .eq("id", submission.data.id);
  if (!over.error) throw new Error("Score ceiling was not enforced.");
  const grade = await faculty
    .from("assignment_submissions")
    .update({
      score: 9,
      feedback: "Verified feedback",
      status: "graded",
      graded_by: fa.user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", submission.data.id);
  if (grade.error) throw grade.error;
  const feedback = await student
    .from("assignment_submissions")
    .select("score,feedback")
    .eq("id", submission.data.id)
    .single();
  if (feedback.error || Number(feedback.data.score) !== 9)
    throw feedback.error || new Error("Student feedback visibility failed.");
  const quiz = await faculty.rpc("create_lms_assessment", {
    p_section_id: enrollment.section_id,
    p_title: `${marker} quiz`,
    p_instructions: "Choose the verified answer.",
    p_type: "quiz",
    p_due_at: null,
    p_max_score: 1,
    p_publish: true,
    p_questions: [
      {
        prompt: "Which answer is verified?",
        points: 2,
        options: ["Verified", "Incorrect"],
        correctOption: 1,
        explanation: "Verified is correct.",
      },
    ],
  });
  if (quiz.error) throw quiz.error;
  quizId = quiz.data;
  const question = await student
    .from("assessment_questions")
    .select("id")
    .eq("assessment_id", quizId)
    .single();
  if (question.error) throw question.error;
  const options = await student
    .from("assessment_options")
    .select("id,position")
    .eq("question_id", question.data.id)
    .order("position");
  if (options.error || options.data.length !== 2)
    throw options.error || new Error("Quiz choices are incomplete.");
  const keys = await student
    .from("assessment_answer_keys")
    .select("question_id")
    .eq("question_id", question.data.id);
  if (keys.error || keys.data.length)
    throw keys.error || new Error("Protected answer key leaked to student.");
  const result = await student.rpc("submit_assessment", {
    p_assessment_id: quizId,
    p_answers: [{ questionId: question.data.id, optionId: options.data[0].id }],
  });
  if (result.error || Number(result.data?.[0]?.score) !== 2)
    throw result.error || new Error("Built quiz did not score correctly.");
  const sessionResult = await faculty
    .from("attendance_sessions")
    .insert({
      section_id: enrollment.section_id,
      title: marker,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      status: "open",
      created_by: fa.user.id,
    })
    .select("id")
    .single();
  if (sessionResult.error) throw sessionResult.error;
  sessionId = sessionResult.data.id;
  const attendance = await faculty
    .from("attendance_records")
    .insert({
      session_id: sessionId,
      student_profile_id: sa.user.id,
      status: "present",
      marked_by: fa.user.id,
    });
  if (attendance.error) throw attendance.error;
  const ownAttendance = await student
    .from("attendance_records")
    .select("status")
    .eq("session_id", sessionId)
    .single();
  if (ownAttendance.error || ownAttendance.data.status !== "present")
    throw (
      ownAttendance.error || new Error("Student attendance visibility failed.")
    );
} finally {
  if (storagePath)
    await faculty.storage.from("lms-files").remove([storagePath]);
  if (sessionId)
    await faculty.from("attendance_sessions").delete().eq("id", sessionId);
  if (assessmentId)
    await faculty.from("assessments").delete().eq("id", assessmentId);
  if (quizId) await faculty.from("assessments").delete().eq("id", quizId);
  if (moduleId)
    await faculty.from("learning_modules").delete().eq("id", moduleId);
}
console.log(
  JSON.stringify({
    teacherContent: true,
    privateFiles: true,
    studentPublishedAccess: true,
    studentAuthoringDenied: true,
    progress: true,
    assignmentGrading: true,
    quizBuilder: true,
    answerKeysProtected: true,
    scoreCeiling: true,
    attendance: true,
    cleanup: true,
  }),
);
