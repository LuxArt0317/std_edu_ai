import { defineConfig, loadEnv, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { copyPublicAssets } from "./scripts/lib/copy-public-assets.mjs";
import { directSchoolPages, renderDirectSchoolPage } from "./scripts/lib/direct-school-pages.mjs";
const deployment = JSON.parse(
  readFileSync(new URL("./deployment.json", import.meta.url), "utf8"),
);

// Keep dev/preview source assets as inert as the published Vercel copies.
const hosting = JSON.parse(
  readFileSync(new URL("./vercel.json", import.meta.url), "utf8"),
);
const directPages = directSchoolPages(process.cwd());
const legacyPortalEntry = /^\/eportal\/(?:index|login|apmenu)\.asp\/?$/i;
const legacyLearningEntry = /^\/school-sites\/(?:dtm|elearning)\.stu\.edu\.tw(?:\/|$)/i;
const mirrorMiddleware = (preview: boolean) => (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => {
  if (req.method === "GET" || req.method === "HEAD") {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;
    if (preview && /^\/(?:assets|site-pages|school-assets|school-pages)(?:\/|$)/.test(pathname) && !existsSync(path.join(process.cwd(), "dist", pathname.slice(1)))) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const key = pathname + url.search;
    const fallbackAllowed = !url.searchParams.has("id") && !url.searchParams.has("p");
    const direct = directPages.get(key) || (fallbackAllowed ? directPages.get(pathname) || directPages.get(pathname.endsWith("/") ? pathname.slice(0, -1) : pathname + "/") : undefined);
    if (direct) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'self'");
      if (req.method === "HEAD") { res.end(); return; }
      try { res.end(renderDirectSchoolPage(process.cwd(), direct)); }
      catch { res.statusCode = 500; res.end("Copied page unavailable"); }
      return;
    }
    if (preview && (legacyPortalEntry.test(pathname) || legacyLearningEntry.test(pathname) ||
      (!/^\/(?:api|assets|site-pages|school-assets|school-pages)(?:\/|$)/.test(pathname) && !/\.[a-z\d]{1,8}$/i.test(pathname)))) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") { res.end(); return; }
      res.end(readFileSync(new URL("./dist/app-shell.html", import.meta.url)));
      return;
    }
  }
  const route = req.url?.startsWith("/school-pages/")
    ? "/school-pages/(.*)"
    : req.url?.startsWith("/school-assets/")
      ? "/school-assets/(.*)"
      : null;
  const policy = hosting.headers?.find(
    (rule: { source: string }) => rule.source === route,
  );
  if (policy)
    for (const header of policy.headers)
      res.setHeader(header.key, header.value);
  next();
};
const mirrorSecurity: Plugin = {
  name: "school-mirror-security",
  configureServer(server) {
    server.middlewares.use(mirrorMiddleware(false));
  },
  configurePreviewServer(server) {
    server.middlewares.use(mirrorMiddleware(true));
  },
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // The Marketplace integration uses Next.js names. Expose only these two
  // browser-safe values; database passwords and service keys stay server-only.
  return {
    plugins: [react(), tailwindcss(), mirrorSecurity, {
      name: "pinned-public-assets",
      writeBundle(output) { copyPublicAssets(process.cwd(), output.dir || "dist"); },
    }],
    build: { copyPublicDir: false },
    server: {
      watch: {
        ignored: ["**/public/school-assets/**", "**/public/school-pages/**"],
      },
      proxy: {
        "/api": { target: deployment.vercel.productionUrl, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        "/api": { target: deployment.vercel.productionUrl, changeOrigin: true },
      },
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        env.VITE_SUPABASE_URL ||
          env.NEXT_PUBLIC_SUPABASE_URL ||
          env.SUPABASE_URL ||
          "",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          env.SUPABASE_PUBLISHABLE_KEY ||
          env.SUPABASE_ANON_KEY ||
          "",
      ),
    },
  };
});
