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
import "./site/reference.css";
import { AffairsAuthProvider } from "./affairs/AffairsAuth";
import { useAffairsAuth } from "./affairs/authContext";

function SchoolAccountAssistant() {
  const {user} = useAffairsAuth();
  const {pathname} = useLocation();
  return <PublicAssistant key={user?.id || "anonymous"} initialOpen={pathname === "/campus-assistant"} />;
}

export default function PublicSite() {
  const { pathname, hash, search } = useLocation();
  useEffect(() => {
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
  return (
    <AffairsAuthProvider><div className="public-site-shell">
      <PreviewNotice
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
