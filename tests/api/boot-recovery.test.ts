import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readContractSource } from '../../scripts/contract-source.mjs';
import { withTimeout } from '../../src/utils/async.ts';

test('the HTML entry renders useful content before JavaScript starts', () => {
  const html = readContractSource('index.html', 'utf8')
  assert.match(html, /data-stu-boot/)
  assert.match(html, /Loading the page/)
  assert.match(html, /Reload this page/)
  assert.match(html, /JavaScript is required/)
  assert.match(html, /__stu_boot_recovery/)
  assert.match(html, /cache: 'no-store'/)
  assert.doesNotMatch(html, /<div id="root"><\/div>/)
})

test('the public SPA rewrite excludes static assets and keeps page HTML fresh', () => {
  const config = JSON.parse(readContractSource('vercel.json', 'utf8'))
  const source = config.rewrites.at(-1).source as string
  assert.match(source, /assets\//)
  assert.match(source, /school-assets\//)
  assert.match(source, /school-pages\//)
  assert.match(source, /site-pages\//)
  assert.equal(config.rewrites.at(-1).destination, '/app-shell.html')
  assert.ok(config.rewrites.some((rule: {source: string; destination: string}) => rule.source === '/在校學生/' && rule.destination.startsWith('/site-pages/')))
  assert.ok(config.headers.some((rule: { source: string; headers: Array<{ key: string; value: string }> }) =>
    rule.source.includes('(?!assets/') && rule.headers.some(header => header.key === 'Cache-Control' && header.value === 'no-store')))
})

test('the React entry protects lazy routes with loading and error UI', () => {
  const entry = readContractSource('src/main.tsx', 'utf8')
  const boundary = readContractSource('src/ApplicationErrorBoundary.tsx', 'utf8')
  assert.match(entry, /ApplicationErrorBoundary/)
  assert.match(entry, /Suspense fallback={<RouteLoading/)
  assert.match(boundary, /Reload latest version/)
  assert.match(boundary, /Reset local session/)
  assert.match(boundary, /dynamically imported module/)
})

test('each route has a statically analyzable lazy boundary', () => {
  const entry = readContractSource('src/main.tsx', 'utf8')
  const crmStyles = readContractSource('src/features/crm/crm.css', 'utf8')
  assert.match(entry, /lazy\(\(\) => import\('\.\/features\/auth\/SchoolAuth\.tsx'\)\)/)
  assert.match(entry, /lazy\(\(\) => import\('\.\/features\/public\/PublicSite\.tsx'\)\)/)
  assert.doesNotMatch(entry, /lazy\(\(\) => isSchoolRoute \?/)
  assert.match(crmStyles, /\.nexus-auth-shell, \.nexus-auth-shell \*/)
  assert.match(crmStyles, /box-sizing: border-box/)
  assert.match(crmStyles, /width: min\(460px, calc\(100vw - 56px\)\)/)
})

test('timeout helper resolves successful work and rejects stalled work', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 50, 'timed out'), 'ready')
  await assert.rejects(withTimeout(new Promise(() => undefined), 5, 'startup timed out'), /startup timed out/)
})

test('authentication and platform startup have finite recovery bounds', () => {
  const auth = readContractSource('src/features/crm/authService.ts', 'utf8')
  const portal = readContractSource('src/features/school/platformRepository.ts', 'utf8')
  const root = readContractSource('src/features/auth/SchoolAuth.tsx', 'utf8')
  assert.match(auth, /withTimeout/)
  assert.match(auth, /clearLocalCrmSession/)
  assert.match(portal, /20_000/)
  assert.match(root, /Reset saved login/)
})

test('workspace navigation embeds support modules inside one School OS shell', () => {
  const portal = readContractSource('src/features/school/UnifiedPortal.tsx', 'utf8')
  const crm = readContractSource('src/features/crm/crmRepository.ts', 'utf8')
  const crmApp = readContractSource('src/features/crm/CRMApp.tsx', 'utf8')
  assert.doesNotMatch(portal, /hidden=\{showingCrm\}/)
  assert.match(portal, /activeSection=\{\(view === "crm"/)
  assert.match(crmApp, /nexus-embedded/)
  assert.doesNotMatch(crmApp, /SidebarProvider|Open CRM navigation/)
  assert.doesNotMatch(portal, /crm-bridge/)
  assert.doesNotMatch(portal, /if \(view === "crm"[\s\S]{0,120}return/)
  assert.match(crm, /getCrmDataSnapshot/)
  assert.match(crm, /crmLoad/)
  assert.match(crmApp, /useState<CrmDatabase \| null>\(\(\) =>\s*getCrmDataSnapshot\(currentUser\?\.id, currentUser\?\.role\)/)
})
