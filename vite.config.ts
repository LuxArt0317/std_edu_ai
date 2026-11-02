import { defineConfig, loadEnv, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const deployment = JSON.parse(
  readFileSync(new URL("./deployment.json", import.meta.url), "utf8"),
);

// Keep dev/preview source assets as inert as the published Vercel copies.
const hosting = JSON.parse(
  readFileSync(new URL("./vercel.json", import.meta.url), "utf8"),
);
const mirrorMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => {
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
    server.middlewares.use(mirrorMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use(mirrorMiddleware);
  },
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // The Marketplace integration uses Next.js names. Expose only these two
  // browser-safe values; database passwords and service keys stay server-only.
  return {
    plugins: [react(), tailwindcss(), mirrorSecurity],
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
