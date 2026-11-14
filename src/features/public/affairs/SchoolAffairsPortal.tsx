import { clubOfficerHeading } from './ClubOfficer';
import { ClubServices } from "./ClubServices";
import { clubPath } from "../../../../server/clubServicesContract.js";
import {elearningPath,elearningServicePath} from '../../../../server/elearningContract.js';
import {CounselingWorkspace} from "./CounselingWorkspace";
import { HealthExaminations } from "./HealthExaminations";
import { healthExaminationPath } from "../../../../server/healthExaminationContract.js";
import {AidPayments} from "./AidPayments";
import {aidPaymentsPaths} from "../../../../server/aidPaymentsContract.js";
import {counselingPath} from "../../../../server/counselingContract.js";
import {CertificateAwardWorkspace} from "./CertificateAwardWorkspace";
import {certificateAwardPath} from "../../../../server/certificateAwardsContract.js";
import {AnnouncementEmailSettings} from "./AnnouncementEmailSettings";
import {announcementEmailPath} from "../../../../server/announcementEmailContract.js";
import {GraduationClearanceWorkspace} from "./GraduationClearanceWorkspace";
import {clearancePaths} from "../../../../server/graduationClearanceContract.js";
import {PermanentCourseCatalog} from "./PermanentCourseCatalog";
import {FacilityRepairWorkspace} from "./FacilityRepairWorkspace";
import {repairPaths} from "./facilityRepair.js";
import {VenueWorkspace} from "./VenueWorkspace";
import {venuePaths} from "./venueContract.js";
import {permanentCoursesPath} from "./permanentCourseRouting.js";
import {TeachingFeedbackWorkspace} from "./TeachingFeedbackWorkspace";
import {teachingFeedbackPaths} from "../../../../server/teachingFeedbackContract.js";
import { EarlyGraduationWorkspace } from "./EarlyGraduationWorkspace";
import { earlyGraduationPath } from "../../../../server/earlyGraduationContract.js";
import { CourseSubstitutionWorkspace } from "./CourseSubstitutionWorkspace";
import { FirstSelectionWorkspace } from "./FirstSelectionWorkspace";
import { CourseAdjustmentWorkspace } from "./CourseAdjustmentWorkspace";
import { CourseWithdrawalWorkspace } from "./CourseWithdrawalWorkspace";
import { CreditTransferWorkspace } from "./CreditTransferWorkspace";
import { creditTransferPath } from "../../../../server/creditTransferContract.js";
import { withdrawalPath } from "../../../../server/courseWithdrawalContract.js";
import {SummerSelectionWorkspace} from "./SummerSelectionWorkspace";
import { StudentProfileWorkspace } from "./StudentProfileWorkspace";
import { studentProfilePath } from "../../../../server/studentProfileContract.js";
import { adjustmentPaths } from "../../../../server/courseAdjustmentContract.js";
import { firstSelectionFeesPath, firstSelectionPath } from "./firstSelection.js";
import { courseSubstitutionPath } from "./courseSubstitution.js";
import { programRegistrationPath } from "../../../../server/programRegistrationContract.js";
import { ProgramRegistrationWorkspace } from "./ProgramRegistrationWorkspace";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { SchoolAccountAdmin } from "./SchoolAccountAdmin";
import type { CSSProperties, ReactNode } from "react";
import { Link, Navigate, useLocation, useSearchParams, useNavigate } from "react-router";
import {
  List,
  Menu,
  Mail,
  ChevronDown,
  ChevronUp,
  Settings,
  Star,
  Bookmark,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { referenceAsset, referenceHref } from "../site/reference";
import { campusAssistantOpenEvent } from "../PublicAssistant";
import {
  commonPrograms,
  filterPrograms,
  getMenuPrograms,
  kindLabels,
  menuPath,
  portalGroups,
  portalNews,
} from "./model";
import type { PortalProgram } from "./model";
import { loadPreferences, savePreferences } from "./preferences";
import type { PortalPreferences } from "./preferences";
import { calendarPath, interdisciplinaryProgramsPath, nativeServiceAlias, schoolSubjectRecordsPath, serviceDestination, teachingAssistantPath, tutorEvaluationPath } from "./studentServices.js";
import { StudentServiceWorkspace } from "./StudentServiceWorkspace";
import StudentLeaveWorkspace from "./StudentLeaveWorkspace";
import { StudentScholarshipWorkspace } from "./StudentScholarshipWorkspace";
import { useAffairsRecords } from "./useAffairsRecords";
import { StudentAidWorkspace } from "./studentAidWorkspace";
import CourseCatalog from "./CourseCatalog";
import { SyllabusSearchRoute } from "./SyllabusSearchWorkspace";
import { syllabusSearchPath } from "@/services/syllabusSearchClient";
import { HousingWorkspace } from "./HousingWorkspace";
import { PendingFees } from "./PendingFees";
import { CreditLoadHistory } from "./CreditLoadHistory";
import { CourseSelection } from "./CourseSelection";
import { CreditLoadApplication } from "./CreditLoadApplication";
import { CourseSelectionIndex } from "./CourseSelectionIndex";
import { AcademicGrades } from "./AcademicGrades";
import { GraduationReview } from "./GraduationReview";
import { LegacyGraduationReview } from "./LegacyGraduationReview";
import { AcademicAttendance } from "./AcademicAttendance";
import { EnrollmentCertificateWorkspace } from "./EnrollmentCertificate";
import { TuitionDocumentsWorkspace } from "./TuitionDocumentsWorkspace";
import { StudentConductWorkspace } from "./StudentConductWorkspace";
import { StudentLoanWorkspace } from "./StudentLoanWorkspace";
import { DormConductWorkspace } from "./DormConductWorkspace";
import { EducationFundWorkspace } from "./EducationFundWorkspace";
import { SchoolSubjectRecords } from "./SchoolSubjectRecords";
import { CurriculumMapWorkspace } from "./CurriculumMapWorkspace";
import { curriculumMapPath } from "./curriculumMaps.js";
import { CurriculumPlans } from "./CurriculumPlanWorkspace";
import { InterdisciplinaryPrograms } from "./InterdisciplinaryPrograms";
import { curriculumPlansPath } from "./curriculumPlans.js";
import { ParkingPermitWorkspace } from "./ParkingPermitWorkspace";
import { parkingInstructionsPath, parkingPermitPath } from "./parkingPermits.js";
import { ServiceLeadershipWorkspace } from "./ServiceLeadershipWorkspace";
import { serviceLeadershipPath, serviceLeadershipViews } from "./serviceLeadership.js";
import { TeachingAssistantWorkspace } from "./TeachingAssistantWorkspace";
import { TutorEvaluationWorkspace } from "./TutorEvaluationWorkspace";
import { ExchangeGrantWorkspace } from "./ExchangeGrantWorkspace";
import { exchangeGrantPath } from "./exchangeGrantReference";
import { FeeRemissionWorkspace } from "./FeeRemissionWorkspace";
import { feeRemissionPath } from "../../../../server/feeRemissionContract.js";
import { dormitoryConductPath } from "@/services/dormitoryConduct";
import { studentLoanPaths, type StudentLoanView } from "@/services/studentLoan";
import { studentConductPath } from "@/services/studentConduct";
import { tuitionDocumentPaths } from "../../../../server/tuitionDocuments.js";
import type { TuitionView } from "./TuitionDocuments";
import { academicGradePaths, type AcademicGradesView } from "@/services/academicGrades";
import { graduationReviewPaths } from "@/services/graduationReview";
import { academicAttendancePaths } from "@/services/academicAttendance";
import { enrollmentCertificatePath } from "@/services/enrollmentCertificate";
import "./portal.css";

// The university portal uses Font Awesome 4 for its navigation.
const groupIcons = ["\uf0c9", "\uf19c", "\uf022", "\uf1ad", "\uf1b3", "\uf12b", "\uf16c"];
const academicGradeViews: AcademicGradesView[] = ["index", "current", "transcript", "warning", "ranking", "transfer", "cycle"];

function PortalIcon({ glyph }: { glyph: string }) {
  return <i className="portal-icon" aria-hidden="true">{glyph}</i>;
}
function PortalWidget({
  title,
  icon: Icon = List,
  count,
  children,
  common = false,
}: {
  title: string;
  icon?: typeof List;
  count?: number;
  children: ReactNode;
  common?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className={`portal-widget ${common ? "portal-common-widget" : ""}`}
    >
      <header>
        <h2>
          <Icon aria-hidden="true" />
          {title}
          {count !== undefined && <span className="portal-count">{count}</span>}
        </h2>
        <Button
          variant="ghost"
          aria-label={`${open ? "收合" : "展開"}${title}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </header>
      <div hidden={!open}>{children}</div>
    </section>
  );
}

export default function SchoolAffairsPortal({user}: {user: User}) {
  const displayName = user.email || "Google account";
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState(() => loadPreferences(user.id));
  const preferences = snapshot.value;
  const storageError = !snapshot.storageAvailable;
  const [routeState, setRouteState] = useState({
    pathname: "",
    expanded: "",
    mobileOpen: false,
    query: "",
    customizing: false,
  });
  const [copyStatus, setCopyStatus] = useState("");
  const lastNewsTrigger = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const normalizedPath = pathname.replace(/\/$/, "");
  const route = normalizedPath.split("/").slice(2);
  const academicGradeView = academicGradeViews.find(value => academicGradePaths[value] === normalizedPath);
  const group =
    route[0] === "search" ? "all" : route[0] === "menu" ? route[1] || "" : "";
  const view = route[0] === "search" ? "all" : route[2] || "";
  const currentRouteState =
    routeState.pathname === pathname
      ? routeState
      : {
          pathname,
          expanded: group === "all" ? "" : group,
          mobileOpen: false,
          query: "",
          customizing: false,
        };
  const { expanded, mobileOpen, query, customizing } = currentRouteState;
  function changeRouteState<K extends keyof typeof currentRouteState>(
    key: K,
    value: (typeof currentRouteState)[K],
  ) {
    setRouteState({ ...currentRouteState, [key]: value });
  }
  const setExpanded = (value: string) => changeRouteState("expanded", value);
  const setMobileOpen = (value: boolean) =>
    changeRouteState("mobileOpen", value);
  const setQuery = (value: string) => changeRouteState("query", value);
  const setCustomizing = (value: boolean) =>
    changeRouteState("customizing", value);
  function setPreferences(
    change: (current: PortalPreferences) => PortalPreferences,
  ) {
    const value = change(preferences);
    setSnapshot({ value, storageAvailable: savePreferences(value, user.id) });
  }
  const validMenu =
    route[0] === "search" ||
    portalGroups.some(
      (g) => g.id === group && g.views.some((v) => v[0] === view),
    );
  const index = route.length === 0;
  const bookmarks = route[0] === "bookmarks";
  const notifications = route[0] === "notifications";
  const records = route[0] === "records" && route.length === 1;
  const subjects = normalizedPath === schoolSubjectRecordsPath;
  const adminRecords = route[0] === "admin" && route[1] === "records" && route.length === 2;
  const announcementEmail = normalizedPath === announcementEmailPath;
  const servicePage = route[0] === "services";
  const { snapshot: account, loading: accountLoading, error: accountError, refresh: refreshAccount } =
    useAffairsRecords(index || notifications || bookmarks || validMenu || adminRecords || subjects || (servicePage && (["11-1", "11-2", "13-1", "14-1", "15-1", "15-2", "34-2", "38-1"].includes(route[1]) || (route[1] === "45-1" && route[2] === "area"))) ? user.id : undefined);
  const verifiedAdmin = !accountLoading && !accountError && account?.profile.userId === user.id && account.profile.role === "admin";
  const ended = route[0] === "signed-out";
  const article = portalNews.find((news) => news.id === params.get("news"));
  const programs = filterPrograms(
    getMenuPrograms(group, view, preferences.favorites),
    query,
  );
  const selectedGroup = portalGroups.find((g) => g.id === group);
  const selectedLabel =
    selectedGroup?.views.find((v) => v[0] === view)?.[1] || "系統搜尋";
  const listView =
    group === "menu" &&
    ["custom", "common", "course", "graduation"].includes(view);
  useEffect(() => {
    document.title = `${index ? "校務系統入口" : validMenu ? selectedLabel : bookmarks ? "已收藏消息查詢" : notifications ? "通知訊息查詢" : adminRecords ? "School Affairs administration" : "校務系統"} · stu.best School Affairs`;
  }, [
    pathname,
    group,
    index,
    validMenu,
    selectedLabel,
    bookmarks,
    notifications,
    adminRecords,
  ]);
  const update = <K extends keyof PortalPreferences>(
    key: K,
    value: PortalPreferences[K],
  ) => setPreferences((p) => ({ ...p, [key]: value }));
  const toggleFavorite = (id: string) =>
    setPreferences((p) => ({
      ...p,
      favorites: p.favorites.includes(id)
        ? p.favorites.filter((x) => x !== id)
        : [...p.favorites, id],
    }));
  const closeArticle = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("news");
        return next;
      },
      { replace: true },
    );
  const openArticle = (id: string, trigger: HTMLElement) => {
    lastNewsTrigger.current = trigger;
    setCopyStatus("");
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("news", id);
      return next;
    });
  };
  function renderProgramLink(program: PortalProgram) {
    const destination = serviceDestination(program);
    return (
      <Link data-program-id={program.id} to={destination} reloadDocument={destination.split(/[?#]/, 1)[0] === calendarPath || (program.id === "4-5" && destination === "/")}>
        {program.title}
      </Link>
    );
  }
  function renderNavigation(mobile = false) {
    return (
      <nav
        aria-label={mobile ? "行動版校務選單" : "校務選單"}
        className="portal-navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") setExpanded("");
        }}
      >
        <div className="portal-shortcuts">
          <a
            href="https://infosys.stu.edu.tw/CampusAction/"
            target="_blank"
            rel="noreferrer"
            title="校園活動系統（校方服務）"
            aria-label="校園活動系統（校方服務）"
          >
            <PortalIcon glyph={"\uf073"} />
          </a>
          <a
            href="https://www.stu.edu.tw/latestnews/"
            target="_blank"
            rel="noreferrer"
            title="校園公告系統（校方服務）"
            aria-label="校園公告系統（校方服務）"
          >
            <PortalIcon glyph={"\uf03a"} />
          </a>
          <Link
            to={menuPath("menu", "custom")}
            title="自訂選單"
            aria-label="自訂選單"
          >
            <PortalIcon glyph={"\uf0c9"} />
          </Link>
          <Link
            to="/school-affairs/search"
            title="系統搜尋"
            aria-label="系統搜尋"
          >
            <PortalIcon glyph={"\uf002"} />
          </Link>
        </div>
        <ul>
          {portalGroups.map((item, idx) => {
            const isOpen =
              expanded === item.id && (!preferences.collapsed || mobile);
            return (
              <li
                key={item.id}
                className={selectedGroup?.id === item.id ? "is-active" : ""}
                onMouseEnter={() => {
                  if (preferences.hoverMenus && !preferences.collapsed)
                    setExpanded(item.id);
                }}
              >
                <Button
                  variant="ghost"
                  className="portal-group-toggle"
                  aria-expanded={isOpen}
                  aria-controls={`${mobile ? "mobile-" : ""}portal-group-${item.id}`}
                  aria-label={item.label}
                  title={preferences.collapsed ? item.label : undefined}
                  onClick={() => {
                    if (preferences.collapsed && !mobile)
                      update("collapsed", false);
                    setExpanded(isOpen ? "" : item.id);
                  }}
                >
                  <PortalIcon glyph={groupIcons[idx]} />
                  <span>{item.label}</span>
                  <ChevronDown
                    className="portal-group-chevron"
                    aria-hidden="true"
                  />
                </Button>
                <ul
                  id={`${mobile ? "mobile-" : ""}portal-group-${item.id}`}
                  hidden={!isOpen}
                >
                  {item.views.map(([key, label]) => (
                    <li key={key}>
                      <Link
                        to={menuPath(item.id, key)}
                        aria-current={
                          group === item.id && view === key ? "page" : undefined
                        }
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          <li>
            <Link
              className="portal-logout"
              to="/school-affairs/signed-out"
              aria-label="Logout：登出校務系統"
              title="登出校務系統"
            >
              <PortalIcon glyph={"\uf08b"} />
              <span>Logout</span>
            </Link>
          </li>
        </ul>
        {!mobile && (
          <Button
            variant="ghost"
            className="portal-collapse"
            aria-label={preferences.collapsed ? "展開側邊欄" : "收合側邊欄"}
            onClick={() => update("collapsed", !preferences.collapsed)}
          >
            <PortalIcon glyph={preferences.collapsed ? "\uf101" : "\uf100"} />
          </Button>
        )}
      </nav>
    );
  }
  const settingsFields = [
    ["fixedNavbar", "Fixed Navbar"],
    ["fixedSidebar", "Fixed Sidebar"],
    ["fixedBreadcrumbs", "Fixed Breadcrumbs"],
    ["contained", "Inside .container"],
    ["hoverMenus", "Submenu on Hover"],
    ["collapsed", "Compact Sidebar"],
    ["alternateActive", "Alt. Active Item"],
  ] as const;
  const renderNewsRows = (category: "news" | "health") => (
    <ul className="portal-lined-list">
      {portalNews
        .filter((n) => n.category === category)
        .map((news) => (
          <li key={news.id}>
            <Button
              variant="ghost"
              onClick={(event) => openArticle(news.id, event.currentTarget)}
            >
              {news.title}
            </Button>
          </li>
        ))}
    </ul>
  );
  const renderNotifications = () => (
    <ul className="portal-lined-list">
      {accountLoading && !account && <li role="status">載入中…</li>}
      {accountError && <li role="alert">
        {accountError} <Button variant="outline" onClick={refreshAccount}>重試</Button>
      </li>}
      {account?.requests.map(request => (
        <li key={request.id}>
          <Link to="/school-affairs/records">{request.title}</Link>
        </li>
      ))}
      {account?.requests.length === 0 && <li>目前沒有通知。</li>}
    </ul>
  );
  const programRows = programs.reduce<
    Array<{ kind: string; section: string; programs: PortalProgram[] }>
  >((rows, program) => {
    let row = rows.at(-1);
    if (!row || row.kind !== program.kind || row.section !== program.section) {
      row = { kind: program.kind, section: program.section, programs: [] };
      rows.push(row);
    }
    row.programs.push(program);
    return rows;
  }, []);
  const styles = {
    "--portal-font-size": `${preferences.fontSize}px`,
  } as CSSProperties;
  const serviceAlias = servicePage && route.length === 2 ? nativeServiceAlias(route[1]) : undefined;
  if (subjects) return <SchoolSubjectRecords snapshot={account} loading={accountLoading} error={accountError} reload={refreshAccount} />;
  if (records) return <Navigate replace to="/school-affairs" />;
  if (normalizedPath === elearningServicePath) return <Navigate replace to={elearningPath} />;
  if (normalizedPath === clubPath || normalizedPath.startsWith(clubPath + "/")) {
    const view=route.slice(2).join("/");
    if (view==="" || view==="activities" || view==="equipment" || view==="equipment/new" || view==="equipment/review" || clubOfficerHeading(view))
      return <ClubServices key={user.id} userId={user.id} view={view} />;
  }
  if (normalizedPath === healthExaminationPath) return <HealthExaminations userId={user.id} />;
  if (normalizedPath === aidPaymentsPaths.claims || normalizedPath === aidPaymentsPaths.salary)
    return <AidPayments userId={user.id} view={normalizedPath === aidPaymentsPaths.salary ? "salary" : "claims"} />;
  if (serviceAlias) {
    return <Navigate replace to={{pathname: serviceAlias, search, hash}} />;
  }
  if (["tutor", "dean", "academic"].some(role => normalizedPath === `/school-affairs/course-selection/review/${role}`)) {
    // Source student session returns all three review destinations to system Index.
    return <Navigate replace to={{pathname: "/school-affairs/course-selection", search, hash}} />;
  }
  if (normalizedPath === "/school-affairs/course-selection") {
    return <CourseSelectionIndex />;
  }
  if (normalizedPath === "/school-affairs/services/7-1") {
    return <CreditLoadApplication key={user.id} />;
  }
  if ([counselingPath,counselingPath+"/consent",counselingPath+"/appointments",counselingPath+"/queue"].includes(normalizedPath)) {
    return <CounselingWorkspace key={user.id} userId={user.id} view={route[2]==="consent"?"consent":route[2]==="appointments"||route[2]==="queue"?route[2]:"home"}/>;
  }
  if (normalizedPath === certificateAwardPath || normalizedPath === certificateAwardPath + "/overview" ||
    normalizedPath === certificateAwardPath + "/catalog" || (route[0] === "services" && route[1] === "52-1" &&
      route[2] === "record" && route.length === 4 && /^[0-9a-f-]{36}$/.test(route[3]))) {
    return <CertificateAwardWorkspace key={user.id+normalizedPath} userId={user.id}
      view={route[2]==="catalog"?"catalog":route[2]==="record"?"record":"form"} id={route[2]==="record"?route[3]:undefined}/>;
  }
  if (normalizedPath === studentProfilePath) return <StudentProfileWorkspace key={user.id} userId={user.id} />;
  if (normalizedPath === firstSelectionPath || normalizedPath === firstSelectionFeesPath) {
    return <FirstSelectionWorkspace key={user.id} view={normalizedPath === firstSelectionPath ? "schedule" : "fees"} />;
  }
  if (normalizedPath === clearancePaths.apply || normalizedPath === clearancePaths.status) {
    return <GraduationClearanceWorkspace key={user.id+normalizedPath} userId={user.id} page={normalizedPath===clearancePaths.apply?'apply':'status'}/>;
  }
  if (normalizedPath === teachingFeedbackPaths.survey || normalizedPath === teachingFeedbackPaths.immediate) {
    return <TeachingFeedbackWorkspace key={user.id+normalizedPath} userId={user.id} view={normalizedPath===teachingFeedbackPaths.survey?'survey':'immediate'}/>;
  }
  if (normalizedPath === earlyGraduationPath) {
    return <EarlyGraduationWorkspace key={user.id} userId={user.id} />;
  }
  if (normalizedPath === creditTransferPath || normalizedPath === creditTransferPath + "/history") {
    return <CreditTransferWorkspace key={user.id+normalizedPath} userId={user.id} history={normalizedPath.endsWith("/history")} />;
  }
  if (normalizedPath === withdrawalPath) return <CourseWithdrawalWorkspace key={user.id} userId={user.id} />;
  if (normalizedPath === adjustmentPaths.summer || normalizedPath === adjustmentPaths.summer + "/notice") {
    return <SummerSelectionWorkspace key={user.id + normalizedPath + search} userId={user.id}
      notice={normalizedPath.endsWith("/notice")} search={search} />;
  }
  if (normalizedPath === adjustmentPaths.add_drop ||
    [adjustmentPaths.late_add, ...["entry","notice","fees"].map(view=>adjustmentPaths.late_add+"/"+view)].includes(normalizedPath)) {
    return <CourseAdjustmentWorkspace key={user.id+normalizedPath} userId={user.id} path={normalizedPath} />;
  }
  if (normalizedPath === curriculumMapPath) return <CurriculumMapWorkspace />;
  if (route[0] === "services" && route[1] === "12-7" && route[2] === "program" &&
    (route.length === 4 || (route.length === 5 && ["courses", "career", "competencies"].includes(route[4])))) {
    return <CurriculumMapWorkspace id={route[3]} view={route[4]} />;
  }
  if (normalizedPath === curriculumPlansPath) return <CurriculumPlans />;
  if (normalizedPath === programRegistrationPath || normalizedPath === programRegistrationPath + "/register" ||
    (route[0] === "services" && route[1] === "7-3" && route[2] === "progress" && route.length === 4)) {
    return <ProgramRegistrationWorkspace key={user.id + normalizedPath} userId={user.id}
      view={route[2] === "progress" ? "progress" : route[2] === "register" ? "choose" : "list"} code={route[3]} />;
  }
  if (normalizedPath === courseSubstitutionPath) return <CourseSubstitutionWorkspace key={normalizedPath} />;
  if (route[0] === "services" && route[1] === "12-8" && route[2] === "results" && route.length === 6) {
    return <CourseSubstitutionWorkspace key={normalizedPath + hash}
      selection={{year:route[3],track:route[4],department:route[5]}} />;
  }
  if (normalizedPath === interdisciplinaryProgramsPath) return <InterdisciplinaryPrograms />;
  if (route[0] === "services" && route[1] === "12-6" && route[2] === "program" && route.length === 4) {
    return <InterdisciplinaryPrograms code={route[3]} />;
  }
  if (route[0] === "services" && route[1] === "12-5") {
    if (route[2] === "program" && (route.length === 4 || (route.length === 5 && route[4] === "archive"))) {
      return <CurriculumPlans program={route[3]} archive={route[4] === "archive"} />;
    }
    if (route[2] === "plan" && route.length === 4) return <CurriculumPlans code={route[3]} />;
  }
  if (normalizedPath === parkingPermitPath || normalizedPath === parkingInstructionsPath) {
    return <ParkingPermitWorkspace instructions={normalizedPath === parkingInstructionsPath} />;
  }
  if (normalizedPath === serviceLeadershipPath) return <ServiceLeadershipWorkspace />;
  const leadershipView = serviceLeadershipViews.find(item => normalizedPath === serviceLeadershipPath + "/" + item.key);
  if (leadershipView) return <ServiceLeadershipWorkspace key={leadershipView.key} view={leadershipView} />;
  if (servicePage && route.length === 3 && route[2] === "notes" && ["4-2", "6-1", "6-2", "6-3", "6-4", "7-2", "7-3", "7-4", "7-5", "7-6", "10-1", "16-1", "12-5", "12-6", "12-7", "12-8", "25-1", "25-2", "28-1", "29-1", "42-1", "46-1"].includes(route[1])) {
    return <StudentServiceWorkspace key={pathname} userId={user.id} serviceKey={route[1]} view="" />;
  }
  if (normalizedPath === teachingAssistantPath || normalizedPath === "/school-affairs/services/25-2") {
    return <TeachingAssistantWorkspace view="" />;
  }
  if (normalizedPath === `${teachingAssistantPath}/report` || normalizedPath === `${teachingAssistantPath}/evaluation`) {
    return <TeachingAssistantWorkspace key={normalizedPath} view={normalizedPath.endsWith("/report") ? "report" : "evaluation"} />;
  }
  if (normalizedPath === tutorEvaluationPath) {
    const name = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : displayName;
    return <TutorEvaluationWorkspace key={user.id} userId={user.id} displayName={name} />;
  }
  if (normalizedPath === `${exchangeGrantPath}/notes`) {
    return <StudentServiceWorkspace key={pathname} userId={user.id} serviceKey="23-1" view="" />;
  }
  if (normalizedPath === exchangeGrantPath || ["conference", "exchange", "reports", "receipts", "conference/application"]
    .some(view => normalizedPath === `${exchangeGrantPath}/${view}`)) {
    const name = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "";
    return <ExchangeGrantWorkspace key={normalizedPath} view={normalizedPath.slice(exchangeGrantPath.length + 1)}
      userId={user.id} displayName={name} />;
  }
  if (normalizedPath === `${feeRemissionPath}/notes`) {
    return <StudentServiceWorkspace key={pathname} userId={user.id} serviceKey="21-3" view="" />;
  }
  if (normalizedPath === feeRemissionPath) {
    return <FeeRemissionWorkspace key={user.id} userId={user.id} />;
  }
  if (normalizedPath === "/school-affairs/services/21-2") {
    return <EducationFundWorkspace/>;
  }
  if (servicePage && route[1] === "leave") {
    return <StudentLeaveWorkspace key={pathname} userId={user.id} view={route.slice(2).join("/")} />;
  }
  if (servicePage && route[1] === "internship") {
    return <StudentServiceWorkspace key={pathname} userId={user.id} serviceKey="internship" view={route.slice(2).join("/")} />;
  }
  if (servicePage && route[1] === "9-1") {
    return <StudentScholarshipWorkspace key={pathname} userId={user.id} />;
  }
  if (servicePage && route[1] === "22-1") {
    return <StudentAidWorkspace key={pathname} userId={user.id} />;
  }
  if (academicGradeView) {
    return <AcademicGrades key={pathname} snapshot={account ?? null} busy={accountLoading} error={accountError} onReload={refreshAccount} onLogout={()=>navigate("/school-affairs/signed-out")} view={academicGradeView}/>;
  }
  if (normalizedPath === graduationReviewPaths.academic_services || normalizedPath === "/school-affairs/services/15-1") {
    return <GraduationReview key={pathname} snapshot={account ?? null} busy={accountLoading} error={accountError} onReload={refreshAccount} onLogout={()=>navigate("/school-affairs/signed-out")}/>;
  }
  if (normalizedPath === graduationReviewPaths.legacy) {
    return <LegacyGraduationReview key={pathname} snapshot={account ?? null} busy={accountLoading} error={accountError} onReload={refreshAccount}/>;
  }
  if (normalizedPath === academicAttendancePaths.statistics || normalizedPath === academicAttendancePaths.detail) {
    return <AcademicAttendance key={pathname} snapshot={account ?? null} busy={accountLoading} error={accountError} onReload={refreshAccount} onLogout={()=>navigate("/school-affairs/signed-out")} view={normalizedPath === academicAttendancePaths.detail ? "detail" : "statistics"}/>;
  }
  if (normalizedPath === enrollmentCertificatePath) {
    return <EnrollmentCertificateWorkspace key={user.id} userId={user.id} onLogout={()=>navigate("/school-affairs/signed-out")}/>;
  }
  if (normalizedPath === studentConductPath) {
    const identity = !accountLoading && !accountError && account?.profile.userId === user.id && account.student
      ? {userId:user.id,studentNumber:account.student.studentNumber,studentName:account.student.fullName} : null;
    return <StudentConductWorkspace key={user.id} userId={user.id} identity={identity}
      identityLoading={accountLoading} identityError={accountError} onReloadIdentity={refreshAccount}/>;
  }
  if (normalizedPath === dormitoryConductPath) {
    const identity = !accountLoading && !accountError && account?.profile.userId === user.id && account.student
      ? {userId:user.id} : null;
    return <DormConductWorkspace key={user.id} userId={user.id} identity={identity}
      identityLoading={accountLoading} identityError={accountError} onReloadIdentity={refreshAccount}
      onHome={()=>navigate("/school-affairs")}/>;
  }
  const loanView = (Object.keys(studentLoanPaths) as StudentLoanView[]).find(view => studentLoanPaths[view] === normalizedPath);
  if (loanView) {
    return <StudentLoanWorkspace key={user.id} userId={user.id} view={loanView}
      onNavigate={(view,options)=>{if(options?.newTab)window.open(studentLoanPaths[view],"_blank","noopener,noreferrer");else navigate(studentLoanPaths[view]);}}
      onLogout={()=>navigate("/school-affairs/signed-out")}
      onInformation={()=>window.location.assign(referenceHref("https://life.sao.stu.edu.tw/就學貸款/"))}/>;
  }
  const tuitionView = (Object.keys(tuitionDocumentPaths) as TuitionView[]).find(view => tuitionDocumentPaths[view] === normalizedPath);
  if (tuitionView) {
    return <TuitionDocumentsWorkspace key={pathname} userId={user.id} view={tuitionView} onLogout={()=>navigate("/school-affairs/signed-out")}/>;
  }
  if (servicePage && ["11-1", "11-2"].includes(route[1])) {
    return <CourseSelection key={pathname+search} snapshot={account ?? null} busy={accountLoading} error={accountError} onReload={refreshAccount} onLogout={()=>navigate("/school-affairs/signed-out")} view={route[1] === "11-1" ? "history" : "timetable"}/>;
  }
  if (servicePage && route[1] === "11-3") {
    return <CreditLoadHistory key={pathname} userId={user.id} />;
  }
  if (servicePage && route[1] === "39-1") {
    return <PendingFees key={pathname} userId={user.id} />;
  }
  if (servicePage && route[1] === "12-4") {
    return <CourseCatalog userId={user.id} />;
  }
  if (normalizedPath === repairPaths.report || /^\/school-affairs\/services\/45-1\/area\/AR[0-9]{4}$/.test(normalizedPath)) {
    const ownsProfile = !accountLoading && !accountError && account?.profile.userId === user.id;
    return <FacilityRepairWorkspace key={user.id} userId={user.id} view="report"
      areaCode={normalizedPath === repairPaths.report ? undefined : route.at(-1)}
      applicantName={ownsProfile ? (account.student?.fullName || account.profile.displayName) : undefined}
      applicantCode={ownsProfile ? account.student?.studentNumber : undefined}/>;
  }
  for (const [view, base] of [["history", repairPaths.history], ["manage", repairPaths.manage]] as const) {
    const id = normalizedPath.slice(base.length + 1);
    if (normalizedPath === base || (normalizedPath.startsWith(base + "/") && !id.includes("/"))) {
      return <FacilityRepairWorkspace key={user.id + normalizedPath} userId={user.id}
        view={view} id={normalizedPath === base ? undefined : id} />;
    }
  }
  if (normalizedPath === permanentCoursesPath) return <PermanentCourseCatalog />;
  if (normalizedPath === venuePaths.apply || normalizedPath === venuePaths.schedule || normalizedPath === venuePaths.manage) {
    return <VenueWorkspace key={user.id+normalizedPath+search} userId={user.id}
      view={normalizedPath===venuePaths.manage?'manage':normalizedPath===venuePaths.apply?'apply':'schedule'}/>;
  }
  if (normalizedPath === syllabusSearchPath) {
    return <SyllabusSearchRoute userId={user.id} />;
  }
  if (servicePage && ["26-1", "34-1"].includes(route[1])) {
    return <HousingWorkspace key={pathname} userId={user.id} mode={route[1]==="34-1"?"history":"application"} />;
  }
  return (
    <div
      className={`affairs-portal ${preferences.contained ? "is-contained" : ""} ${preferences.alternateActive ? "alt-active" : ""}`}
      data-skin={preferences.theme}
      style={styles}
    >
      <a href="#portal-content" className="portal-skip">
        跳至主要內容
      </a>
      <header
        className={`portal-navbar ${preferences.fixedNavbar ? "is-fixed" : ""}`}
      >
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="portal-mobile-toggle"
              aria-label="開啟校務選單"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="affairs-portal affairs-mobile-sheet"
            style={styles}
          >
            <SheetTitle>校務選單</SheetTitle>
            <SheetDescription className="sr-only">
              校務系統的本地介面預覽導覽
            </SheetDescription>
            {renderNavigation(true)}
          </SheetContent>
        </Sheet>
        <Link className="portal-brand" to="/school-affairs">
          <img
            src={referenceAsset(
              "https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg",
            )}
            width="30"
            height="33"
            alt=""
          />
          <span>校務資訊系統</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="portal-user"
              data-campus-assistant-menu
              aria-label={`Welcome, ${displayName} 帳號選單`}
            >
              <img
                src={referenceAsset(
                  "https://info.stu.edu.tw/ePortal/assets/images/stuUser.png",
                )}
                width="32"
                height="32"
                alt=""
              />
              <span>
                <small lang="en">Welcome,</small>
                <span>{displayName}</span>
              </span>
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="affairs-account-menu">
            <DropdownMenuLabel>stu.best · Google account</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/school-affairs/notifications">個人使用者通知查詢</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/school-affairs/bookmarks">使用者收藏校園公告查詢</Link>
            </DropdownMenuItem>
            {verifiedAdmin && <DropdownMenuItem asChild>
              <Link to="/school-affairs/admin/records">School Affairs administration</Link>
            </DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(campusAssistantOpenEvent))}>
              校園助理
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/signin?next=%2Fapp%2Fknowledge">知識庫管理</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/school-affairs/privacy">Privacy &amp; account information</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/school-affairs/signed-out">Logout（登出）</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div
        className={`portal-shell ${preferences.collapsed ? "is-collapsed" : ""}`}
      >
        <aside
          className={`portal-sidebar ${preferences.fixedSidebar ? "is-fixed" : ""}`}
        >
          {renderNavigation()}
        </aside>
        <div className="portal-workspace">
          <div
            className={`portal-breadcrumbs ${preferences.fixedBreadcrumbs ? "is-fixed" : ""}`}
          >
            <PortalIcon glyph={"\uf015"} />
            <Link to="/school-affairs">Index</Link>
            {!index && (
              <>
                <span aria-hidden="true">›</span>
                <span>
                  {validMenu
                    ? "Menu"
                    : announcementEmail
                      ? "校園公告E-MAIL設定"
                    : servicePage
                      ? "服務 · Service"
                    : bookmarks
                      ? "已收藏消息查詢"
                      : notifications
                        ? "通知訊息查詢"
                        : adminRecords ? "School Affairs administration" : "預覽"}
                </span>
              </>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="portal-settings-trigger"
                  aria-label="介面設定"
                >
                  <PortalIcon glyph={"\uf013"} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="affairs-settings"
                aria-label="介面設定"
              >
                <h2>Choose Skin</h2>
                <div className="portal-skin-options">
                  {(["blue", "dark", "pink", "light"] as const).map((skin) => (
                    <Button
                      key={skin}
                      type="button"
                      aria-label={`${skin} skin`}
                      aria-pressed={preferences.theme === skin}
                      data-skin={skin}
                      onClick={() => update("theme", skin)}
                    >
                      {skin}
                    </Button>
                  ))}
                </div>
                {settingsFields.map(([key, label], idx) => (
                  <div key={key}>
                    {idx === 4 && (
                      <div className="portal-font-size">
                        <span>Font Size</span>
                        <Button
                          variant="outline"
                          aria-label="+A 放大字體"
                          disabled={preferences.fontSize >= 20}
                          onClick={() =>
                            update(
                              "fontSize",
                              Math.min(20, preferences.fontSize + 1),
                            )
                          }
                        >
                          +A
                        </Button>
                        <Button
                          variant="outline"
                          aria-label="-A 縮小字體"
                          disabled={preferences.fontSize <= 12}
                          onClick={() =>
                            update(
                              "fontSize",
                              Math.max(12, preferences.fontSize - 1),
                            )
                          }
                        >
                          -A
                        </Button>
                        <output aria-label="字體大小">
                          {preferences.fontSize}
                        </output>
                      </div>
                    )}
                    <Label htmlFor={`portal-setting-${key}`}>
                      <Checkbox
                        id={`portal-setting-${key}`}
                        checked={preferences[key]}
                        onCheckedChange={(value) => update(key, value === true)}
                      />
                      {label}
                    </Label>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <main id="portal-content" tabIndex={-1} className="portal-content">
            {storageError && (
              <p className="portal-storage-error" role="alert">
                瀏覽器無法儲存設定；本次操作仍可使用，重新整理後可能重設。
              </p>
            )}
            {index && (
              <div className="portal-index">
                <h1 className="sr-only">校務系統入口</h1>
                <PortalWidget title="系統作業通知" icon={Settings} count={account?.announcements.length}>
                  <ul className="portal-lined-list">
                    {accountLoading && !account && <li role="status">載入中…</li>}
                    {account?.announcements.map(notice => (
                      <li key={notice.id}><Link to="/school-affairs/records">{notice.title}</Link></li>
                    ))}
                    {account?.announcements.length === 0 && <li>目前沒有系統作業通知。</li>}
                  </ul>
                </PortalWidget>
                <PortalWidget title="最新通知" icon={Mail} count={account?.requests.length}>
                  {renderNotifications()}
                </PortalWidget>
                <PortalWidget title="最新消息" count={portalNews.filter(news => news.category === "news").length}>
                  {renderNewsRows("news")}
                </PortalWidget>
                <PortalWidget title="常用選單" icon={Menu} count={6} common>
                  <ul className="portal-lined-list">
                    {commonPrograms.slice(0, 6).map((program, index) => (
                      <li key={index}>{renderProgramLink(program)}</li>
                    ))}
                  </ul>
                </PortalWidget>
                <PortalWidget title="疫情資訊">
                  {renderNewsRows("health")}
                </PortalWidget>
              </div>
            )}
            {adminRecords && <SchoolAccountAdmin key={user.id} userId={user.id} identity={account} identityLoading={accountLoading} identityError={accountError} onReloadIdentity={refreshAccount} />}
            {validMenu && (
              <>
                <h1 className="sr-only">
                  {selectedGroup?.label || "校務系統"} · {selectedLabel}
                </h1>
                <div className="portal-search">
                  <label className="sr-only" htmlFor="portal-program-search">
                    系統名稱關鍵字
                  </label>
                  <Input
                    ref={searchRef}
                    id="portal-program-search"
                    type="search"
                    placeholder="輸入系統名稱關鍵字"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <span>查詢程式連結</span>
                  <output aria-live="polite">
                    {query ? `${programs.length} 個結果` : ""}
                  </output>
                </div>
                <header className="portal-table-heading">
                  <h2>
                    <List aria-hidden="true" />
                    {selectedGroup?.label || "系統列表及搜尋"}
                  </h2>
                  {!listView && (
                    <Button
                      variant="ghost"
                      className="portal-customize"
                      aria-pressed={customizing}
                      onClick={() => setCustomizing(!customizing)}
                    >
                      自訂選單設定: <span>{customizing ? "YES" : "NO"}</span>
                    </Button>
                  )}
                </header>
                {programs.length === 0 ? (
                  <div className="portal-empty" role="status">
                    <p>
                      {query
                        ? "找不到符合的系統。"
                        : view === "custom"
                          ? "尚未加入自訂選單。"
                          : "此選單目前沒有可用的系統。"}
                    </p>
                    {view === "custom" && !query ? (
                      <p>
                        到任一系統列表開啟「自訂選單設定」，選取星號即可加入。
                        <Link to={menuPath("aca", "all")}>前往教務系統</Link>
                      </p>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          searchRef.current?.focus();
                        }}
                      >
                        清除搜尋
                      </Button>
                    )}
                  </div>
                ) : listView ? (
                  <ul className="portal-lined-list portal-menu-list">
                    {programs.map((program, idx) => (
                      <li key={`${program.id}-${idx}`}>
                        {renderProgramLink(program)}
                        {view === "custom" && (
                          <Button
                            variant="ghost"
                            aria-label={`移除自訂選單：${program.title}`}
                            onClick={() => toggleFavorite(program.id)}
                          >
                            <X />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="portal-table-scroll">
                    <table className="portal-program-table">
                      <caption className="sr-only">
                        {selectedLabel}程式列表
                      </caption>
                      <colgroup>
                        <col className="portal-kind-column" />
                        <col className="portal-section-column" />
                        <col />
                      </colgroup>
                      <tbody>
                        {programRows.map((row, idx) => {
                          const first =
                            idx === 0 || programRows[idx - 1].kind !== row.kind;
                          let span = 1;
                          while (
                            idx + span < programRows.length &&
                            programRows[idx + span].kind === row.kind
                          )
                            span++;
                          return (
                            <tr key={`${row.kind}-${row.section}`}>
                              {first && (
                                <th
                                  className="portal-kind"
                                  scope="rowgroup"
                                  rowSpan={span}
                                >
                                  <span>
                                    {kindLabels[row.kind] || row.kind}
                                  </span>
                                </th>
                              )}
                              <th
                                scope="row"
                                className="portal-program-section"
                              >
                                {row.section}
                              </th>
                              <td>
                                {row.programs.map((program) => (
                                  <span
                                    className="portal-program"
                                    key={program.id}
                                  >
                                    {renderProgramLink(program)}
                                    {customizing && (
                                      <Button
                                        variant="ghost"
                                        aria-label={`${preferences.favorites.includes(program.id) ? "移除" : "加入"}自訂選單：${program.title}`}
                                        aria-pressed={preferences.favorites.includes(
                                          program.id,
                                        )}
                                        onClick={() =>
                                          toggleFavorite(program.id)
                                        }
                                      >
                                        <Star
                                          fill={
                                            preferences.favorites.includes(
                                              program.id,
                                            )
                                              ? "currentColor"
                                              : "none"
                                          }
                                        />
                                      </Button>
                                    )}
                                  </span>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {(bookmarks || notifications) && (
              <>
                <h1 className="portal-page-title">
                  {bookmarks ? "已收藏消息查詢" : "通知訊息查詢"}
                </h1>
                {bookmarks && <p className="portal-local-note">
                  此瀏覽器中此帳號的收藏；不讀取或修改校方帳號。
                </p>}
                {bookmarks ? (
                  <ul className="portal-lined-list">
                    {portalNews
                      .filter((n) => preferences.bookmarks.includes(n.id))
                      .map((news) => (
                        <li key={news.id}>
                          <Button
                            variant="ghost"
                            onClick={(event) =>
                              openArticle(news.id, event.currentTarget)
                            }
                          >
                            {news.title}
                          </Button>
                        </li>
                      ))}
                    {preferences.bookmarks.length === 0 && (
                      <li>尚未收藏消息。可在公告視窗按下收藏圖示。</li>
                    )}
                  </ul>
                ) : renderNotifications()}
              </>
            )}
            {ended && (
              <section className="portal-ended">
                <h1>已離開校務介面預覽</h1>
                <p>這只會離開本地展示，不會登出校方帳號或 STU Nexus。</p>
                <Link to="/school-affairs">返回校務介面預覽</Link>
                <Link to="/在校學生/">返回在校學生</Link>
              </section>
            )}
            {announcementEmail && <AnnouncementEmailSettings key={user.id} userId={user.id}/>}
            {servicePage && !announcementEmail && <StudentServiceWorkspace key={pathname} userId={user.id} serviceKey={route[1] || ""} view={route.slice(2).join("/")} />}
            {!index && !validMenu && !bookmarks && !notifications && !adminRecords && !ended && !servicePage && (
              <section className="portal-ended">
                <h1>找不到選單</h1>
                <Link to="/school-affairs">返回 Index</Link>
              </section>
            )}
          </main>
          <footer className="portal-footer">
            stu.best School Affairs <span>· Independent campus website</span>
          </footer>
        </div>
      </div>
      <Dialog
        open={Boolean(article)}
        onOpenChange={(open) => {
          if (!open) closeArticle();
        }}
      >
        <DialogContent
          className="affairs-news-dialog"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (lastNewsTrigger.current?.isConnected)
              lastNewsTrigger.current.focus();
            else document.getElementById("portal-content")?.focus();
          }}
        >
          <header>
            <DialogTitle>{article?.title}</DialogTitle>
            <DialogDescription>
              來源介面擷取日期：2026/11/02 · 公告內容預覽
            </DialogDescription>
            <DialogClose asChild>
              <Button variant="ghost" aria-label="關閉公告">
                <X />
              </Button>
            </DialogClose>
          </header>
          <article>
            <p>{article?.summary}</p>
            <p>連結</p>
            <a
              href="https://www.stu.edu.tw/latestnews/"
              target="_blank"
              rel="noreferrer"
            >
              校園公告原始網站 ↗
            </a>
            <p className="portal-local-note">
              完整公告、附件及實際發布資訊以校方網站為準。
            </p>
          </article>
          <footer>
            <Button
              variant="ghost"
              aria-label={
                article && preferences.bookmarks.includes(article.id)
                  ? "取消收藏公告"
                  : "收藏公告"
              }
              aria-pressed={Boolean(
                article && preferences.bookmarks.includes(article.id),
              )}
              onClick={() => {
                if (article)
                  update(
                    "bookmarks",
                    preferences.bookmarks.includes(article.id)
                      ? preferences.bookmarks.filter((id) => id !== article.id)
                      : [...preferences.bookmarks, article.id],
                  );
              }}
            >
              <Bookmark
                fill={
                  article && preferences.bookmarks.includes(article.id)
                    ? "currentColor"
                    : "none"
                }
              />
            </Button>
            <span role="status">{copyStatus}</span>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(
                      `/school-affairs?news=${article?.id}`,
                      location.origin,
                    ).href,
                  );
                  setCopyStatus("已複製預覽連結");
                } catch {
                  setCopyStatus("無法存取剪貼簿；可複製網址列的預覽連結。");
                }
              }}
            >
              複製連結
            </Button>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </footer>
        </DialogContent>
      </Dialog>
    </div>
  );
}
