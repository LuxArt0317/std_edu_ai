import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const outputDirectory = path.resolve(process.env.STU_BUILD_DIRECTORY || 'dist')
const htmlPath = path.join(outputDirectory, 'index.html')
assert.ok(fs.existsSync(htmlPath), `Build verification failed: ${htmlPath} does not exist.`)

const html = fs.readFileSync(htmlPath, 'utf8')
const entryPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
assert.ok(entryPath, 'Build verification failed: index.html has no JavaScript entry asset.')

const normalizeAssetPath = (assetPath) => assetPath.replace(/^\.\//, 'assets/').replace(/^\//, '')
const entryFile = path.join(outputDirectory, normalizeAssetPath(entryPath))
assert.ok(fs.existsSync(entryFile), `Build verification failed: entry asset ${entryPath} does not exist.`)

const entry = fs.readFileSync(entryFile, 'utf8')
const dependencyPaths = new Set(
  [...entry.matchAll(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)].map((match) => match[0]),
)

for (const dependencyPath of dependencyPaths) {
  assert.ok(
    fs.existsSync(path.join(outputDirectory, dependencyPath)),
    `Build verification failed: generated dependency ${dependencyPath} does not exist.`,
  )
}

const crmScript = [...dependencyPaths].find((dependencyPath) => /^assets\/CRMRoot-[\w-]+\.js$/.test(dependencyPath))
assert.ok(crmScript, 'Build verification failed: the entry asset does not expose the CRM lazy-route JavaScript dependency.')
const crmScriptBody = fs.readFileSync(path.join(outputDirectory, crmScript), 'utf8')
for (const onboardingMarker of ['ROLE READINESS CENTER', 'Click the highlighted control', 'stu-nexus-role-foundations']) {
  assert.ok(
    !crmScriptBody.includes(onboardingMarker),
    `Build verification failed: onboarding is disabled, but the CRM runtime bundle still contains ${JSON.stringify(onboardingMarker)}.`,
  )
}
for (const sourceInventoryMarker of [
  'OFFICIAL-SOURCE DISCOVERY',
  'Review the STU source inventory',
  'Accept as inactive source',
  'review_stu_source_candidate',
]) {
  assert.ok(
    crmScriptBody.includes(sourceInventoryMarker),
    `Build verification failed: the CRM runtime bundle is missing source-inventory marker ${JSON.stringify(sourceInventoryMarker)}.`,
  )
}

const cssDependencies = [...dependencyPaths].filter((dependencyPath) => dependencyPath.endsWith('.css'))
const crmStylesheet = cssDependencies.find((dependencyPath) => {
  const css = fs.readFileSync(path.join(outputDirectory, dependencyPath), 'utf8')
  return css.includes('.nexus-auth-shell') && css.includes('.nexus-auth-card')
})

assert.ok(
  crmStylesheet,
  'Build verification failed: the CRM lazy route can render without a linked stylesheet containing .nexus-auth-shell and .nexus-auth-card.',
)

console.log(JSON.stringify({
  status: 'ok',
  entry: normalizeAssetPath(entryPath),
  crmScript,
  crmStylesheet,
  onboardingDisabled: true,
  sourceInventoryReview: true,
  dependencyCount: dependencyPaths.size,
}))
