from pathlib import Path
from datetime import date

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "STU_Nexus_Comprehensive_Platform_Manual.docx"

NAVY = "113B38"
TEAL = "148F82"
MINT = "DDF3EE"
PALE = "F2F7F6"
GOLD = "C6922A"
CORAL = "B55245"
INK = "1C2B2A"
MUTED = "5D6D6B"
WHITE = "FFFFFF"
LINE = "C9D8D5"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_table_borders(table, color=LINE, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)
        borders.append(element)


def set_table_geometry(table, widths):
    total = sum(widths)
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    tbl_w.set(qn("w:w"), str(total))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = OxmlElement("w:tblInd")
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")
    tbl_pr.append(tbl_ind)
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            tc_w = cell._tc.get_or_add_tcPr().first_child_found_in("w:tcW")
            tc_w.set(qn("w:w"), str(widths[index]))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_run(run, size=None, bold=None, color=INK, italic=None, font="Aptos"):
    run.font.name = font
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), font)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), font)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def add_field(paragraph, instruction):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "Update field in Microsoft Word"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, text, end])


def add_page_number(paragraph):
    paragraph.add_run("Page ")
    add_field(paragraph, "PAGE")
    paragraph.add_run(" of ")
    add_field(paragraph, "NUMPAGES")


def configure_document(doc):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.78)
    section.bottom_margin = Inches(0.72)
    section.left_margin = Inches(0.82)
    section.right_margin = Inches(0.82)
    section.header_distance = Inches(0.35)
    section.footer_distance = Inches(0.35)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.18

    heading_tokens = {
        "Heading 1": (18, NAVY, 16, 7),
        "Heading 2": (14, TEAL, 12, 5),
        "Heading 3": (11.5, NAVY, 8, 3),
    }
    for name, (size, color, before, after) in heading_tokens.items():
        style = styles[name]
        style.font.name = "Aptos Display"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Aptos Display")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos Display")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for name in ("List Bullet", "List Number"):
        style = styles[name]
        style.font.name = "Aptos"
        style.font.size = Pt(10.5)
        style.paragraph_format.left_indent = Inches(0.38)
        style.paragraph_format.first_line_indent = Inches(-0.19)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.18

    if "Callout" not in styles:
        callout = styles.add_style("Callout", WD_STYLE_TYPE.PARAGRAPH)
        callout.base_style = normal
        callout.font.name = "Aptos"
        callout.font.size = Pt(10.5)
        callout.font.color.rgb = RGBColor.from_string(NAVY)
        callout.paragraph_format.left_indent = Inches(0.18)
        callout.paragraph_format.right_indent = Inches(0.18)
        callout.paragraph_format.space_before = Pt(6)
        callout.paragraph_format.space_after = Pt(8)

    for sec in doc.sections:
        header = sec.header
        p = header.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run("STU NEXUS  /  PLATFORM & CRM MANUAL")
        set_run(r, size=8, bold=True, color=TEAL)
        footer = sec.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        add_page_number(fp)
        for run in fp.runs:
            set_run(run, size=8, color=MUTED)


def shade_paragraph(paragraph, fill, border=None):
    p_pr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    p_pr.append(shd)
    if border:
        p_bdr = OxmlElement("w:pBdr")
        left = OxmlElement("w:left")
        left.set(qn("w:val"), "single")
        left.set(qn("w:sz"), "18")
        left.set(qn("w:color"), border)
        p_bdr.append(left)
        p_pr.append(p_bdr)


def add_callout(doc, label, text, tone="teal"):
    p = doc.add_paragraph(style="Callout")
    shade_paragraph(p, MINT if tone == "teal" else "FFF3D6", TEAL if tone == "teal" else GOLD)
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.left_indent = Inches(0.16)
    p.paragraph_format.right_indent = Inches(0.1)
    p.paragraph_format.keep_together = True
    label_run = p.add_run(f"{label.upper()}  ")
    set_run(label_run, size=9, bold=True, color=TEAL if tone == "teal" else GOLD)
    body_run = p.add_run(text)
    set_run(body_run, size=10.3, color=NAVY)


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        if isinstance(item, tuple):
            lead, body = item
            r = p.add_run(f"{lead}: ")
            set_run(r, bold=True, color=NAVY)
            set_run(p.add_run(body), color=INK)
        else:
            set_run(p.add_run(item), color=INK)


def next_numbering_id(doc):
    numbering = doc.part.numbering_part.element
    number_ids = [int(item.get(qn("w:numId"))) for item in numbering.findall(qn("w:num"))]
    new_id = max(number_ids, default=0) + 1
    style_num_id = doc.styles["List Number"]._element.pPr.numPr.numId.val
    source_num = next(item for item in numbering.findall(qn("w:num")) if int(item.get(qn("w:numId"))) == int(style_num_id))
    abstract_id = source_num.find(qn("w:abstractNumId")).get(qn("w:val"))
    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(new_id))
    abstract = OxmlElement("w:abstractNumId")
    abstract.set(qn("w:val"), abstract_id)
    num.append(abstract)
    override = OxmlElement("w:lvlOverride")
    override.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:startOverride")
    start.set(qn("w:val"), "1")
    override.append(start)
    num.append(override)
    numbering.append(num)
    return new_id


def add_steps(doc, steps):
    num_id = next_numbering_id(doc)
    for step in steps:
        p = doc.add_paragraph(style="List Number")
        num_pr = p._p.get_or_add_pPr().get_or_add_numPr()
        num_pr.get_or_add_ilvl().val = 0
        num_pr.get_or_add_numId().val = num_id
        if isinstance(step, tuple):
            lead, body = step
            set_run(p.add_run(f"{lead}. "), bold=True, color=NAVY)
            set_run(p.add_run(body), color=INK)
        else:
            set_run(p.add_run(step), color=INK)


def add_table(doc, headers, rows, widths, font_size=9.2):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.style = "Table Grid"
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    for index, header in enumerate(headers):
        set_cell_shading(hdr.cells[index], NAVY)
        p = hdr.cells[index].paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        set_run(p.add_run(header), size=9, bold=True, color=WHITE)
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for index, value in enumerate(values):
            if row_index % 2:
                set_cell_shading(cells[index], PALE)
            p = cells[index].paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.08
            set_run(p.add_run(str(value)), size=font_size, color=INK)
    set_table_geometry(table, widths)
    set_table_borders(table)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_section_break(doc):
    doc.add_page_break()


def add_cover(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(36)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("樹  SHU-TE UNIVERSITY")
    set_run(r, size=12, bold=True, color=TEAL, font="Aptos Display")

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(70)
    p.paragraph_format.space_after = Pt(8)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("STU NEXUS")
    set_run(r, size=32, bold=True, color=NAVY, font="Aptos Display")

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(14)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Comprehensive Web Platform & CRM Manual")
    set_run(r, size=20, bold=True, color=TEAL, font="Aptos Display")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.left_indent = Inches(0.55)
    p.paragraph_format.right_indent = Inches(0.55)
    r = p.add_run("Functional reference · Role handbook · User guide · Technical and operational documentation")
    set_run(r, size=12, color=MUTED)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(48)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shade_paragraph(p, MINT)
    set_run(p.add_run("PUBLIC WEBSITE  •  SCHOOL OPERATING SYSTEM  •  STUDENT CRM  •  NEXUS AI"), size=10, bold=True, color=NAVY)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(74)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run(p.add_run("Production-shaped proof of concept"), size=10, bold=True, color=CORAL)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run(p.add_run(f"Version 1.0  |  {date.today().strftime('%B %d, %Y')}"), size=10, color=MUTED)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run(p.add_run("Deployment: https://www.stu.best  |  Portal: https://www.stu.best/crm"), size=9, color=MUTED)
    doc.add_page_break()


def add_front_matter(doc):
    doc.add_heading("Document purpose and audience", level=1)
    doc.add_paragraph(
        "This manual explains what the STU Edu AI platform is, why it exists, how each part works, who is responsible for each type of work, and how to operate it safely. It combines functional documentation for university stakeholders, practical instructions for end users, role-specific guidance, and technical reference material for developers and operators."
    )
    add_callout(doc, "Current state", "The platform is a production-connected proof of concept using safe demonstration records. Authentication, authorization, database operations, role-aware interfaces, transactional quiz scoring, reviewed grade workflows, persistent chat, and selected CRM mutations are live. It is not yet approved as the university's official system of record for real student data.")
    add_table(doc, ["Audience", "Use this manual to"], [
        ("University executives", "Understand platform purpose, governance, oversight, risk, and rollout decisions."),
        ("Owners and administrators", "Govern identities, roles, academic structure, data access, and operational quality."),
        ("Faculty and staff", "Complete teaching, advising, admissions, support, finance, library, and CRM workflows."),
        ("Students", "Navigate learning content, assessments, grades, schedules, and the role-aware assistant."),
        ("Developers and operators", "Run, test, deploy, diagnose, secure, and extend the React/Supabase/OpenAI system."),
    ], [2300, 7060])

    doc.add_heading("Document control", level=2)
    add_table(doc, ["Field", "Value"], [
        ("Document", "STU Nexus Comprehensive Web Platform & CRM Manual"),
        ("Version", "1.0"),
        ("Status", "Production-shaped POC operating reference"),
        ("Product scope", "Public STU website reconstruction and authenticated STU Nexus school platform"),
        ("Primary source", "Implemented repository, database migrations, production tests, and operator documentation"),
        ("Confidentiality", "Internal operational reference; contains no passwords or secret keys"),
    ], [2200, 7160])

    doc.add_heading("Table of contents", level=1)
    contents = [
        "1. Executive overview",
        "2. Public university website",
        "3. STU Nexus school operating system",
        "4. Student CRM and relationship operations",
        "5. Role hierarchy and responsibility model",
        "6. Role-to-workspace matrix",
        "7. End-user how-to guide",
        "8. Nexus AI, privacy, and human control",
        "9. Security and data governance",
        "10. Technical architecture",
        "11. Setup, deployment, and operations",
        "12. Troubleshooting and support",
        "13. Governance and production-readiness roadmap",
        "Appendices: quick reference, glossary, and source basis",
    ]
    add_bullets(doc, contents)
    add_callout(doc, "Navigation", "The document uses real Word heading styles, so Microsoft Word's Navigation Pane provides direct section access.", tone="gold")
    doc.add_page_break()


def add_overview(doc):
    doc.add_heading("1. Executive overview", level=1)
    doc.add_paragraph(
        "STU Edu AI is a connected two-surface university experience. The public website helps prospective students, families, visitors, current students, and partners discover Shu-Te University and find institutional information. STU Nexus, available after authentication at /crm, is the school operating platform that supports academic delivery, learning, assessment, grade review, schedules, institutional roles, student success, admissions, service work, knowledge, analytics, and AI-assisted workflows."
    )
    add_callout(doc, "One-sentence purpose", "Give the whole school one permission-aware place to discover, learn, teach, assess, schedule, administer, support students, and use human-reviewed AI assistance.")
    doc.add_heading("1.1 Problems the platform addresses", level=2)
    add_bullets(doc, [
        ("Fragmented information", "Policies, services, academic content, schedules, and student-support data are commonly spread across separate pages and systems."),
        ("Navigation friction", "Users spend time learning organizational structures instead of starting their task directly."),
        ("Repeated questions", "Administrative offices answer recurring admissions, enrollment, policy, graduation, and campus-service questions."),
        ("Disconnected student support", "Staff need a complete view of academic, engagement, service, and case context before they can intervene thoughtfully."),
        ("Manual academic processing", "Learning content, assessments, grades, rosters, and calendars become harder to govern when ownership and visibility are unclear."),
        ("Unsafe AI adoption", "Unbounded chatbots can expose data or influence high-impact decisions without evidence or human review."),
    ])
    doc.add_heading("1.2 Product principles", level=2)
    add_table(doc, ["Principle", "Meaning in STU Nexus"], [
        ("One school, one platform", "Academic, operational, CRM, and knowledge workflows share one identity and authorization model."),
        ("Role clarity", "The interface shows the work relevant to the signed-in role; database policy enforces the same boundary."),
        ("Human authority", "AI explains, summarizes, extracts, and recommends; people assign roles, publish grades, approve records, and communicate decisions."),
        ("Evidence before action", "Risk indicators, answer explanations, citations, confidence values, warnings, and audit history make important actions reviewable."),
        ("Resilient delivery", "Boot recovery, bounded startup, local-session reset, build asset checks, and live diagnostics prevent silent blank-screen failure."),
        ("Safe evolution", "Database changes are reviewed migrations, credentials remain server-side or protected locally, and production acceptance tests verify role boundaries."),
    ], [2350, 7010])

    doc.add_heading("1.3 Platform at a glance", level=2)
    add_table(doc, ["Surface", "Primary users", "Purpose", "System behavior"], [
        ("Public website (/)", "Visitors, applicants, students, families, partners", "Institutional discovery, navigation, admissions, news, links, campus information, public AI assistance", "Public, responsive, content-oriented; no login required"),
        ("STU Nexus (/crm)", "Owner, leaders, faculty, staff, students", "Academic operations, learning, assessment, grades, schedules, role governance, CRM, persistent AI", "Authenticated; Supabase RLS filters every user’s live data"),
        ("Vercel API", "Authenticated portal sessions", "School assistant, CRM copilot, AI grade-sheet extraction", "Validates bearer token, derives trusted role, rate-limits, sends bounded context to OpenAI"),
        ("Supabase", "Platform and trusted server workflows", "Auth, Postgres data, RLS, transactional functions, chat history, audit evidence", "System of record and authorization boundary"),
    ], [1700, 1800, 2800, 3060], font_size=8.6)


def add_public_website(doc):
    add_section_break(doc)
    doc.add_heading("2. Public university website", level=1)
    doc.add_paragraph(
        "The public experience is a responsive, section-complete reconstruction of the Shu-Te University homepage. It preserves the recognizable institutional visual language and official destinations while adding an independent AI assistant that does not disrupt the copied site composition."
    )
    doc.add_heading("2.1 Purpose", level=2)
    add_bullets(doc, [
        "Present a credible, modern digital front door for the university.",
        "Help users begin common tasks without understanding the university's internal organizational structure.",
        "Provide audience-specific entrances for prospective students, current students, faculty/staff, and visitors.",
        "Surface admissions, news, institutional performance, campus stories, public information, and frequently used systems.",
        "Offer natural-language campus and website assistance through a non-disruptive floating drawer.",
    ])
    doc.add_heading("2.2 Main homepage sections", level=2)
    add_table(doc, ["Section", "Function", "User value"], [
        ("Sticky header and navigation", "Keeps the STU identity and primary destinations available over the hero area.", "Fast movement to high-priority information."),
        ("Hero carousel", "Communicates current institutional positioning through large visual stories and calls to action.", "Immediate orientation and campaign visibility."),
        ("Audience entrances", "Groups destinations by visitor type rather than only by office structure.", "Reduces navigation depth and uncertainty."),
        ("See STU / performance", "Shows institutional stories, achievements, outcomes, and distinguishing strengths.", "Builds trust and communicates value."),
        ("Admissions", "Presents image-based pathways into programs and application information.", "Supports discovery and conversion."),
        ("Latest news", "Surfaces current announcements and institutional activity.", "Keeps public information timely."),
        ("Hot links", "Provides direct entry to common systems and services.", "Shortens high-frequency journeys."),
        ("Public information/footer", "Provides contact, social, legal, and institutional references.", "Completes navigation and trust requirements."),
        ("Campus assistant", "Answers campus, policy, admissions, service, and navigation questions.", "Makes information retrieval conversational."),
    ], [1900, 3550, 3910], font_size=8.7)
    doc.add_heading("2.3 How to use the public assistant", level=2)
    add_steps(doc, [
        ("Open the assistant", "Select the floating AI control without leaving the current page."),
        ("Ask one clear question", "Describe the task, such as where to find admissions requirements, an office, a policy, or a campus service."),
        ("Review the answer", "Use cited or linked institutional information where available; do not treat conversational guidance as an official exception to policy."),
        ("Continue to the source", "Open the recommended official destination to complete applications, payments, registrations, or formal requests."),
        ("Escalate when needed", "Contact the responsible university office when a decision, individual record, deadline exception, or confidential matter is involved."),
    ])
    add_callout(doc, "Boundary", "The public website and its assistant support discovery and information access. Authenticated academic records, grades, student cases, role administration, and staff workflows belong in STU Nexus.", tone="gold")


def add_school_os(doc):
    add_section_break(doc)
    doc.add_heading("3. STU Nexus school operating system", level=1)
    doc.add_paragraph(
        "STU Nexus converts the public website's information-support vision into an authenticated operating environment. Every user has one verified identity and one trusted canonical role. The visible workspace changes by role, while Supabase row-level security and trusted functions enforce what the user may actually read or change."
    )
    doc.add_heading("3.1 Shared navigation and interface", level=2)
    add_table(doc, ["Workspace", "What it does", "Typical users"], [
        ("My Day", "Shows role-relevant courses, assessments, upcoming events, announcements, and next actions.", "All roles"),
        ("Academic Office", "Organizes departments, programs, terms, courses, sections, faculty, delivery, and rosters.", "Owner and leadership"),
        ("Teaching", "Shows assigned sections, class composition, topics, assessments, and content sequence.", "Faculty and authorized leadership"),
        ("Learning", "Presents course cards, sequenced topics, summaries, content, study time, and publication state.", "Students, faculty, leaders, specialist staff"),
        ("Assessments", "Delivers student quizzes and authorized review of assessment structure and attempts.", "Students, faculty, leaders"),
        ("Grades", "Shows students their own published grades and gives teachers a reviewed gradebook/scan workflow.", "Students, faculty, leaders"),
        ("Schedule", "Combines classes, exams, deadlines, meetings, and audience-relevant events.", "All roles"),
        ("People & Roles", "Displays the hierarchy and performs audited non-owner role assignments.", "Protected owner and authorized leaders"),
        ("Student CRM", "Opens student-success, admissions, case, task, campaign, knowledge, and analytics operations.", "All non-student roles with operational scope"),
        ("Nexus AI", "Provides persistent, role-aware assistance grounded in visible school context.", "All authenticated roles"),
    ], [1500, 4900, 2960], font_size=8.5)

    doc.add_heading("3.2 Academic data model", level=2)
    add_bullets(doc, [
        ("Organization", "Departments own programs; programs define credential pathways."),
        ("Delivery", "Academic terms contain course sections with faculty assignments, room/modality, and rosters."),
        ("Learning", "Sections contain ordered topics with summaries, complete content, study time, and publication state."),
        ("Assessment", "Published assessments contain questions and choices; protected answer keys are stored separately."),
        ("Results", "Attempts and answers are scored transactionally; grade items hold reviewed results and a separate publication state."),
        ("Time and communication", "Schedules, announcements, and notifications are filtered by enrollment, teaching, ownership, or intended audience."),
        ("AI and audit", "Chat threads/messages, grade-scan jobs, role audits, and privacy-minimized AI audit metadata make assistance traceable."),
    ])

    doc.add_heading("3.3 Academic workflows", level=2)
    doc.add_heading("Learning and topic review", level=3)
    add_steps(doc, [
        "Open Learning and select a visible course.",
        "Choose the topic in sequence and review its summary, estimated time, and full content.",
        "Students see only published topics for enrolled sections; staff visibility follows role and assignment.",
        "Use Nexus AI to explain a concept or identify the next learning action, then verify against course content.",
    ])
    doc.add_heading("Student assessment submission", level=3)
    add_steps(doc, [
        "Open Assessments and select a published quiz in an enrolled section.",
        "Answer each question and submit once ready.",
        "The database function validates identity, enrollment, publication window, attempt limit, question ownership, and answer ownership.",
        "Review the committed score and per-question explanation. Correct-answer records remain inaccessible through the student Data API.",
    ])
    doc.add_heading("Teacher grade review and publication", level=3)
    add_steps(doc, [
        "Open Grades and choose the class and grade item.",
        "Review roster rows, score bounds, existing feedback, and publication status.",
        "Enter or review a score; scores outside the grade item's maximum are rejected or quarantined.",
        "Save the draft after human review.",
        "Publish explicitly when the result is final. Students see only their own published result.",
    ])
    doc.add_heading("AI grade-sheet scan", level=3)
    add_steps(doc, [
        "Choose an eligible JPEG, PNG, or WebP grade-sheet image.",
        "The authenticated API confirms that the role is allowed to scan grades before contacting OpenAI vision.",
        "Review extracted learner identifiers, candidate scores, confidence values, and warnings.",
        "Resolve low-confidence matches and invalid score ranges; AI output is never treated as final truth.",
        "Approve the reviewed candidates into draft grades through the bounded transactional workflow.",
        "Publish each grade separately after the teacher confirms correctness.",
    ])


def add_crm(doc):
    add_section_break(doc)
    doc.add_heading("4. Student CRM and relationship operations", level=1)
    doc.add_paragraph(
        "The Student CRM connects relationship history, early-support signals, admissions progress, cases, tasks, outreach, institutional knowledge, and analytics. It helps staff move from scattered observations to owned, documented, reviewable action."
    )
    modules = [
        ("Command Center", "Prioritized daily view of urgent cases, overdue tasks, risk signals, admissions activity, and work requiring staff attention.", "Start the day, triage workload, generate an AI action brief."),
        ("Student 360", "Staff-facing profile combining academic, engagement, support, interaction, signal, and case context.", "Understand the whole situation before contacting or advising a student."),
        ("Success Radar", "Prioritizes students with recorded academic, attendance, engagement, financial, or unresolved-service concerns.", "Support human judgment and early intervention; never auto-decide a student outcome."),
        ("Admissions", "Tracks inquiry, application, review, acceptance, enrollment handoff, interactions, owners, probability, and next actions.", "Maintain a visible applicant pipeline and timely follow-up."),
        ("Case Management", "Organizes academic, counseling, finance, IT, and administrative cases by owner, priority, status, due date, and history.", "Keep service concerns visible until resolved."),
        ("Tasks", "Assigns follow-up work with due dates, links, priority, and completion state.", "Turn insight into accountable action."),
        ("Campaigns", "Coordinates admissions reminders, orientation, registration notices, and targeted student-support communication.", "Reach the right audience with staff-reviewed messaging."),
        ("Knowledge Hub", "Stores verified policies, procedures, FAQs, source links, owners, currency status, and usage information.", "Ground staff searches and AI answers in maintained institutional sources."),
        ("Analytics", "Summarizes admissions, student-success signals, case workload, tasks, service levels, intervention outcomes, and knowledge use.", "Support management review and continuous improvement."),
    ]
    add_table(doc, ["Module", "Purpose", "Primary use"], modules, [1700, 4500, 3160], font_size=8.4)

    doc.add_heading("4.1 Student-support workflow", level=2)
    add_steps(doc, [
        ("Detect", "A recorded signal, missed task, grade pattern, attendance concern, or unresolved service need appears in Success Radar."),
        ("Understand", "An authorized staff member opens Student 360 to review the broader context and verify the signal."),
        ("Assist", "Nexus AI may produce an evidence-based summary or suggested intervention using privacy-minimized context."),
        ("Own", "The staff member opens or updates a case and assigns a follow-up task with a due date."),
        ("Communicate", "Staff review and send supportive outreach; AI may draft but never sends or decides independently."),
        ("Resolve", "Interactions, actions, and outcomes are recorded until the concern is resolved or handed off."),
    ])
    doc.add_heading("4.2 Admissions workflow", level=2)
    add_steps(doc, [
        "Record a prospect as an inquiry with program interest, source, contact history, owner, and next action.",
        "Advance the prospect through inquiry, application, review, admitted, and enrollment-handoff stages only when the corresponding work is complete.",
        "Create tasks and use reviewed campaign messages for requirements, deadlines, interviews, decisions, and orientation.",
        "Preserve interaction history so any authorized colleague can continue the relationship responsibly.",
        "Use analytics to monitor response time, stage conversion, workload, and stalled applicants.",
    ])
    doc.add_heading("4.3 Case handling standard", level=2)
    add_bullets(doc, [
        "Give every case a clear category, priority, owner, status, due date, and next action.",
        "Record factual observations separately from interpretations or recommendations.",
        "Limit sensitive notes to the minimum necessary and follow university privacy policy.",
        "Use waiting status only when a named dependency and next review date are recorded.",
        "Resolve only after the requested service or documented handoff is complete.",
        "Never use an AI summary as the sole basis for discipline, eligibility, financial, academic, or welfare decisions.",
    ])


ROLES = [
    ("Owner", "owner", "Ownership", "Accountable platform governor and the single protected authority above all ordinary administrative roles.",
     "Institution-wide oversight; safe interface preview; people and role governance; academic and CRM operations; release and policy accountability.",
     "Review platform health; audit each role experience; authorize non-owner provisioning; assign or correct roles; verify high-risk workflows and governance.",
     "Cannot be demoted or deleted through ordinary workflows; cannot create a second owner; preview changes interface only, not database authority."),
    ("Administrator", "admin", "Leadership", "Operates cross-functional institutional processes and coordinates platform administration under owner governance.",
     "Broad school overview; academics, teaching, learning, assessments, grades, schedule, people visibility, and CRM operations.",
     "Maintain operational quality; coordinate departments; monitor cases/tasks; support users; review reports and platform exceptions.",
     "Does not inherit immutable owner status; sensitive role or account actions must follow the audited owner-controlled process."),
    ("President", "president", "Leadership", "Provides institution-wide executive direction, outcome oversight, and strategic accountability.",
     "Executive school overview, academic and operational reporting, schedules, people visibility, analytics, and CRM oversight.",
     "Review institutional indicators; monitor strategic priorities; sponsor policy and service improvements; escalate governance decisions.",
     "Oversight does not replace process ownership; should avoid editing operational records without an assigned business reason."),
    ("Vice President", "vice_president", "Leadership", "Coordinates institution-wide portfolios and turns executive priorities into accountable cross-unit action.",
     "Broad academic/operational visibility, schedule, people, analytics, and CRM workflows permitted by policy.",
     "Monitor portfolio performance; coordinate offices; resolve cross-functional blockers; review escalated cases and service trends.",
     "Access should be used within delegated portfolio authority and university policy."),
    ("Dean", "dean", "Leadership", "Leads academic quality and delivery across colleges, programs, faculty, and student outcomes.",
     "Academic Office, Teaching, Learning, Assessments, Grades, Schedule, People, CRM, and AI grade review where permitted.",
     "Review course delivery; monitor assessment/grade processes; support departments and faculty; oversee academic student-success concerns.",
     "AI output remains advisory; grade publication and academic decisions require accountable human review."),
    ("Registrar", "registrar", "Leadership", "Protects the integrity of enrollment, academic records, schedules, and official academic processes.",
     "Institution-wide academic catalog and schedule visibility, people reference, CRM cases/tasks, and operational reporting.",
     "Verify academic structure; coordinate registration and record issues; manage registrar cases; maintain deadline and schedule accuracy.",
     "Should not alter teaching judgments or unpublished grades outside approved registrar policy and workflow."),
    ("Department Head", "department_head", "Academic", "Owns department-level academic delivery, faculty coordination, curriculum execution, and student outcomes.",
     "Academic Office, Teaching, Learning, Assessments, Grades, Schedule, People context, department CRM, and grade-scan review.",
     "Monitor sections and rosters; coordinate topic/assessment readiness; review departmental grade workflows; support faculty and students.",
     "Scope should remain tied to the assigned department or delegated institutional authority."),
    ("Teacher / Faculty", "faculty", "Academic", "Designs and delivers learning, evaluates student work, gives feedback, and supports assigned learners.",
     "My Day, assigned Teaching, Learning, Assessments, class Grades, Schedule, relevant Student CRM, and Nexus AI.",
     "Review assigned courses; maintain learning sequence; administer assessments; review/publish grades; use scans only with human validation; support students.",
     "Sees assigned sections and rosters; cannot access another teacher's protected scope without policy-based authority."),
    ("Academic Advisor", "advisor", "Academic", "Guides students through academic choices, progression, requirements, referrals, and support plans.",
     "My Day, role-relevant Learning and Schedule, Student CRM, Student 360, Success Radar, cases, tasks, knowledge, and AI summaries.",
     "Review advisee context; explain options; document meetings; coordinate referrals; own follow-up tasks; monitor intervention outcomes.",
     "Advises but does not publish teacher grades, change answer keys, or make unsupported high-impact decisions from AI risk signals."),
    ("Admissions Officer", "admissions", "Operations", "Builds prospective-student relationships and manages timely movement from inquiry to enrollment handoff.",
     "My Day, relevant Learning/knowledge, Schedule, Student CRM admissions pipeline, tasks, campaigns, cases, and analytics.",
     "Record inquiries; maintain next actions; verify requirements; advance stages; coordinate campaigns; document interactions and handoff.",
     "Must not treat probability scores as admission decisions; official decisions follow approved admissions policy."),
    ("Finance Officer", "finance", "Operations", "Handles authorized financial service, payment, aid, balance, and finance-related student support workflows.",
     "My Day, role-relevant Learning/knowledge, Schedule, finance-related CRM cases/tasks, Student 360 context, and analytics.",
     "Resolve finance cases; document payment or aid guidance; coordinate deadlines; create follow-ups; update verified knowledge sources.",
     "Access only the minimum student context required; no academic grade or role authority unless separately assigned by policy."),
    ("Student Support", "support", "Operations", "Coordinates responsive, empathetic service and cross-office resolution for student needs.",
     "My Day, Learning/knowledge, Schedule, Student 360, Success Radar, cases, tasks, campaigns, and grounded AI assistance.",
     "Triage requests; verify context; open/own cases; coordinate referrals; follow up; record outcomes; maintain service knowledge.",
     "Signals guide review but do not label or decide a student's future; sensitive welfare matters require approved escalation."),
    ("Librarian", "librarian", "Operations", "Connects the university community to reliable information, learning resources, and maintained institutional knowledge.",
     "My Day, role-relevant Learning, Schedule, Student CRM knowledge and service cases, campaigns, analytics, and AI grounding.",
     "Maintain verified sources; review stale guidance; answer information requests; support research and learning-resource access.",
     "Knowledge ownership does not grant academic record, grade, or role-governance authority."),
    ("Student", "student", "Learner", "Learns, practices, completes assessments, reviews feedback, follows schedules, and seeks help within personal scope.",
     "My Day, enrolled Learning, published Assessments, own published Grades, personal/audience Schedule, announcements, and own chat history.",
     "Review the day; study topics; complete quizzes; read explanations; monitor published results; follow deadlines; ask grounded questions.",
     "Cannot access answer keys, other students' attempts/grades, staff CRM, people governance, or unpublished results."),
]


def add_roles(doc):
    add_section_break(doc)
    doc.add_heading("5. Role hierarchy and responsibility model", level=1)
    doc.add_paragraph(
        "The role model separates institutional accountability, leadership oversight, academic delivery, specialist operations, and learner access. A role is not merely a menu choice: it is trusted authorization metadata synchronized with the profile and enforced by database policy."
    )
    add_table(doc, ["Tier", "Roles", "Core purpose"], [
        ("Ownership", "owner", "Immutable platform governance and institution-wide accountability"),
        ("Leadership", "admin, president, vice_president, dean, registrar", "Institutional, academic, record, schedule, people, and operational oversight"),
        ("Academic", "department_head, faculty, advisor", "Department delivery, teaching, learning, assessment, grades, advising, and student success"),
        ("Operations", "admissions, finance, support, librarian", "Admissions, financial service, support, knowledge, outreach, and role-relevant CRM work"),
        ("Learner", "student", "Personal learning, assessments, published results, schedule, announcements, and assistance"),
    ], [1600, 3000, 4760], font_size=8.7)
    add_callout(doc, "Authorization rule", "Navigation is a usability layer. Supabase row-level security and trusted functions are the real boundary. Course access is narrowed further by faculty assignment or student enrollment.", tone="gold")

    for index, (title, code, tier, purpose, access, responsibilities, boundary) in enumerate(ROLES, start=1):
        doc.add_heading(f"5.{index} {title}", level=2)
        meta = doc.add_paragraph()
        meta.paragraph_format.space_after = Pt(6)
        set_run(meta.add_run(f"Canonical role: {code}  |  Tier: {tier}"), size=9, bold=True, color=TEAL)
        doc.add_heading("Purpose", level=3)
        doc.add_paragraph(purpose)
        doc.add_heading("Primary access", level=3)
        doc.add_paragraph(access)
        doc.add_heading("Core responsibilities and typical work", level=3)
        doc.add_paragraph(responsibilities)
        doc.add_heading("Authority boundary", level=3)
        doc.add_paragraph(boundary)


def add_role_matrix(doc):
    add_section_break(doc)
    doc.add_heading("6. Role-to-workspace matrix", level=1)
    doc.add_paragraph("This matrix summarizes the interface delivered by the current role-navigation logic. Data within a visible workspace remains filtered by RLS, assignment, enrollment, ownership, and publication state.")
    headers = ["Role", "Day", "Acad.", "Teach", "Learn", "Assess", "Grades", "Sched.", "People", "CRM"]
    rows = [
        ("Owner", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("Admin", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("President", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("Vice President", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("Dean", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("Registrar", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("Department Head", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓", "✓"),
        ("Faculty", "✓", "—", "✓", "✓", "✓", "✓", "✓", "—", "✓"),
        ("Advisor", "✓", "—", "—", "✓", "—", "—", "✓", "—", "✓"),
        ("Admissions", "✓", "—", "—", "✓", "—", "—", "✓", "—", "✓"),
        ("Finance", "✓", "—", "—", "✓", "—", "—", "✓", "—", "✓"),
        ("Support", "✓", "—", "—", "✓", "—", "—", "✓", "—", "✓"),
        ("Librarian", "✓", "—", "—", "✓", "—", "—", "✓", "—", "✓"),
        ("Student", "✓", "—", "—", "✓", "✓", "✓", "✓", "—", "—"),
    ]
    add_table(doc, headers, rows, [1900, 620, 720, 720, 720, 740, 720, 720, 720, 780], font_size=7.8)
    add_bullets(doc, [
        "Owner preview can display another role's interface for auditing, but the authenticated owner retains owner-level database authority.",
        "Faculty academic data is limited to assigned sections even when the workspace itself is visible.",
        "Student learning, assessment, grade, and schedule data is limited to enrollment, publication, ownership, and audience rules.",
        "Specialist roles enter CRM operations for the records and service surfaces allowed by their role and policy.",
    ])


def add_howtos(doc):
    add_section_break(doc)
    doc.add_heading("7. End-user how-to guide", level=1)
    doc.add_heading("7.1 Sign in and recover access", level=2)
    add_steps(doc, [
        "Open https://www.stu.best/crm.",
        "Enter the approved email address and password for your account.",
        "After authentication, verify that the role name and visible workspace match your job or student status.",
        "If startup stalls, use Start with a clean local session or Reset this device's saved session. This clears only the browser's saved STU Nexus session and does not delete the account or school data.",
        "If the role is wrong, sign out and contact the protected owner or approved administrator. Do not share credentials or use another person's account.",
    ])
    doc.add_heading("7.2 Navigate the portal", level=2)
    add_steps(doc, [
        "Use the left navigation on desktop or the menu button on mobile.",
        "Start in My Day to review counts, announcements, and the next scheduled items.",
        "Open the workspace that matches the task; unavailable items are intentionally hidden by role.",
        "Use the breadcrumb to confirm the current workspace and the user control to sign out when finished.",
        "Open Ask Nexus for assistance; start a new thread when the subject changes materially.",
    ])
    doc.add_heading("7.3 Use Nexus AI responsibly", level=2)
    add_steps(doc, [
        "Ask a specific question tied to a course, schedule, assessment, case, service task, or verified institutional topic.",
        "Review the answer, suggested actions, cited context, and any continuity-mode warning.",
        "Verify policy, grade, role, financial, admissions, welfare, and disciplinary information against the official source and responsible person.",
        "Edit AI-drafted communication for accuracy, empathy, tone, and minimum necessary personal information.",
        "Record the final human decision or completed action in the correct workflow; chat alone is not the official record.",
    ])
    doc.add_heading("7.4 Owner: preview and assign a role", level=2)
    add_steps(doc, [
        "Use View as to inspect the navigation and presentation for a canonical role. Confirm the preview banner is visible.",
        "Exit preview before performing governance work if the displayed context could create confusion.",
        "Open People & Roles and locate the non-owner identity.",
        "Select the approved role and provide a meaningful audit reason.",
        "Confirm the result. The trusted server function checks the actor, prevents owner changes, synchronizes Auth/profile state, and writes an audit row.",
        "Ask the user to sign out and in again if the session needs refreshed role metadata.",
    ])
    add_callout(doc, "Protected owner", "The owner cannot be demoted or deleted, and the interface must never offer owner as an assignable role for another identity.", tone="gold")
    doc.add_heading("7.5 Faculty: complete a teaching cycle", level=2)
    add_steps(doc, [
        "Review assigned sections in Teaching and confirm roster and delivery details.",
        "Review the published content map and the student-facing topic experience in Learning.",
        "Check assessment availability, structure, scoring configuration, and attempt policy.",
        "Monitor submitted attempts and use explanations to identify learning gaps.",
        "Review class grades or scan a grade sheet, resolve warnings, and save only verified drafts.",
        "Publish results explicitly and use Student CRM for documented support follow-up when permitted.",
    ])
    doc.add_heading("7.6 Student: complete a learning cycle", level=2)
    add_steps(doc, [
        "Review My Day for announcements, course counts, assessments, and upcoming schedule items.",
        "Open Learning, select an enrolled course, and study topics in sequence.",
        "Open Assessments and complete an available quiz before its deadline.",
        "Read the committed score and per-question feedback; ask the teacher when clarification is needed.",
        "Open Grades to review only published personal results and feedback.",
        "Use Schedule and Nexus AI to plan the next action, but follow official teacher and university instructions.",
    ])


def add_ai_security(doc):
    add_section_break(doc)
    doc.add_heading("8. Nexus AI, privacy, and human control", level=1)
    doc.add_heading("8.1 AI capabilities", level=2)
    add_table(doc, ["Capability", "Input", "Output", "Human control"], [
        ("Public campus assistant", "Public campus, website, policy, admissions, service, or navigation question", "Conversational answer and recommended destination", "User verifies against official source or office"),
        ("School assistant", "Authenticated role, visible school context, user prompt, owned conversation history", "Structured answer, actions, citations, persistent thread", "User reviews and performs any official action"),
        ("CRM student-success copilot", "Privacy-minimized student or institutional signals, cases, tasks, knowledge", "Summary, evidence, suggested interventions, draft communication", "Authorized staff verify context and decide next steps"),
        ("Grade-sheet vision", "Authenticated teacher/leader image and grade-item context", "Candidate rows, confidence, warnings", "Teacher resolves matches, saves drafts, and publishes separately"),
    ], [1800, 2900, 2450, 2210], font_size=8.2)
    doc.add_heading("8.2 Technical AI boundary", level=2)
    add_bullets(doc, [
        "OpenAI credentials remain server-side and never use a VITE_ browser-exposed variable.",
        "API endpoints validate the Supabase bearer token and derive the trusted role from Auth app_metadata rather than request JSON.",
        "Requests are rate-limited, context is bounded and privacy-minimized, and structured output is validated.",
        "Provider-side response storage is disabled for the school assistant workflow.",
        "Conversation threads and messages remain first-party Supabase data visible only to their owner under RLS.",
        "If OpenAI is unavailable, the system shows an explicit grounded continuity response; it does not silently claim that an AI scan succeeded.",
    ])
    doc.add_heading("8.3 Decisions AI must never make", level=2)
    add_bullets(doc, [
        "Assign, transfer, or infer a platform role.",
        "Decide objective quiz correctness outside the protected deterministic scoring function.",
        "Publish a grade or convert an extracted score directly into a final academic record.",
        "Make admissions, discipline, financial eligibility, academic standing, welfare, or employment decisions.",
        "Send student communication without authorized human review.",
        "Expose answer keys, other users' records, credentials, or context outside the authenticated user's policy scope.",
    ])

    doc.add_heading("9. Security and data governance", level=1)
    doc.add_heading("9.1 Identity and authorization", level=2)
    add_bullets(doc, [
        "Supabase Auth verifies every account and session.",
        "One canonical role is stored in trusted Auth app_metadata and matched to the public profile role.",
        "RLS is enabled on every exposed school and CRM table; the UI alone is never the security boundary.",
        "Teaching assignment, enrollment, record ownership, role audience, and publication state narrow access beyond the canonical role.",
        "Authenticated clients cannot directly write profile authorization columns.",
        "The owner-only provisioning function creates or rotates confirmed non-owner identities using a server-only service credential.",
    ])
    doc.add_heading("9.2 Trusted workflows", level=2)
    add_table(doc, ["Workflow", "Controls"], [
        ("submit_assessment", "Validates user identity, enrollment, publication window, attempts, question ownership, and submitted answer ownership before committing a score."),
        ("assign_platform_role", "Checks the actor, prevents any owner change, synchronizes Auth/profile role, and writes an audit record."),
        ("Grade-scan approval", "Runs with caller permissions, validates enrollment and score bounds, and saves reviewed candidate rows in one transaction."),
        ("Role-account provisioning", "Requires a fresh protected-owner session, rejects owner creation, validates account fields, and uses the Auth Admin API server-side."),
    ], [2300, 7060])
    doc.add_heading("9.3 Data handling rules", level=2)
    add_bullets(doc, [
        "Use the minimum personal data necessary for the task and role.",
        "Keep passwords, API keys, service credentials, and access tokens out of documents, chat prompts, logs, screenshots, and tickets.",
        "Use safe demonstration records until the university approves real-data integrations, retention, privacy notices, and access governance.",
        "Treat exported reports as controlled data and store them only in approved locations.",
        "Review knowledge sources for ownership, validity period, and official authority before allowing AI to rely on them.",
        "Record official decisions and outcomes in the proper system workflow, not only in AI conversation history.",
    ])


def add_technical(doc):
    add_section_break(doc)
    doc.add_heading("10. Technical architecture", level=1)
    doc.add_heading("10.1 Technology stack", level=2)
    add_table(doc, ["Layer", "Technology", "Responsibility"], [
        ("Frontend", "React 19, TypeScript, Vite 8", "Public homepage, authenticated shell, role workspaces, CRM, error/recovery interfaces"),
        ("Hosting", "Vercel, Node.js 24", "Static Vite delivery, SPA fallback, serverless API functions, production and preview deployments"),
        ("Identity and data", "Supabase Auth + Postgres", "Sessions, canonical role metadata, normalized data, RLS, transactional functions, audits"),
        ("AI", "OpenAI Responses API", "Structured role-aware assistance and vision-based grade candidate extraction"),
        ("Client data access", "@supabase/supabase-js", "Authenticated browser reads and allowed writes through RLS"),
        ("Quality gates", "Node test runner, oxlint, TypeScript, guarded Vite build, live scripts", "Contracts, lint, compilation, asset graph, role/RLS, AI, and deployment verification"),
    ], [1600, 2350, 5410], font_size=8.5)
    doc.add_heading("10.2 Runtime request flow", level=2)
    add_steps(doc, [
        "Vercel serves the public HTML, a dependency-free boot shell, and route-specific compiled assets.",
        "React chooses the public homepage or lazy-loaded CRM root based on the route.",
        "The CRM root restores a bounded Supabase session, validates the user, and builds the role-aware portal.",
        "The portal loads live data through Supabase; RLS evaluates identity, role, assignment, enrollment, ownership, and publication constraints.",
        "Trusted mutations use policy-controlled inserts/updates or database/server functions for cross-table atomic work.",
        "AI requests go to Vercel API functions, which validate the bearer session and trusted role before sending bounded context to OpenAI.",
    ])
    doc.add_heading("10.3 Resilience and blank-screen prevention", level=2)
    add_bullets(doc, [
        "The HTML contains visible branded content before JavaScript loads.",
        "A stalled mount changes to an explicit reload message instead of leaving an empty green background.",
        "A global React error boundary handles render and lazy-chunk failure with reload and session-recovery actions.",
        "Session restoration, identity validation, sign-in, sign-out, and initial data loading have finite timeouts.",
        "The standard build fails if the CRM route does not include the required authentication stylesheet.",
        "The live production diagnostic recursively checks deployed assets, CRM semantic styling, recovery content, and the temporary onboarding-disabled contract.",
    ])
    doc.add_heading("10.4 Current onboarding state", level=2)
    add_callout(doc, "Temporarily disabled", "Role-specific guided onboarding remains implemented and its RLS-protected historical tables are preserved, but the portal does not mount the component, load or write readiness progress, show tours, or expose the Readiness Center. Readiness has never granted authorization.", tone="gold")


def add_operations(doc):
    add_section_break(doc)
    doc.add_heading("11. Setup, deployment, and operations", level=1)
    doc.add_heading("11.1 Local prerequisites", level=2)
    add_bullets(doc, [
        "Node.js 24 and npm 11 or newer.",
        "Browser-safe VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values.",
        "Server-only OPENAI_API_KEY; optional OPENAI_MODEL, OPENAI_VISION_MODEL, and SAFETY_HASH_SALT.",
        "Never prefix the OpenAI key with VITE_ because Vite exposes such variables to browser code.",
    ])
    doc.add_heading("11.2 Local workflow", level=2)
    add_table(doc, ["Command", "Purpose", "Expected result"], [
        ("npm ci", "Install exactly the locked dependencies.", "Clean deterministic install."),
        ("npm run dev", "Start the Vite development server.", "Local URL, normally http://localhost:5173."),
        ("npm test", "Run API, security, role, boot, and onboarding-shutdown contracts.", "All contract tests pass."),
        ("npm run lint", "Run oxlint.", "No lint errors."),
        ("npm run build", "Compile TypeScript, build Vite assets, and verify the route/style graph.", "Production assets and successful semantic gate."),
        ("npm run preview", "Serve the built application locally.", "Public and /crm routes render from dist."),
        ("npm run diagnose:production", "Inspect live public routes and recursive assets without mutation.", "HTTP 200, recovery shell, CRM styles, onboarding disabled."),
    ], [2450, 3350, 3560], font_size=8.3)
    doc.add_heading("11.3 Supabase change process", level=2)
    add_steps(doc, [
        "Create a new ordered migration; never rewrite a migration already applied remotely.",
        "Define explicit grants, RLS policies, trusted-function checks, and indexes covering foreign keys and policy filters.",
        "Review SQL and apply it to the linked project through the approved migration workflow.",
        "Regenerate database contracts when the application type surface changes.",
        "Run security and performance advisors and resolve unintended findings.",
        "Execute live denial and success-path acceptance tests with cleanup for temporary data.",
    ])
    doc.add_heading("11.4 Production deployment", level=2)
    add_steps(doc, [
        "Merge reviewed changes to the main branch.",
        "Vercel auto-detects Vite, installs dependencies, runs npm run build, and uses dist with Node.js 24.",
        "The minimal rewrite sends direct client-side routes such as /crm to the application entry.",
        "Confirm the deployment is Ready and aliases resolve to stu.best and www.stu.best.",
        "Run the live production diagnostic and relevant signed-in role/RLS tests.",
        "Record the deployment, evidence, known limitations, and rollback considerations in project state and issue tracking.",
    ])

    doc.add_heading("11.5 Production acceptance checklist", level=2)
    add_bullets(doc, [
        "Both / and /crm return HTTP 200 and useful pre-JavaScript recovery content.",
        "Every referenced JavaScript and stylesheet asset returns successfully.",
        "CRM authentication styles are present in the emitted route graph.",
        "All 14 canonical acceptance accounts authenticate and match Auth/profile roles.",
        "Owner protection, student isolation, faculty assignment scope, answer-key protection, grade privacy, quiz scoring, and schedule rules pass.",
        "Authenticated AI succeeds for allowed roles; unauthenticated and unauthorized requests fail correctly.",
        "No secret, password, access token, or real student data appears in source control or logs.",
    ])


def add_troubleshooting(doc):
    add_section_break(doc)
    doc.add_heading("12. Troubleshooting and support", level=1)
    add_table(doc, ["Symptom", "Likely cause", "Action"], [
        ("Blank or green screen", "Blocked/missing asset, stale cached chunk, render failure, or old deployment", "Use visible reload/recovery control; run diagnose:production; inspect deployment and asset responses."),
        ("Unstyled sign-in page", "CRM route loaded without its stylesheet", "Run npm run diagnose:production; the semantic gate reports the missing authentication stylesheet contract."),
        ("Portal keeps loading", "Network delay, stale saved session, or Supabase startup issue", "Wait for bounded error; retry; use clean local session; verify Supabase availability and environment values."),
        ("Wrong workspace or role", "Stale session metadata or incorrect role assignment", "Sign out/in; owner verifies People & Roles, Auth app_metadata, profile role, and audit history."),
        ("Expected course missing", "No teaching assignment/enrollment, unpublished content, inactive section, or RLS scope", "Verify roster/assignment, publication state, term/section status, and policy with an authorized operator."),
        ("Quiz submission rejected", "Not enrolled, assessment unavailable, attempt limit, invalid answers, or expired session", "Review availability and enrollment; reauthenticate; do not bypass the transactional function."),
        ("Grade missing for student", "Draft/unpublished result, wrong enrollment, or different grade item", "Teacher verifies class, item, roster, and publication state; student cannot view drafts."),
        ("AI unavailable", "Missing server key, provider/network error, rate limit, invalid session, or unauthorized role", "Read the explicit error/continuity label; verify Vercel variables and API logs without exposing prompts or secrets."),
        ("Grade scan warning", "Low confidence, unmatched learner, unsupported image, or out-of-range score", "Review manually, correct the source/image, resolve every warning, and save only verified drafts."),
        ("CRM save interrupted", "Supabase/network failure or denied RLS mutation", "Retry after connectivity check; confirm role scope; treat local cache as continuity only, not the system of record."),
    ], [2250, 3100, 4010], font_size=8.1)
    doc.add_heading("12.1 Escalation information", level=2)
    add_bullets(doc, [
        "User identity, canonical role, and affected workspace—never the password.",
        "Exact timestamp, route, action attempted, and user-visible error message.",
        "Whether the issue reproduces after sign-out/sign-in or clean local-session recovery.",
        "Deployment identifier or commit when a release regression is suspected.",
        "Relevant request/audit identifier with personal data minimized.",
        "Expected policy outcome and why the current behavior appears incorrect.",
    ])


def add_governance(doc):
    add_section_break(doc)
    doc.add_heading("13. Governance and production-readiness roadmap", level=1)
    doc.add_paragraph(
        "The current environment proves a complete role-aware platform architecture with production services and safe demonstration records. Operational adoption with real university data requires institutional governance beyond software implementation."
    )
    add_table(doc, ["Readiness area", "Required institutional decision or control"], [
        ("Identity lifecycle", "Approved source of truth, joiner/mover/leaver process, MFA policy, delegated provisioning, account recovery, and periodic access review."),
        ("Data integration", "Approved SIS/LMS/finance/library interfaces, ownership, reconciliation, failure handling, and authoritative-record rules."),
        ("Privacy", "Legal basis, privacy notices, minimum data, consent where applicable, retention, deletion, export, incident response, and cross-border AI review."),
        ("Academic governance", "Ownership of courses, topics, assessments, answer keys, grade review, publication, appeals, and record correction."),
        ("Student success", "Signal definitions, bias review, intervention policy, case confidentiality, welfare escalation, and prohibition of automated high-impact decisions."),
        ("AI governance", "Approved models/use cases, prompt/data policy, evaluation, monitoring, human-review standards, incident handling, and source maintenance."),
        ("Service operations", "Support ownership, severity model, uptime targets, monitoring, backup/recovery, release approvals, rollback, and vendor management."),
        ("Training and change", "Role-specific training, competency checks, onboarding re-enable decision, job aids, champions, feedback, and phased rollout."),
    ], [2300, 7060], font_size=8.5)
    doc.add_heading("13.1 Recommended phased rollout", level=2)
    add_steps(doc, [
        ("Govern", "Approve ownership, policies, privacy, access model, data classifications, AI boundaries, and success measures."),
        ("Integrate", "Connect one authoritative domain at a time, reconcile records, and test failure/recovery behavior."),
        ("Pilot", "Start with a limited department and selected staff/student cohort using approved real data and trained support."),
        ("Evaluate", "Measure usability, access accuracy, service outcomes, AI quality, support burden, and privacy/security events."),
        ("Expand", "Add departments and workflows only after pilot acceptance criteria and remediation are complete."),
        ("Operate", "Establish recurring access review, knowledge review, model evaluation, incident exercises, release governance, and user training."),
    ])
    doc.add_heading("13.2 Success measures", level=2)
    add_bullets(doc, [
        "Time required to find authoritative information or begin a high-frequency task.",
        "Reduction in repeated administrative questions and avoidable handoffs.",
        "Admissions follow-up timeliness and pipeline completion quality.",
        "Case ownership, response time, resolution rate, and student satisfaction.",
        "Learning-content availability, assessment completion, feedback timeliness, and grade publication accuracy.",
        "Role/access correctness, denied unauthorized access, audit completeness, and incident rates.",
        "AI groundedness, citation usefulness, human correction rate, continuity behavior, and zero autonomous high-impact decisions.",
    ])


def add_appendices(doc):
    add_section_break(doc)
    doc.add_heading("Appendix A. Quick-reference URLs and commands", level=1)
    add_table(doc, ["Item", "Location or command"], [
        ("Public website", "https://www.stu.best"),
        ("Authenticated portal", "https://www.stu.best/crm"),
        ("Local development", "npm run dev"),
        ("Contracts", "npm test"),
        ("Lint", "npm run lint"),
        ("Production build", "npm run build"),
        ("Live rendering diagnostic", "npm run diagnose:production"),
        ("Live role-account verification", "npm run test:live-accounts"),
        ("Protected local POC credential sheet", "npm run export:role-credentials"),
    ], [3000, 6360])
    add_callout(doc, "Credential safety", "The credential sheet is local-only, Git-ignored, and mode 0600. This manual intentionally contains no email/password directory, password, API key, token, or service credential.", tone="gold")

    doc.add_heading("Appendix B. Glossary", level=1)
    add_table(doc, ["Term", "Meaning"], [
        ("Canonical role", "The single trusted platform role assigned to an authenticated identity."),
        ("RLS", "Postgres row-level security; policies that determine which rows a user can read or change."),
        ("Auth app_metadata", "Server-controlled Supabase identity metadata used for authorization."),
        ("Student 360", "A permission-controlled staff view combining student academic, engagement, interaction, signal, and case context."),
        ("Success Radar", "Prioritized human-review view of recorded student support signals."),
        ("Protected answer key", "Correct-answer data stored separately and inaccessible to student queries."),
        ("Transactional scoring", "Database-controlled assessment submission that validates and commits a complete result atomically."),
        ("Draft grade", "A reviewed grade record not yet visible to the student."),
        ("Published grade", "A final result explicitly released and visible to its student under RLS."),
        ("Grounded AI", "AI response constrained by verified institutional or role-visible context and accompanied by evidence/citations where available."),
        ("Continuity mode", "Clearly labeled non-provider fallback behavior when the OpenAI service cannot complete a request."),
        ("POC", "Proof of concept; a production-shaped implementation used to validate design and workflows before formal institutional rollout."),
    ], [2400, 6960], font_size=8.7)

    doc.add_heading("Appendix C. Source basis", level=1)
    doc.add_paragraph("This manual was authored from the implemented repository and its maintained operating references, including:")
    add_bullets(doc, [
        "README.md, PROJECT.md, SETUP.md, docs/research/UNDERSTANDING.md, and docs/research/research.md",
        "src/crm/PORTAL_GUIDE.md and the CRM implementation",
        "src/platform/ROLE_MATRIX.md, platform architecture, repository, role-aware navigation, and platform implementation",
        "Supabase migrations, trusted functions, Edge Function documentation, generated database contracts, and RLS acceptance tests",
        "API authentication, school-assistant, CRM-assistant, and grade-scan contracts",
        "Production build, live deployment, all-role account, role portal, school workflow, CRM, onboarding-shutdown, and AI verification scripts",
    ])
    add_callout(doc, "Scope note", "Interface labels and functional availability describe the current implemented proof of concept. University policy, formal delegation, and real-data integration may further restrict or expand operational use before rollout.")


def set_core_properties(doc):
    props = doc.core_properties
    props.title = "STU Nexus Comprehensive Web Platform & CRM Manual"
    props.subject = "Functional, role, user, technical, security, and operations documentation"
    props.author = "STU Edu AI Project"
    props.keywords = "Shu-Te University, STU Nexus, CRM, school platform, roles, Supabase, OpenAI"
    props.comments = "Generated from the implemented STU Edu AI repository. Contains no credentials."


def build():
    doc = Document()
    configure_document(doc)
    set_core_properties(doc)
    add_cover(doc)
    add_front_matter(doc)
    add_overview(doc)
    add_public_website(doc)
    add_school_os(doc)
    add_crm(doc)
    add_roles(doc)
    add_role_matrix(doc)
    add_howtos(doc)
    add_ai_security(doc)
    add_technical(doc)
    add_operations(doc)
    add_troubleshooting(doc)
    add_governance(doc)
    add_appendices(doc)
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
