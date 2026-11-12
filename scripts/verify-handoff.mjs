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
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git', 'artifacts', 'dist', '.vercel'].includes(entry.name)) return []
    const name = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(name) : [name]
  })
}
const markdown = walk('.').filter(file => file.endsWith('.md'))
// The user requested this one shared agent ledger; engineering plans still live
// exclusively in planning-with-files and detailed documentation stays in docs.
for (const file of markdown) assert.ok(!file.includes(path.sep) || path.basename(file) === 'README.md' || file === 'agent/A2A.md' || file.startsWith('docs/') || file.startsWith('planning-with-files/') || /^media\/tutorials\/(README|SETUP|PROJECT)\.md$/.test(file), `${file}: move detailed documentation out of runtime/provider/test folders`)
const documents = markdown.filter(file => !file.startsWith('planning-with-files/archive/') && !file.startsWith('docs/archive/'))
for (const file of documents) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^(?:https?:|mailto:|plugin:|app:|#|\/)/.test(target)) continue
    assert.ok(existsSync(path.resolve(path.dirname(file), target)), `${file}: broken link ${target}`)
  }
}
console.log(JSON.stringify({ status: 'ok', clientTargets: true, singlePlan: true, currentDocuments: documents.length, links: 'valid', privateMigrationExports: 'excluded' }))
