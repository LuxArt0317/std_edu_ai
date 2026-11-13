import fs from 'node:fs';
import path from 'node:path';
import { directSchoolPages } from './lib/direct-school-pages.mjs';

const root = process.cwd();
const file = path.join(root, 'vercel.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const captures = [...directSchoolPages(root)]
  .filter(([route]) => route !== '/')
  .sort(([left], [right]) => Number(right.includes('?')) - Number(left.includes('?')) || left.localeCompare(right));
// Preserve account API aliases when regenerating copied-page routes.
const rewrites = [{source:'/api/affairs-conversations',destination:'/api/affairs-data?resource=conversations'}];
for (const [route, page] of captures) {
  const url = new URL(route, 'https://stu.best');
  const has = [...url.searchParams].map(([key, value]) => ({ type: 'query', key, value }));
  for (const source of new Set([decodeURI(url.pathname), url.pathname])) {
    rewrites.push({ source, ...(has.length ? { has } : {}), destination: '/site-pages/' + path.basename(page.file) });
  }
}
rewrites.push({ source: '/:path((?!assets/|site-pages/|school-assets/|school-pages/|release[.]json$).*)', destination: '/app-shell.html' });
config.rewrites = rewrites;
const policy = config.headers.find(rule => rule.source === '/school-pages/(.*)');
if (!policy) throw new Error('School page CSP is missing');
const directHeaders = policy.headers.map(header => header.key === 'Content-Security-Policy'
  ? { ...header, value: header.value.replace("script-src 'none'", "script-src 'self'").replace("frame-src 'none'", "frame-src 'self'") }
  : header);
config.headers = config.headers.filter(rule => rule.source !== '/site-pages/(.*)');
config.headers.push({ source: '/site-pages/(.*)', headers: directHeaders });
const rootHeaders = config.headers.find(rule => rule.source === '/');
if (!rootHeaders) throw new Error('Homepage headers are missing');
rootHeaders.headers = rootHeaders.headers.filter(header => header.key !== 'Content-Security-Policy');
rootHeaders.headers.push(...directHeaders.filter(header => header.key === 'Content-Security-Policy'));
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log(JSON.stringify({ copiedRoutes: captures.length, rewriteRules: rewrites.length }));
