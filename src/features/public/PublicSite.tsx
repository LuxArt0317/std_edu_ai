import { lazy, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
const App = lazy(() => import("../../App"));
import { PublicAssistant } from "./PublicAssistant";
import { PreviewNotice } from "./site/PreviewNotice";
const StudentDirectory = lazy(() =>
  import("./site/StudentDirectory").then((module) => ({
    default: module.StudentDirectory,
  })),
);
const StudentSsoPreview = lazy(() =>
  import("./site/StudentSsoPreview").then((module) => ({
    default: module.StudentSsoPreview,
  })),
);
const SchoolAffairsPortal = lazy(() => import("./affairs/SchoolAffairsPortal"));
import "./site/reference.css";

export default function PublicSite() {
  const { pathname, hash, search } = useLocation();
  useEffect(() => {
    document.documentElement.lang = "zh-Hant";
    if (!pathname.startsWith("/school-affairs"))
      document.title =
        (pathname.includes("student-sso")
          ? "mySTU 登入介面預覽"
          : pathname === "/"
            ? "樹德科技大學網站介面預覽"
            : "在校學生介面預覽") + " | STU Nexus";
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
      <PreviewNotice />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/school-affairs/*" element={<SchoolAffairsPortal />} />
        <Route
          path="/ePortal/index.asp"
          element={<Navigate to="/school-affairs" replace />}
        />
        <Route
          path="/ePortal/apMenu.asp"
          element={<Navigate to="/school-affairs/search" replace />}
        />
        <Route path="/在校學生" element={<StudentDirectory />} />
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
        <Route
          path="*"
          element={
            <main className="reference-not-found">
              <h1>找不到頁面</h1>
              <p>請從首頁或在校學生目錄選擇服務。</p>
              <Link to="/">回到首頁</Link>
              <Link to="/在校學生/">在校學生</Link>
            </main>
          }
        />
      </Routes>
      <PublicAssistant />
    </div>
  );
}
