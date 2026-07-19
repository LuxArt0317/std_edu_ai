import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

import schoolHandler from "../../api/school-assistant.ts";
import { normalizeLessonHtml } from "../../src/platform/richLessonContent.ts";

function environment(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
Object.assign(process.env, environment(".env"), environment(".env.local"));

const email = "winsonbaring10@gmail.com";
const secret = spawnSync("/usr/bin/security", ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
if (secret.status !== 0 || !secret.stdout.trim()) throw new Error("Missing protected owner credential.");

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password: secret.stdout.trim() });
if (authError || !auth.session || !auth.user) throw authError || new Error("Owner sign-in failed.");

function capture() {
  const result = { status: 200, body: null };
  const response = { status(value) { result.status = value; return response; }, json(value) { result.body = value; }, setHeader() {} };
  return { result, response };
}

async function ask(message, context, agent) {
  const chat = capture();
  await schoolHandler({ method: "POST", body: { message, history: [], context, agent, mode: "agentic", attachments: [] }, headers: { authorization: `Bearer ${auth.session.access_token}`, "x-forwarded-for": "issue101-live" }, socket: {} }, chat.response);
  if (chat.result.status !== 200) throw new Error(`Nexus returned ${chat.result.status}: ${JSON.stringify(chat.result.body)}`);
  return chat.result.body;
}

let pageId = "";
let threadId = "";
let storagePath = "";
try {
  const materialQuery = await supabase.from("learning_materials").select("id,title,module_id,learning_modules!inner(id,title,section_id,course_sections!inner(id,section_code,courses!inner(code,title)))").limit(1).single();
  if (materialQuery.error) throw materialQuery.error;
  const material = materialQuery.data;
  const module = material.learning_modules;
  const section = module.course_sections;
  const course = section.courses;
  const existingPages = await supabase.from("learning_material_pages").select("position").eq("material_id", material.id).order("position", { ascending: false }).limit(1);
  if (existingPages.error) throw existingPages.error;
  const position = (existingPages.data[0]?.position ?? 0) + 1;
  const goal = `Add a learner-friendly page ${position} to ${material.title}. Use these authorized exact media URLs: image https://upload.wikimedia.org/wikipedia/commons/6/6f/Computer_system_bus.svg and video https://www.youtube-nocookie.com/embed/O5nskjZ_GoI. Include an explicitly labeled instructor perspective and a reflection prompt. Use semantic HTML, never Markdown.`;
  const context = { view: "courses", courses: [{ sectionId: section.id, code: course.code, title: course.title }], modules: [{ id: module.id, sectionId: section.id, title: module.title }], materials: [{ id: material.id, moduleId: module.id, title: material.title }], materialPages: [] };
  const run = { runId: `issue101-rich-${Date.now()}`, goal, step: 0, maxSteps: 32, observations: [] };
  const answer = await ask(goal, context, run);
  const action = answer.proposedAction;
  if (action?.type !== "create_material_page" || action.materialId !== material.id) throw new Error(`Nexus did not target the exact material (${action?.type ?? "none"}).`);
  const html = normalizeLessonHtml(action.content);
  if (/(^|>)\s*#{2,3}\s|(^|>)\s*\d+[.)]\s/m.test(html)) throw new Error("Lesson content still contains literal Markdown blocks.");
  if (!/<(?:h2|h3|p|ul|ol|blockquote)\b/i.test(html)) throw new Error("Lesson content is not semantic HTML.");
  if (!/Instructor perspective/i.test(html) || !/reflect/i.test(html)) throw new Error("Human instructional framing is missing.");
  if (!/<img\b/i.test(html) || !/data-lesson-video/i.test(html)) throw new Error("Authorized image/video embeds are missing.");

  const page = await supabase.from("learning_material_pages").insert({ material_id: material.id, title: action.title, content_html: html, position, created_by: auth.user.id }).select("id,content_html").single();
  if (page.error) throw page.error;
  pageId = page.data.id;
  if (/##|###/.test(page.data.content_html)) throw new Error("Persisted page contains Markdown headings.");

  const stale = await ask(goal, context, { ...run, step: 1, observations: [{ step: 1, actionType: "create_material_page", outcome: "error", summary: "The proposed material ID 00000000-0000-4000-8000-000000000000 is stale. Re-resolve by module and title and continue without repeating successful pages." }] });
  if (stale.proposedAction?.type !== "create_material_page" || stale.proposedAction.materialId !== material.id) throw new Error("Nexus did not recover from the stale material ID using refreshed context.");

  const suffix = Date.now().toString(36);
  const thread = await supabase.from("chat_threads").insert({ owner_id: auth.user.id, title: `Issue 101 ${suffix}` }).select("id").single();
  if (thread.error) throw thread.error;
  threadId = thread.data.id;
  storagePath = `${auth.user.id}/${threadId}/${suffix}.txt`;
  const payload = new TextEncoder().encode("Issue 101 private attachment cleanup");
  const upload = await supabase.storage.from("nexus-attachments").upload(storagePath, payload, { contentType: "text/plain" });
  if (upload.error) throw upload.error;
  const attachment = { name: "proof.txt", mimeType: "text/plain", size: payload.byteLength, storagePath };
  const message = await supabase.from("chat_messages").insert({ thread_id: threadId, author_role: "user", content: "Proof", attachments: [attachment] });
  if (message.error) throw message.error;
  const renamed = await supabase.from("chat_threads").update({ title: `Renamed ${suffix}` }).eq("id", threadId).select("title").single();
  if (renamed.error || renamed.data.title !== `Renamed ${suffix}`) throw renamed.error || new Error("Thread rename did not persist.");
  const storageCleanup = await supabase.storage.from("nexus-attachments").remove([storagePath]);
  if (storageCleanup.error) throw storageCleanup.error;
  storagePath = "";
  const deleted = await supabase.from("chat_threads").delete().eq("id", threadId);
  if (deleted.error) throw deleted.error;
  const deletedThread = threadId;
  threadId = "";
  const cascade = await supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", deletedThread);
  if (cascade.error || cascade.count !== 0) throw cascade.error || new Error("Thread messages did not cascade on deletion.");

  console.log(JSON.stringify({ semanticLessonHtml: true, humanInstructionalVoice: true, authorizedInlineMedia: true, staleTargetRecovered: true, persistedPageVerified: true, conversationRename: true, conversationDeleteCascade: true, privateAttachmentCleanup: true }));
} finally {
  if (pageId) await supabase.from("learning_material_pages").delete().eq("id", pageId);
  if (storagePath) await supabase.storage.from("nexus-attachments").remove([storagePath]);
  if (threadId) await supabase.from("chat_threads").delete().eq("id", threadId);
  await supabase.auth.signOut();
}
