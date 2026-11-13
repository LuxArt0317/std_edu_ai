import fs from 'node:fs';
import path from 'node:path';

const reserved = /^\/(?:app|api|assets|site-pages|school-assets|school-pages|school-affairs|dtm|account-status|signin|signup|login|crm|student-sso|local-pages|campus-assistant|campus-directory|study)(?:\/|$)/;

/** Exact local routes for the already captured public HTML; no runtime fetch. */
export function directSchoolPages(root) {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'src/features/public/mirror/pages.json'), 'utf8'));
  const routes = new Map();
  for (const page of pages) {
    if (typeof page.route !== 'string' || typeof page.file !== 'string') throw new Error('Invalid school page manifest');
    const url = new URL(page.route, 'https://stu.best');
    if (url.origin !== 'https://stu.best' || !page.route.startsWith('/') || url.hash) throw new Error('Invalid school route');
    if (reserved.test(url.pathname)) throw new Error(`Reserved school route: ${url.pathname}`);
    if (!/^\/school-pages\/[a-f0-9]{20}\.html$/.test(page.file)) throw new Error(`Invalid school capture: ${page.file}`);
    const key = url.pathname + url.search;
    if (routes.has(key)) throw new Error(`Duplicate school route: ${key}`);
    routes.set(key, page);
  }
  if (!routes.has('/')) throw new Error('School homepage capture is missing');
  return routes;
}

export function renderDirectSchoolPage(root, page) {
  const source = path.join(root, 'public', page.file.slice(1));
  const html = fs.readFileSync(source, 'utf8');
  const assistant = '<button type="button" class="stu-assistant-toggle" popovertarget="stu-assistant-panel" aria-label="開啟 AI 校園助理"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg><span>校園助理</span></button><div id="stu-assistant-panel" class="stu-assistant-panel" popover="auto" role="dialog" aria-label="校園助理"><button type="button" class="stu-assistant-close" popovertarget="stu-assistant-panel" popovertargetaction="hide" aria-label="關閉校園助理">×</button><iframe class="stu-assistant-frame" title="校園助理對話" loading="lazy" src="/campus-assistant?embed=1"></iframe></div>';
  if (!/<body\b[^>]*>/i.test(html)) throw new Error(`Capture has no body: ${page.file}`);
  let output = html.replace(/<body\b[^>]*>/i, match => match + assistant);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i;
  if (!csp.test(output)) throw new Error(`Capture has no CSP: ${page.file}`);
  output = output.replace(csp, (_, policy) => `<meta http-equiv="Content-Security-Policy" content="${policy.replace("script-src 'none'", "script-src 'self'").replace("frame-src 'none'", "frame-src 'self'")}">`);
  output = output.replace(/<\/head>/i, '<link rel="stylesheet" href="/direct-school.css"><script defer src="/direct-school-assistant.js"></script></head>');
  if (page.route === '/') {
    // Elementor's frozen animation and counters need their final static state.
    output = output.replace(/(<span class="elementor-counter-number"[^>]*data-to-value="(\d+)"[^>]*>)[^<]*(<\/span>)/g,
      (_, open, value, close) => open + Number(value).toLocaleString('en-US') + close);
  }
  return output;
}

export function copyDirectSchoolPages(root, output) {
  const pages = directSchoolPages(root);
  const spa = path.join(output, 'index.html');
  fs.copyFileSync(spa, path.join(output, 'app-shell.html'));
  fs.mkdirSync(path.join(output, 'site-pages'), { recursive: true });
  for (const [route, page] of pages) {
    const destination = route === '/' ? spa : path.join(output, 'site-pages', path.basename(page.file));
    fs.writeFileSync(destination, renderDirectSchoolPage(root, page));
  }
  return pages.size;
}
