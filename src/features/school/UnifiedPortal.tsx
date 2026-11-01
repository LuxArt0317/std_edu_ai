import { Bell, ChevronUp, LogOut, MessageSquare, SunMoon, Eye } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
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
        <SidebarMenu>
          {navigation.map((item) => { const Icon = navMeta[item].icon; return (
            <SidebarMenuItem key={item}>
              {item === "crm" || item === "academics" ? <p className="nav-group-label">{item === "crm" ? "Student services" : "Administration"}</p> : null}
              <SidebarMenuButton
                className="h-9"
                isActive={view === item}
                aria-current={view === item ? "page" : undefined}
                onClick={() => {
                  onNavigate(item);
                  setOpenMobile(false);
                }}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                <span>{navMeta[item].label}</span>
                {item === "assessments" && assessmentCount ? (
                  <span className="ml-auto text-xs">{assessmentCount}</span>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ); })}
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
  const { theme, setTheme } = useTheme();
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
  const [, setAssistantActivity] =
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

  function closeAssistant() {
    setAssistantOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-assistant-launcher]")?.focus());
  }
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
  const navigation = navigationFor(effectiveRole).sort((left, right) => {
    const group = (item: PortalView) => ["academics", "people"].includes(item) ? 2 : supportViews.includes(item) ? 1 : 0;
    return group(left) - group(right);
  });

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
        <Button variant="outline" type="button" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );

  return (
    <>
      <SidebarProvider
        className="school-shell"
        style={{ "--sidebar-width": "232px" } as CSSProperties}
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
                <small>School portal</small>
              </div>
            </a>
          </SidebarHeader>
          <PortalNavigation
            navigation={navigation}
            view={view}
            onNavigate={setView}
            assessmentCount={data.assessments.length}
          />
          <SidebarFooter className="border-t p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="account-menu w-full justify-start" aria-label="Account menu">
                  <span className="account-initials">{currentUser.initials}</span>
                  <span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm font-medium">{currentUser.name}</strong><small className="block text-xs text-muted-foreground">{roleNames[currentUser.role]}</small></span>
                  <ChevronUp className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel>{currentUser.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><SunMoon className="size-4" />Appearance</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent><DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>{["light", "dark", "system"].map(mode => <DropdownMenuRadioItem key={mode} value={mode}>{mode[0].toUpperCase()+mode.slice(1)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent>
                </DropdownMenuSub>
                {currentUser.isOwner ? <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Eye className="size-4" />Preview role</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-96 overflow-y-auto"><DropdownMenuRadioGroup value={previewRole} onValueChange={value => setPreviewRole(value as PlatformRole)}>{data.roles.map(role => <DropdownMenuRadioItem key={role.code} value={role.code}>{roleNames[role.code]}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent>
                </DropdownMenuSub> : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}><LogOut className="size-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <div className="school-breadcrumb"><span>School</span></div>
            <div className="school-top-actions">
              <Button data-assistant-launcher type="button" variant="ghost" size="sm" onClick={() => setAssistantOpen(true)}><MessageSquare className="size-4" aria-hidden="true" />Assistant</Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Notifications" className="relative" onClick={() => { setNotificationsOpen(true); void refresh(true); }}>
                <Bell className="size-4" aria-hidden="true" />
                {data.notifications.some(item => !item.readAt) ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /> : null}
              </Button>
            </div>
          </header>

          {currentUser.isOwner && effectiveRole !== "owner" ? (
            <div className="preview-banner">

              <p>
                Previewing{" "}
                <strong>{roleNames[effectiveRole]}</strong> view. Actions still use owner access.
              </p>
              <Button variant="outline" type="button" onClick={() => setPreviewRole("owner")}>
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
          onClose={closeAssistant}
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

      </SidebarProvider>

    </>
  );
}

export default UnifiedPortal;
