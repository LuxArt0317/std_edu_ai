import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const config = JSON.parse(readFileSync('deployment.json', 'utf8'))
assert.equal(config.repository, 'LuxArt0317/std_edu_ai')
assert.equal(config.supabase.projectRef, 'xiftudmvxphxcjtmfmib')
assert.equal(config.supabase.ownerEmail, 'luxart0317@gmail.com')
assert.ok(!existsSync('github-issues-export'), 'Migration exports belong outside the client deliverable')
assert.ok(existsSync('planning-with-files/task_plan.md'))
assert.ok(!existsSync('agent/planning-with-files/task_plan.md'), 'Use a single root plan')
const documents = ['README.md', 'PROJECT.md', 'SETUP.md', 'AGENTS.md', 'docs/README.md', ...readdirSync('docs/operations').filter(f => f.endsWith('.md')).map(f => `docs/operations/${f}`)]
for (const file of documents) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^(?:https?:|mailto:|\/)/.test(target)) continue
    assert.ok(existsSync(path.resolve(path.dirname(file), target)), `${file}: broken link ${target}`)
  }
}
console.log(JSON.stringify({ status: 'ok', clientTargets: true, singlePlan: true, currentDocuments: documents.length, links: 'valid', privateMigrationExports: 'excluded' }))
