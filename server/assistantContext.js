// All account facts are loaded with the caller's JWT. Never use service-role
// credentials or browser-supplied records to construct the model's context.
export function assistantDatabaseConfiguration() {
  return {
    url:
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL,
    key:
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY,
  };
}
export async function callerRest(path, authorization, init = {}) {
  const { url, key } = assistantDatabaseConfiguration();
  if (!url || !key) throw new Error("Account data is not configured.");
  const result = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: authorization || `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal || AbortSignal.timeout(10_000),
  });
  if (!result.ok)
    throw new Error("Authorized account data could not be loaded.");
  return result.json();
}
const catalog = {
  departments: ["departments", "id,code,name,description"],
  programs: [
    "academic_programs",
    "id,department_id,code,name,level,duration_years,description,status",
  ],
  terms: ["academic_terms", "id,code,name,starts_on,ends_on,status"],
  catalogCourses: [
    "courses",
    "id,department_id,program_id,code,title,description,credits,status",
  ],
  sections: [
    "course_sections",
    "id,course_id,term_id,section_code,faculty_id,modality,room,capacity,status",
  ],
  enrollments: [
    "section_enrollments",
    "id,section_id,student_profile_id,student_id,status",
  ],
  students: [
    "students",
    "id,profile_id,student_number,full_name,program_id,year_level",
  ],
  profiles: [
    "profiles",
    "id,full_name,role,department_id,program_id,account_status",
  ],
  modules: [
    "learning_modules",
    "id,section_id,title,description,status,unlocks_at",
  ],
  materials: [
    "learning_materials",
    "id,module_id,title,description,content_markdown,external_url,status",
  ],
  materialPages: [
    "learning_material_pages",
    "id,material_id,title,content_html,position",
  ],
  assessments: [
    "assessments",
    "id,section_id,title,instructions,assessment_type,status,opens_at,due_at,max_score",
  ],
  schedule: [
    "schedule_events",
    "id,section_id,owner_profile_id,title,description,event_type,starts_at,ends_at,location",
  ],
  announcements: [
    "announcements",
    "id,section_id,title,body,priority,published_at,expires_at",
  ],
  gradeItems: ["grade_items", "id,section_id,title,max_score,due_at"],
  grades: [
    "grades",
    "id,grade_item_id,student_profile_id,student_id,score,letter_grade,feedback,status,published_at",
  ],
  attendanceSessions: [
    "attendance_sessions",
    "id,section_id,title,starts_at,ends_at,status",
  ],
  attendanceRecords: [
    "attendance_records",
    "id,session_id,student_profile_id,status,marked_at",
  ],
  attendanceCorrections: [
    "attendance_correction_requests",
    "id,attendance_record_id,student_profile_id,requested_status,reason,status",
  ],
  curricula: ["curriculum_plans", "id,program_id,effective_year,status"],
  communications: [
    "communication_requests",
    "id,sender_id,recipient_id,subject,body,status,created_at",
  ],
  tasks: [
    "crm_tasks",
    "id,assigned_to,student_id,case_id,title,priority,due_at,completed_at",
  ],
  admissions: [
    "admission_leads",
    "id,full_name,program_interest,stage,owner_id,next_step",
  ],
  campaigns: ["campaigns", "id,name,channel,status,scheduled_for"],
  initiatives: [
    "institutional_initiatives",
    "id,initiative_type,title,description,scope,priority,status,owner_id,due_at",
  ],
  sectionAssignments: [
    "profile_section_assignments",
    "id,profile_id,section_id,responsibility",
  ],
  notifications: [
    "notifications",
    "id,recipient_id,title,body,kind,action_url,read_at,created_at",
  ],
  knowledge: [
    "knowledge_articles",
    "id,title,category,summary,content,source_url,verified_at,review_due_at",
  ],
  supportRequests: [
    "cases",
    "id,student_id,title,category,description,priority,status",
  ],
  progress: [
    "learning_progress",
    "id,material_id,student_profile_id,status,completed_at",
  ],
};
const camel = (key) =>
  key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
function normalize(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camel(key),
      typeof value === "string" ? value.slice(0, 4000) : value,
    ]),
  );
}
export function schoolCalendarDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export async function loadAssistantContext(
  user,
  authorization,
  view = "",
  question = "",
) {
  const self = await callerRest(
    `profiles?select=id,full_name,role,account_status,department_id,program_id&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    authorization,
  );
  if (
    !Array.isArray(self) ||
    self[0]?.id !== user.id ||
    self[0].account_status !== "active" ||
    self[0].role !== user.role
  ) {
    const error = new Error(
      "An active account with a matching trusted role is required.",
    );
    error.name = "AssistantAccountAccessError";
    throw error;
  }
  const student = user.role === "student";
  const now = new Date().toISOString();
  const today = schoolCalendarDate(new Date(now));
  const context = {
    view: String(view).slice(0, 100),
    identity: normalize(self[0]),
    asOf: now,
    timezone: "Asia/Taipei",
    today,
    unavailable: [],
    truncated: [],
  };
  await Promise.all(
    Object.entries(catalog).map(async ([key, [table, columns]]) => {
      let filter = "";
      if (student && ["profiles", "students"].includes(key))
        filter += `&${key === "profiles" ? "id" : "profile_id"}=eq.${encodeURIComponent(user.id)}`;
      if (
        student &&
        ["attendanceRecords", "attendanceCorrections", "progress"].includes(key)
      )
        filter += `&student_profile_id=eq.${encodeURIComponent(user.id)}`;
      if (key === "sectionAssignments")
        filter += `&profile_id=eq.${encodeURIComponent(user.id)}`;
      if (key === "notifications")
        filter += `&recipient_id=eq.${encodeURIComponent(user.id)}`;
      if (key === "knowledge")
        filter += `&status=eq.verified&verified_at=not.is.null&or=(review_due_at.is.null,review_due_at.gt.${now})`;
      if (key === "announcements" && student)
        filter += `&published_at=lte.${now}&or=(expires_at.is.null,expires_at.gt.${now})`;
      if (
        student &&
        ["modules", "materials", "assessments", "grades"].includes(key)
      )
        filter += `&status=eq.published`;
      try {
        const rows = await callerRest(
          `${table}?select=${columns}${filter}&limit=101&order=${key === "announcements" ? "published_at.desc" : key === "schedule" ? "starts_at.asc" : key === "notifications" ? "created_at.desc" : "id.asc"}`,
          authorization,
        );
        if (!Array.isArray(rows)) throw new Error("Invalid account data.");
        if (rows.length > 100) context.truncated.push(key);
        context[key] = rows.slice(0, 100).map(normalize);
      } catch {
        context.unavailable.push(key);
        context[key] = [];
      }
    }),
  );
  if (student) {
    const mine = new Set(context.students.map((row) => row.id));
    for (const key of ["enrollments", "grades"])
      context[key] = context[key].filter(
        (row) => row.studentProfileId === user.id || mine.has(row.studentId),
      );
  }
  // Resolve linked subjects/terms even when the general catalog was bounded.
  for (const [key, table, field] of [
    ["catalogCourses", "courses", "courseId"],
    ["terms", "academic_terms", "termId"],
  ]) {
    const existing = new Set(context[key].map((row) => row.id));
    const missing = [
      ...new Set(
        context.sections
          .map((row) => row[field])
          .filter((id) => id && !existing.has(id)),
      ),
    ];
    if (!missing.length) continue;
    try {
      const rows = await callerRest(
        `${table}?select=${catalog[key][1]}&id=in.(${missing.map(encodeURIComponent).join(",")})&limit=100`,
        authorization,
      );
      if (!Array.isArray(rows)) throw new Error("Invalid linked catalog");
      context[key].push(...rows.map(normalize));
    } catch {
      context.unavailable.push(`${key}Links`);
    }
  }
  context.courses = context.sections.map((section) => {
    const course = context.catalogCourses.find(
      (row) => row.id === section.courseId,
    );
    return {
      ...section,
      sectionId: section.id,
      code: course?.code || "",
      title: course?.title || "",
      description: course?.description || "",
      term: context.terms.find((row) => row.id === section.termId)?.name || "",
    };
  });
  const mySections = new Set(
    student
      ? context.enrollments
          .filter((row) => row.status === "enrolled")
          .map((row) => row.sectionId)
      : [
          ...context.sections
            .filter((row) => row.facultyId === user.id)
            .map((row) => row.id),
          ...context.sectionAssignments.map((row) => row.sectionId),
        ],
  );
  context.myCourses = context.courses.filter((row) =>
    mySections.has(row.sectionId),
  );
  context.myCurrentCourses = context.myCourses.filter((row) => {
    const term = context.terms.find((item) => item.id === row.termId);
    return (
      row.status === "active" &&
      term?.status === "active" &&
      (!term.startsOn || term.startsOn <= today) &&
      (!term.endsOn || term.endsOn >= today)
    );
  });
  context.mySchedule = context.schedule.filter(
    (row) => row.ownerProfileId === user.id || mySections.has(row.sectionId),
  );
  context.myTasks = context.tasks.filter((row) => row.assignedTo === user.id);
  context.myAnnouncements = context.announcements.filter(
    (row) =>
      (!row.sectionId || mySections.has(row.sectionId)) &&
      (!row.publishedAt || row.publishedAt <= now) &&
      (!row.expiresAt || row.expiresAt > now),
  );
  // Keep unrelated free-text case/message/grade details out of model requests.
  const detailTopics = {
    supportRequests: /support|case|request|ticket|intervention|支援|案件|求助/i,
    communications: /message|email|communication|reply|contact|訊息|信件|聯絡/i,
    grades: /grade|score|result|feedback|成績|分數|評語/i,
    materialPages:
      /lesson|material|module|teach|learn|course|subject|課程|教材|教學|學習/i,
    materials:
      /lesson|material|module|teach|learn|course|subject|課程|教材|教學|學習/i,
  };
  context.detailsOmitted = [];
  if (question)
    for (const [key, topic] of Object.entries(detailTopics)) {
      if (topic.test(question)) continue;
      for (const row of context[key])
        for (const field of [
          "body",
          "description",
          "feedback",
          "contentHtml",
          "contentMarkdown",
        ])
          delete row[field];
      context.detailsOmitted.push(key);
    }
  // Aliases preserve the existing action contract without trusting UI records.
  for (const row of context.profiles) row.name = row.fullName;
  for (const row of context.students) row.name = row.fullName;
  for (const row of context.attendanceRecords)
    row.studentId = row.studentProfileId;
  for (const row of context.initiatives) row.operation = row.initiativeType;
  return context;
}
