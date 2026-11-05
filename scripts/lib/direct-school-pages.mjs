import fs from 'node:fs';
import path from 'node:path';

const reserved = /^\/(?:app|api|assets|site-pages|school-assets|school-pages|school-affairs|signin|signup|login|crm|student-sso|local-pages|campus-assistant|campus-directory|study)(?:\/|$)/;

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
  const notice = '<div class="stu-direct-notice" role="note">校園網站介面預覽（非官方）<br>不接收校務密碼 · <a href="/campus-directory">校園導覽</a> · <a href="/campus-assistant">校園助理</a></div>';
  if (!/<body\b[^>]*>/i.test(html)) throw new Error(`Capture has no body: ${page.file}`);
  let output = html.replace(/<body\b[^>]*>/i, match => match + notice);
  output = output.replace(/<\/head>/i, '<link rel="stylesheet" href="/direct-school.css"></head>');
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
