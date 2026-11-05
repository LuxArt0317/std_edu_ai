import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const outputDirectory = path.resolve(process.env.STU_BUILD_DIRECTORY || 'dist')
const htmlPath = path.join(outputDirectory, 'app-shell.html')
assert.ok(fs.existsSync(htmlPath), `Build verification failed: ${htmlPath} does not exist.`)
const publicHome = fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8')
assert.match(publicHome, /校園網站介面預覽（非官方）/, 'The public homepage must be a direct school document.')
assert.doesNotMatch(publicHome, /data-stu-boot/, 'The public homepage must not depend on the SPA boot shell.')
assert.match(publicHome, /class="stu-assistant-toggle"/, 'The public homepage must expose the campus assistant.')
assert.match(publicHome, /class="stu-assistant-frame"/, 'The campus assistant must share the copied page without wrapping it.')
assert.ok(fs.existsSync(path.join(outputDirectory, 'direct-school-assistant.js')), 'The assistant bridge must ship with the copied pages.')

const html = fs.readFileSync(htmlPath, 'utf8')
const entryPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
assert.ok(entryPath, 'Build verification failed: app-shell.html has no JavaScript entry asset.')

const normalizeAssetPath = (assetPath) => assetPath.replace(/^\.\//, 'assets/').replace(/^\//, '')
const entryFile = path.join(outputDirectory, normalizeAssetPath(entryPath))
assert.ok(fs.existsSync(entryFile), `Build verification failed: entry asset ${entryPath} does not exist.`)

function assetGraph(root) {
  const visited = new Set()
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    if (visited.has(current)) continue
    assert.ok(fs.existsSync(path.join(outputDirectory, current)), `Build verification failed: generated dependency ${current} does not exist.`)
    visited.add(current)
    if (!current.endsWith('.js')) continue
    const body = fs.readFileSync(path.join(outputDirectory, current), 'utf8')
    for (const match of body.matchAll(/["']((?:\.\/|assets\/)?[A-Za-z0-9_.-]+\.(?:js|css))["']/g)) {
      const reference = match[1]
      pending.push(reference.startsWith('assets/') ? reference : path.posix.join(path.posix.dirname(current), reference))
    }
  }
  return visited
}
const dependencyPaths = assetGraph(normalizeAssetPath(entryPath))

const crmScript = [...dependencyPaths].find((dependencyPath) => /^assets\/SchoolAuth-[\w-]+\.js$/.test(dependencyPath))
assert.ok(crmScript, 'Build verification failed: the entry asset does not expose the CRM lazy-route JavaScript dependency.')
const crmScriptBody = [...assetGraph(crmScript)].filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(outputDirectory, file), 'utf8')).join('\n')
for (const onboardingMarker of ['ROLE READINESS CENTER', 'Click the highlighted control', 'stu-nexus-role-foundations']) {
  assert.ok(
    !crmScriptBody.includes(onboardingMarker),
    `Build verification failed: onboarding is disabled, but the CRM runtime bundle still contains ${JSON.stringify(onboardingMarker)}.`,
  )
}
for (const sourceInventoryMarker of [
  'source-candidate-review',
  'Review sources',
  'Accept source',
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
