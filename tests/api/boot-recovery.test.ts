import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readContractSource } from '../../scripts/contract-source.mjs';
import { withTimeout } from '../../src/utils/async.ts';

test('the HTML entry renders useful content before JavaScript starts', () => {
  const html = readContractSource('index.html', 'utf8')
  assert.match(html, /data-stu-boot/)
  assert.match(html, /Opening your workspace/)
  assert.match(html, /Reload the portal/)
  assert.match(html, /JavaScript is required/)
  assert.doesNotMatch(html, /<div id="root"><\/div>/)
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
  assert.match(entry, /lazy\(\(\) => import\('\.\/features\/crm\/CRMRoot\.tsx'\)\)/)
  assert.match(entry, /lazy\(\(\) => import\('\.\/App\.tsx'\)\)/)
  assert.doesNotMatch(entry, /lazy\(\(\) => isCrmRoute \?/)
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
  const root = readContractSource('src/features/crm/CRMRoot.tsx', 'utf8')
  assert.match(auth, /withTimeout/)
  assert.match(auth, /clearLocalCrmSession/)
  assert.match(portal, /20_000/)
  assert.match(root, /Start with a clean local session/)
})

test('workspace navigation retains School OS and Learner Support without remount loading', () => {
  const portal = readContractSource('src/features/school/UnifiedPortal.tsx', 'utf8')
  const crm = readContractSource('src/features/crm/crmRepository.ts', 'utf8')
  const crmApp = readContractSource('src/features/crm/CRMApp.tsx', 'utf8')
  assert.match(portal, /school-shell"\s+hidden=\{showingCrm\}/)
  assert.match(portal, /crm-bridge" hidden=\{!showingCrm\}/)
  assert.doesNotMatch(portal, /if \(view === "crm"[\s\S]{0,120}return/)
  assert.match(crm, /getCrmDataSnapshot/)
  assert.match(crm, /crmLoad/)
  assert.match(crmApp, /useState<CrmDatabase \| null>\(\(\) =>\s*getCrmDataSnapshot\(currentUser\?\.id, currentUser\?\.role\)/)
})
