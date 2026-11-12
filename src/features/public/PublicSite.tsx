import { lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
const LocalPageIndex = lazy(() =>
  import("./mirror/SourceMirror").then((m) => ({ default: m.LocalPageIndex })),
);
const SourceMirror = lazy(() => import("./mirror/SourceMirror"));
import { PublicCampusDirectory } from "./PublicCampusDirectory";
import { PublicAssistant } from "./PublicAssistant";
import { PreviewNotice } from "./site/PreviewNotice";
const StudentSsoPreview = lazy(() =>
  import("./site/StudentSsoPreview").then((module) => ({
    default: module.StudentSsoPreview,
  })),
);
const SchoolAffairsPortal = lazy(() => import("./affairs/SchoolAffairsEntry"));
const DigitalMaterials = lazy(() => import("./dtm/DigitalMaterials"));
import "./site/reference.css";
import { AffairsAuthProvider } from "./affairs/AffairsAuth";
import { useAffairsAuth } from "./affairs/authContext";

function useSignedInSchoolWorkspace() {
  const { user } = useAffairsAuth();
  const { pathname } = useLocation();
  return Boolean(user && /^\/(?:school-affairs|dtm|school-sites\/dtm\.stu\.edu\.tw)(?:\/|$)/.test(pathname)
    && !/^\/school-affairs\/(?:login|auth|signed-out|privacy)(?:\/|$)/.test(pathname));
}

function SchoolPreviewNotice({ compact }: { compact: boolean }) {
  const workspace = useSignedInSchoolWorkspace();
  return workspace ? null : <PreviewNotice compact={compact} />;
}

function SchoolAccountAssistant({ embedded = false }: { embedded?: boolean }) {
  const {user} = useAffairsAuth();
  const {pathname} = useLocation();
  const workspace = useSignedInSchoolWorkspace();
  const standaloneService = /^\/school-affairs\/services\/(?:leave|internship|9-1|22-1|12-4|26-1|34-1|39-1|11-1|11-2|11-3)(?:\/|$)/.test(pathname);
  return <PublicAssistant key={user?.id || "anonymous"} initialOpen={pathname === "/campus-assistant"} embedded={embedded} showLauncher={!workspace || standaloneService} />;
}
function PublicAccountStatus() {
  const { user, loading } = useAffairsAuth();
  return <div style={{font:'13px/1.45 system-ui,sans-serif',color:'#fff',padding:'0 2px'}} aria-live="polite">
    {loading ? 'Checking account…' : user ? <>Signed in: {user.email}<br/><a style={{color:'#fff',textDecoration:'underline'}} href="/school-affairs" target="_top">School Affairs</a> · <a style={{color:'#fff',textDecoration:'underline'}} href="/dtm" target="_top">DTM</a></> : <a style={{color:'#fff',textDecoration:'underline'}} href="/school-affairs/login" target="_top">Sign in with Google</a>}
  </div>;
}

export default function PublicSite() {
  const { pathname, hash, search } = useLocation();
  const embeddedAssistant = pathname === "/campus-assistant" && new URLSearchParams(search).get("embed") === "1" && window.parent !== window;
  const embeddedAccount = pathname === "/account-status" && window.parent !== window;
  useEffect(() => {
    if (!embeddedAccount) return;
    document.documentElement.classList.add('stu-account-embed');
    return () => document.documentElement.classList.remove('stu-account-embed');
  }, [embeddedAccount]);
  useEffect(() => {
    if (!embeddedAssistant) return;
    document.documentElement.classList.add("stu-assistant-embed");
    return () => document.documentElement.classList.remove("stu-assistant-embed");
  }, [embeddedAssistant]);
  useEffect(() => {
    if (!/^\/(?:dtm(?:\/|$)|school-sites\/dtm\.stu\.edu\.tw(?:\/|$))/.test(pathname))
      document.documentElement.lang = "zh-Hant";
    if (pathname === "/student-sso")
      document.title = "mySTU 登入介面預覽 | 校園網站預覽";
    if (pathname === "/local-pages")
      document.title = "本地校園網站 · Local school pages";
    let target: HTMLElement | null = null;
    try {
      target = hash
        ? document.getElementById(decodeURIComponent(hash.slice(1)))
        : null;
    } catch {}
    if (target) target.scrollIntoView({ behavior: "instant", block: "start" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash]);
  if (embeddedAssistant) return <AffairsAuthProvider><SchoolAccountAssistant embedded /></AffairsAuthProvider>;
  if (embeddedAccount) return <AffairsAuthProvider><PublicAccountStatus /></AffairsAuthProvider>;
  return (
    <AffairsAuthProvider><div className="public-site-shell">
      <SchoolPreviewNotice
        compact={
          !pathname.startsWith("/school-affairs") &&
          !pathname.includes("student-sso")
        }
      />
      <Routes>
        <Route path="/" element={<SourceMirror />} />
        <Route path="/campus-assistant" element={<main className="mirror-index"><h1>校園助理</h1><p>Ask about the university, services and announcements. Open the assistant below to start a conversation.</p><a href="/">Return to the university homepage</a></main>} />
        <Route path="/campus-directory" element={<main className="mirror-index"><h1>校園導覽</h1><p>Browse campus services and copied school pages.</p><a href="/local-pages">Browse copied pages</a><br /><a href="/">Return to the university homepage</a></main>} />
        <Route path="/local-pages" element={<LocalPageIndex key={search} />} />
        <Route
          path="/ePortal/login.asp"
          element={<Navigate to="/school-affairs/login" replace />}
        />
        <Route path="/school-affairs/*" element={<SchoolAffairsPortal />} />
        <Route path="/dtm/*" element={<DigitalMaterials />} />
        <Route path="/dtm/course/:id" element={<DigitalMaterials />} />
        <Route path="/school-sites/dtm.stu.edu.tw/*" element={<DigitalMaterials />} />
        <Route
          path="/ePortal/index.asp"
          element={<Navigate to="/school-affairs" replace />}
        />
        <Route
          path="/ePortal/apMenu.asp"
          element={<Navigate to="/school-affairs/search" replace />}
        />
        <Route path="/在校學生" element={<SourceMirror />} />
        <Route
          path="/students"
          element={<Navigate to="/在校學生/" replace />}
        />
        <Route
          path="/student-sso"
          element={
            search ? (
              <Navigate to="/student-sso" replace />
            ) : (
              <StudentSsoPreview />
            )
          }
        />
        <Route
          path="/auth/realms/stuarm/protocol/saml"
          element={<Navigate to="/student-sso" replace />}
        />
        <Route path="*" element={<SourceMirror />} />
      </Routes>
      {pathname === "/" || pathname === "/campus-directory" ? <PublicCampusDirectory /> : null}
      <SchoolAccountAssistant />
    </div></AffairsAuthProvider>
  );
}
