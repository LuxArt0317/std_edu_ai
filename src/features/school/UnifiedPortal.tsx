import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  useCallback,
  useEffect,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
const CRMApp = lazy(() => import("../crm/CRMApp"));
import type { CrmSection } from "../crm/types";
import type { CrmUser } from "../crm/authService";
import { clearCrmDataSnapshot } from "../crm/crmRepository";
const StudentLmsLearning = lazy(() =>
  import("./LmsWorkspace").then((module) => ({
    default: module.StudentLmsLearning,
  })),
);
const TeacherLmsStudio = lazy(() =>
  import("./LmsWorkspace").then((module) => ({
    default: module.TeacherLmsStudio,
  })),
);
import "./platform.css";
import {
  clearPlatformDataSnapshot,
  getPlatformDataSnapshot,
  loadPlatformDataCached,
} from "./platformRepository";
const AcademicsView = lazy(() =>
  import("./portal/academics").then((module) => ({
    default: module.AcademicsView,
  })),
);
const AssessmentsView = lazy(() =>
  import("./portal/assessments").then((module) => ({
    default: module.AssessmentsView,
  })),
);
import { SchoolAssistant } from "./portal/assistant";
const GradesView = lazy(() =>
  import("./portal/grades").then((module) => ({ default: module.GradesView })),
);
import { HomeView } from "./portal/home";
import { NotificationCenter } from "./portal/notifications";
const PeopleView = lazy(() =>
  import("./portal/people").then((module) => ({ default: module.PeopleView })),
);
const ScheduleView = lazy(() =>
  import("./portal/schedule").then((module) => ({
    default: module.ScheduleView,
  })),
);
import type { NexusActivityState, PortalView } from "./portal/shared";
import {
  crmRoles,
  navigationFor,
  navMeta,
  supportViews,
  PortalLoading,
  roleNames,
  teachingRoles,
} from "./portal/shared";
import type { PlatformData, PlatformRole } from "./types";
function PortalNavigation({
  navigation,
  view,
  onNavigate,
  assessmentCount,
}: {
  navigation: PortalView[];
  view: PortalView;
  onNavigate: (view: PortalView) => void;
  assessmentCount: number;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarContent className="px-4">
      <nav aria-label="School navigation">
        <p className="mb-3 px-3 text-xs font-medium tracking-wide text-sidebar-foreground/70">
          YOUR WORKSPACE
        </p>
        <SidebarMenu>
          {navigation.map((item) => (
            <SidebarMenuItem key={item}>
              {item === "crm" ? <p className="mt-5 mb-2 px-3 text-xs font-medium text-sidebar-foreground/70">STUDENT SERVICES</p> : null}
              <SidebarMenuButton
                className="h-11"
                isActive={view === item}
                aria-current={view === item ? "page" : undefined}
                onClick={() => {
                  onNavigate(item);
                  setOpenMobile(false);
                }}
              >
                <i aria-hidden="true" className="w-5 text-center not-italic">
                  {navMeta[item].icon}
                </i>
                <span>{navMeta[item].label}</span>
                {item === "assessments" && assessmentCount ? (
                  <span className="ml-auto text-xs">{assessmentCount}</span>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </nav>
    </SidebarContent>
  );
}

function UnifiedPortal({
  currentUser,
  onSignOut,
}: {
  currentUser: CrmUser;
  onSignOut: () => void;
}) {
  const [data, setData] = useState<PlatformData | null>(() =>
    getPlatformDataSnapshot(currentUser.id),
  );
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<PortalView>("home");
  const [previewRole, setPreviewRole] = useState<PlatformRole>(
    currentUser.role,
  );
  const [toast, setToast] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantActivity, setAssistantActivity] =
    useState<NexusActivityState>("idle");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState("");

  const refresh = useCallback(
    async (silent = false) => {
      try {
        const nextData = await loadPlatformDataCached(currentUser.id, true);
        setData(nextData);
        setLoadError("");
        return nextData;
      } catch (error) {
        if (!silent && !getPlatformDataSnapshot(currentUser.id)) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "The platform could not be loaded.",
          );
        } else {
          setToast(
            "Could not sync the latest updates. Showing your saved workspace.",
          );
        }
        return getPlatformDataSnapshot(currentUser.id);
      }
    },
    [currentUser.id],
  );

  useEffect(() => {
    void refresh(Boolean(getPlatformDataSnapshot(currentUser.id)));
  }, [currentUser.id, refresh]);

  function signOut() {
    clearPlatformDataSnapshot();
    clearCrmDataSnapshot();
    onSignOut();
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const effectiveRole = currentUser.isOwner ? previewRole : currentUser.role;
  const navigation = navigationFor(effectiveRole);

  useEffect(() => {
    if (!navigation.includes(view))
      setView(
        view === "learning" && teachingRoles.has(effectiveRole)
          ? "teaching"
          : "home",
      );
  }, [effectiveRole, navigation, view]);

  const showingCrm = supportViews.includes(view) && crmRoles.has(effectiveRole);

  if (!data && !loadError) return <PortalLoading />;
  if (!data)
    return (
      <div className="school-loading error">
        <span>!</span>
        <strong>Unable to load STU Nexus</strong>
        <p>{loadError}</p>
        <Button type="button" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );

  return (
    <>
      <SidebarProvider
        className="school-shell"
        style={{ "--sidebar-width": "274px" } as CSSProperties}
      >
        <a className="school-skip-link" href="#school-workspace-content">
          Skip to workspace content
        </a>
        <Sidebar className="school-sidebar translate-x-0! p-0! shadow-none">
          <SidebarHeader className="p-4">
            <a className="school-brand" href="/">
              <span>樹</span>
              <div>
                <b>STU NEXUS</b>
                <small>One School · One Platform</small>
              </div>
            </a>
            <div className="school-role-card">
              <span>{currentUser.initials}</span>
              <div>
                <b>{currentUser.name}</b>
                <small>{roleNames[currentUser.role]}</small>
              </div>
              {currentUser.isOwner ? <i>OWNER</i> : null}
            </div>
          </SidebarHeader>
          <PortalNavigation
            navigation={navigation}
            view={view}
            onNavigate={setView}
            assessmentCount={data.assessments.length}
          />
          <SidebarFooter>
            <div className="school-sidebar-foot">
              <Button type="button" onClick={() => setAssistantOpen(true)}>
                ✦ <span>Ask Nexus AI</span>
              </Button>
              <div>
                <span className="live-dot" />
                <p>
                  <b>Production connected</b>
                  <small>Supabase RLS active</small>
                </p>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset
          className="school-main ml-0! min-w-0"
          id="school-workspace-content"
        >
          <header className="school-topbar">
            <SidebarTrigger
              className="school-menu md:hidden"
              aria-label="Open navigation"
            />
            <div className="school-breadcrumb">
              <span>STU Nexus</span>
              <b>/</b>
              <strong>{navMeta[view].label}</strong>
            </div>
            <div className="school-top-actions">
              {currentUser.isOwner ? (
                <Label className="role-preview flex items-center gap-3">
                  <span>View as</span>
                  <NativeSelect
                    value={previewRole}
                    onChange={(event) =>
                      setPreviewRole(event.target.value as PlatformRole)
                    }
                  >
                    {data.roles.map((role) => (
                      <NativeSelectOption key={role.code} value={role.code}>
                        {role.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Label>
              ) : null}
              <Button
                type="button"
                className="school-alert"
                title="Notifications"
                onClick={() => { setNotificationsOpen(true); void refresh(true); }}
                variant="ghost"
              >
                ♢
                <b>
                  {data.notifications.filter((item) => !item.readAt).length}
                </b>
              </Button>
              <Button type="button" className="school-user" onClick={signOut}>
                {currentUser.initials}
                <span>Sign out</span>
              </Button>
            </div>
          </header>

          {currentUser.isOwner && effectiveRole !== "owner" ? (
            <div className="preview-banner">
              <span>OWNER PREVIEW</span>
              <p>
                You are safely previewing the{" "}
                <strong>{roleNames[effectiveRole]}</strong> interface. Your
                database permissions remain owner-level for auditing.
              </p>
              <Button type="button" onClick={() => setPreviewRole("owner")}>
                Exit preview
              </Button>
            </div>
          ) : null}

          <Suspense
            fallback={
              <div className="p-8" role="status">
                Loading workspace…
              </div>
            }
          >
            <div className="school-content" data-workspace={view}>
              <section
                className="school-workspace-context"
                aria-label="Current workspace context"
              >
                <span>
                  <i /> Live role-scoped data
                </span>
                <b>{navMeta[view].label}</b>
                <small>{roleNames[effectiveRole]} access</small>
              </section>
              {showingCrm ? <CRMApp
                key={`${currentUser.id}:${currentUser.role}`}
                currentUser={currentUser}
                activeSection={(view === "crm" ? "command" : view) as CrmSection}
                onSectionChange={(section) => setView(section === "command" ? "crm" : section)}
              /> : null}
              {view === "home" ? (
                <HomeView
                  data={data}
                  role={effectiveRole}
                  user={currentUser}
                  onNavigate={setView}
                  onAsk={() => setAssistantOpen(true)}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                />
              ) : null}
              {view === "academics" ? (
                <AcademicsView
                  data={data}
                  currentUser={currentUser}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                  onAskNexus={() => setAssistantOpen(true)}
                  onOpenSectionWorkspace={(destination, sectionId) => {
                    setFocusedSectionId(sectionId);
                    setView(destination);
                  }}
                />
              ) : null}
              {view === "learning" ? (
                <StudentLmsLearning
                  data={data}
                  currentUser={currentUser}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                  mode={effectiveRole === "student" ? "student" : "review"}
                  initialSectionId={focusedSectionId}
                />
              ) : null}
              {view === "teaching" ? (
                <TeacherLmsStudio
                  data={data}
                  currentUser={currentUser}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                  initialSectionId={focusedSectionId}
                />
              ) : null}
              {view === "assessments" ? (
                <AssessmentsView
                  data={data}
                  role={effectiveRole}
                  initialSectionId={focusedSectionId}
                  onComplete={(message) => {
                    setToast(message);
                    void refresh(true);
                  }}
                />
              ) : null}
              {view === "grades" ? (
                <GradesView
                  data={data}
                  role={effectiveRole}
                  initialSectionId={focusedSectionId}
                  currentUser={currentUser}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                />
              ) : null}
              {view === "schedule" ? (
                <ScheduleView
                  data={data}
                  currentUser={currentUser}
                  initialSectionId={focusedSectionId}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                />
              ) : null}
              {view === "people" ? (
                <PeopleView
                  data={data}
                  currentUser={currentUser}
                  onChanged={() => void refresh(true)}
                  onToast={setToast}
                />
              ) : null}
            </div>
          </Suspense>
        </SidebarInset>

        <SchoolAssistant
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          data={data}
          view={view}
          role={currentUser.role}
          actorId={currentUser.id}
          onNavigate={setView}
          onDataChanged={() => refresh(true)}
          onActivityChange={setAssistantActivity}
        />
        {notificationsOpen ? (
          <NotificationCenter
            data={data}
            currentUser={currentUser}
            onClose={() => setNotificationsOpen(false)}
            onChanged={() => void refresh(true)}
            onToast={setToast}
          />
        ) : null}
        {toast ? (
          <div className="school-toast">
            <span>✓</span>
            {toast}
          </div>
        ) : null}
        <Button
          className={`school-ai-fab ${assistantActivity}`}
          type="button"
          onClick={() => setAssistantOpen(true)}
        >
          ✦
          <span>
            {["thinking", "executing", "refreshing"].includes(assistantActivity)
              ? "Nexus working"
              : assistantActivity === "waiting"
                ? "Review action"
                : assistantActivity === "complete"
                  ? "Goal complete"
                  : assistantActivity === "blocked"
                    ? "Needs attention"
                    : "Ask Nexus"}
          </span>
        </Button>
      </SidebarProvider>

    </>
  );
}

export default UnifiedPortal;
