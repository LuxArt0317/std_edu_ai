import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { database } from "./demo-fixtures.mjs";
const s = JSON.parse(await readFile("artifacts/tutorials/private-state.json")),
  ids = JSON.parse(await readFile("artifacts/tutorials/demo-ids.json"));
for (const k of ["reviewAssignment", "studentAssignment", "submission"])
  ids[k] ||= randomUUID();
await writeFile("artifacts/tutorials/demo-ids.json", JSON.stringify(ids), {
  mode: 0o600,
});
const q = await database();
try {
  await q`insert into assessments(id,section_id,title,instructions,assessment_type,status,due_at,max_score,created_by) values (${ids.reviewAssignment},${s.ids.section},'Source-check reflection','Explain the question, identify the original source, and describe one useful next action.','assignment','published',now()+interval '5 days',20,${s.users.faculty.id}) on conflict(id) do nothing`;
  await q`insert into assessments(id,section_id,title,instructions,assessment_type,status,due_at,max_score,created_by) values (${ids.studentAssignment},${s.ids.section},'Plan your next step','Write one specific action you will complete before the next workshop. Include the source you will check.','assignment','published',now()+interval '6 days',10,${s.users.faculty.id}) on conflict(id) do nothing`;
  await q`insert into assignment_submissions(id,assessment_id,student_profile_id,submission_text,status,submitted_at) values (${ids.submission},${ids.reviewAssignment},${s.users.student.id},'My question is how to verify an AI suggestion. I will check the original course material, compare the context, and write one small next step I can complete before the workshop.','submitted',now()) on conflict(id) do nothing`;
  console.log(JSON.stringify({ assignments: 2, preparedSubmission: 1 }));
} finally {
  await q.end();
}
