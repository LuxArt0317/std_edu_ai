import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
for (const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','FormData']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name as keyof Window], configurable: true })
// jsdom has no layout observer; Radix only uses it to measure the checkbox.
Object.defineProperty(globalThis, 'ResizeObserver', { value: class { observe() {} unobserve() {} disconnect() {} }, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
const { render, screen, cleanup, fireEvent } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { CheckboxField } = await import('../../src/components/form-controls')
const { Label } = await import('../../src/components/ui/label')
const { Input } = await import('../../src/components/ui/input')
const { NativeSelect, NativeSelectOption } = await import('../../src/components/ui/native-select')
afterEach(cleanup)
test('accessible checkbox preserves a single native field, change event and default on form reset', async () => {
  const changes: boolean[] = []
  const { container } = render(<form><Label htmlFor="published"><CheckboxField id="published" name="publish" defaultChecked onChange={event => changes.push(event.target.checked)} />Publish module</Label></form>)
  const checkbox = screen.getByRole('checkbox', { name: 'Publish module' })
  const form = container.querySelector('form')!
  assert.equal(checkbox.getAttribute('aria-checked'), 'true')
  assert.deepEqual(new FormData(form).getAll('publish'), ['on'])
  await userEvent.setup().click(checkbox)
  assert.deepEqual(changes, [false])
  assert.equal(new FormData(form).has('publish'), false)
  fireEvent.reset(form)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(checkbox.getAttribute('aria-checked'), 'true')
  assert.deepEqual(new FormData(form).getAll('publish'), ['on'])
})
test('required and disabled checkbox contracts survive visual migration', async () => {
  const { container } = render(<form><Label>Consent<CheckboxField name="consent" required /></Label><Label>Unavailable<CheckboxField name="disabled" disabled defaultChecked /></Label></form>)
  const form = container.querySelector('form')!
  assert.equal(form.checkValidity(), false)
  await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Consent' }))
  assert.equal(form.checkValidity(), true)
  assert.equal(new FormData(form).has('disabled'), false)
})
test('native-select and text controls retain labels, required validation and form values', async () => {
  const { container } = render(<form><Label>Title<Input name="title" required /></Label><Label>State<NativeSelect name="state" defaultValue="draft"><NativeSelectOption value="draft">Draft</NativeSelectOption><NativeSelectOption value="published">Published</NativeSelectOption></NativeSelect></Label></form>)
  const form = container.querySelector('form')!
  assert.equal(form.checkValidity(), false)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Verified course')
  await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'published')
  assert.equal(form.checkValidity(), true)
  assert.deepEqual(Object.fromEntries(new FormData(form)), { title: 'Verified course', state: 'published' })
})

test('upcoming summary excludes expired and invalid records, includes ongoing events and sorts without mutating input', async () => {
  const { upcomingEvents } = await import('../../src/lib/upcoming-events')
  const events = [
    { id: 'later', startsAt: '2026-11-03T12:00:00Z', endsAt: '2026-11-03T13:00:00Z' },
    { id: 'past', startsAt: '2026-09-04T12:00:00Z', endsAt: '2026-09-04T13:00:00Z' },
    { id: 'ongoing', startsAt: '2026-11-01T11:00:00Z', endsAt: '2026-11-01T13:00:00Z' },
    { id: 'invalid', startsAt: 'invalid', endsAt: 'invalid' },
  ]
  assert.deepEqual(upcomingEvents(events, Date.parse('2026-11-01T12:00:00Z')).map(event => event.id), ['ongoing', 'later'])
  assert.equal(events[0].id, 'later')
})

test('confirmation queue preserves order and cancellation without blocking unrelated requests', async () => {
  const { confirmAction, requestText, complete, currentDecision } = await import('../../src/lib/decisions')
  const first = confirmAction('Archive this exact record?')
  const second = requestText('Explain the academic decision.', 'Initial reason')
  assert.equal(currentDecision()?.kind, 'confirm')
  complete(null)
  assert.equal(await first, false)
  assert.equal(currentDecision()?.initialValue, 'Initial reason')
  complete('Verified academic reason')
  assert.equal(await second, 'Verified academic reason')
  assert.equal(currentDecision(), null)
})

test('session cache rejects other roles and stale responses after logout or account change', async () => {
  const { SessionCache } = await import('../../src/lib/session-cache')
  const cache = new SessionCache<{ secret: string }>()
  const owner = cache.begin('owner:owner')
  assert.equal(cache.write('owner:owner', owner, { secret: 'owner records' }), true)
  assert.equal(cache.read('student:student'), null)
  const student = cache.begin('student:student')
  assert.equal(cache.read('owner:owner'), null)
  assert.equal(cache.write('owner:owner', owner, { secret: 'late response' }), false)
  cache.clear()
  assert.equal(cache.write('student:student', student, { secret: 'after logout' }), false)
})

test('CRM summaries use canonical records and handle an empty pipeline without invented metrics', async () => {
  const { summarizeCrm } = await import('../../src/features/crm/crmSummary')
  const empty = { students: [], cases: [], leads: [], tasks: [] } as any
  const blank = summarizeCrm(empty)
  assert.equal(blank.admissionRate, 0)
  assert.equal(blank.weightedOpenForecast, 0)
  assert.deepEqual(blank.signals, [])
  const result = summarizeCrm({ ...empty,
    students: [
      { id: 'real-1', name: 'Actual learner', programId: 'p1', program: 'Alias A', signals: [{ id: 'signal-1', label: 'Recorded signal', detail: 'Recorded evidence', tone: 'warning', active: true }] },
      { id: 'real-2', name: 'Second learner', programId: 'p1', program: 'Alias B', signals: [{ label: 'Retired signal', tone: 'negative', active: false }] },
    ],
    cases: [{ status: 'waiting', priority: 'urgent' }, { status: 'resolved', priority: 'urgent' }],
    leads: [{ stage: 'inquiry', probability: 30, ownerId: null }, { stage: 'admitted', probability: 100, ownerId: 'assigned' }, { stage: 'closed', probability: 0 }],
    tasks: [{ completed: false, priority: 'high' }, { completed: true, priority: 'high' }],
  })
  assert.equal(result.programCount, 1)
  assert.equal(result.admissionRate, 50)
  assert.equal(result.weightedOpenForecast, .3)
  assert.equal(result.urgentCases, 1)
  assert.equal(result.waitingCases, 1)
  assert.equal(result.highPriorityTasks, 1)
  assert.equal(result.signals.length, 1)
  assert.equal(result.signals[0].studentId, 'real-1')
})

const { toDatabasePriority } = await import('../../src/lib/priorities')
test('case and task priority labels serialize to values accepted by the database', () => {
  assert.equal(toDatabasePriority('normal'), 'medium')
  for (const priority of ['low', 'medium', 'high', 'urgent']) assert.equal(toDatabasePriority(priority), priority)
  assert.throws(() => toDatabasePriority('unknown'), /valid priority/)
})
