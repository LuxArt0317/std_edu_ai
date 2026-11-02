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
    <div className="public-site-shell">
      <PreviewNotice
        compact={
          !pathname.startsWith("/school-affairs") &&
          !pathname.includes("student-sso")
        }
      />
      <Routes>
        <Route path="/" element={<SourceMirror />} />
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
      {pathname === "/" ? <PublicCampusDirectory /> : null}
      <PublicAssistant
        key={
          /\/school-affairs\/(signed-out|login)/.test(pathname)
            ? "affairs-logged-out"
            : "public"
        }
      />
    </div>
  );
}
