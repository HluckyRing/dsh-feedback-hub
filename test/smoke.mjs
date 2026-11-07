/**
 * dsh-feedback-hub — smoke tests.
 *
 * Run with `node test/smoke.mjs` (no test framework, no dependencies). These
 * cover the pure logic in `core.js` plus the packaging invariants that are easy
 * to break by hand: exported files that do not exist, locale metadata, a config
 * key the patch sets but the resolver drops, and the client/server kind list
 * drifting apart.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_CONFIG,
  EVENT_KINDS,
  RingBuffer,
  buildRevealScript,
  buildToastScript,
  buildToastXml,
  collectReadTargets,
  dedupeKey,
  formatDuration,
  inQuietHours,
  isCriticalKind,
  normalizeQuietHours,
  parseQuietHours,
  resolveConfig,
  shouldDeliver,
  truncate,
  xmlEscape,
} from '../core.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const results = []

/** @param {string} name @param {() => void} fn */
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error })
  }
}

// ---------------------------------------------------------------- config

test('resolveConfig fills defaults', () => {
  const config = resolveConfig(undefined)
  assert.deepEqual(config.events, DEFAULT_CONFIG.events)
  assert.equal(config.turnDoneMinDurationMs, 0)
  assert.equal(config.osToast, 'auto')
  assert.equal(config.sound, true)
  assert.equal(config.quietHours, '')
})

test('resolveConfig merges partial input and keeps unknown keys', () => {
  const config = resolveConfig({ events: { approval: false, bogus: true }, osToast: 'host', extra: 1 })
  assert.equal(config.events.approval, false)
  assert.equal(config.events.question, true)
  assert.equal(config.osToast, 'host')
  assert.equal(config.extra, 1)
  assert.equal('bogus' in config.events, false)
})

test('resolveConfig rejects an unknown osToast mode', () => {
  assert.equal(resolveConfig({ osToast: 'telepathy' }).osToast, 'auto')
})

test('resolveConfig clamps numbers instead of trusting them', () => {
  const config = resolveConfig({ dedupeWindowMs: -5, historyLimit: 10_000, toastDurationMs: 1, maxTextLength: 1 })
  assert.equal(config.dedupeWindowMs, 0)
  assert.equal(config.historyLimit, 500)
  assert.equal(config.toastDurationMs, 1_500)
  assert.equal(config.maxTextLength, 24)
})

test('resolveConfig normalizes quiet hours and drops garbage', () => {
  assert.equal(resolveConfig({ quietHours: '23:00-8:00' }).quietHours, '23:00-08:00')
  assert.equal(resolveConfig({ quietHours: 'nonsense' }).quietHours, '')
})

// ------------------------------------------------------------ quiet hours

test('parseQuietHours keeps only well formed ranges', () => {
  assert.deepEqual(parseQuietHours('23:00-08:00'), [{ start: 1380, end: 480 }])
  assert.deepEqual(parseQuietHours('12:00-13:30, 18:00-19:00'), [
    { start: 720, end: 810 },
    { start: 1080, end: 1140 },
  ])
  assert.deepEqual(parseQuietHours('24:00-25:00'), [])
  assert.deepEqual(parseQuietHours('10:00-10:00'), [])
  assert.deepEqual(parseQuietHours(''), [])
  assert.deepEqual(parseQuietHours(undefined), [])
})

test('inQuietHours handles ranges that wrap midnight', () => {
  const at = (h, m) => new Date(2026, 10, 6, h, m, 0)
  assert.equal(inQuietHours('23:00-08:00', at(23, 30)), true)
  assert.equal(inQuietHours('23:00-08:00', at(2, 0)), true)
  assert.equal(inQuietHours('23:00-08:00', at(7, 59)), true)
  assert.equal(inQuietHours('23:00-08:00', at(8, 0)), false)
  assert.equal(inQuietHours('23:00-08:00', at(12, 0)), false)
})

test('inQuietHours handles a same-day range', () => {
  const at = (h, m) => new Date(2026, 10, 6, h, m, 0)
  assert.equal(inQuietHours('12:00-13:30', at(13, 29)), true)
  assert.equal(inQuietHours('12:00-13:30', at(13, 30)), false)
  assert.equal(inQuietHours('', at(13, 0)), false)
})

// ---------------------------------------------------------------- filters

test('shouldDeliver skips disabled kinds and too short turns', () => {
  const config = resolveConfig({ events: { error: false }, turnDoneMinDurationMs: 60_000 })
  const seen = new Map()
  const now = Date.now()
  assert.equal(shouldDeliver({ config, event: { kind: 'error' }, seen, now }).deliver, false)
  assert.equal(
    shouldDeliver({ config, event: { kind: 'turn-done', durationMs: 5_000 }, seen, now }).deliver,
    false,
  )
  assert.equal(
    shouldDeliver({ config, event: { kind: 'turn-done', durationMs: 90_000 }, seen, now }).deliver,
    true,
  )
})

test('the default zero threshold announces every finished turn', () => {
  const config = resolveConfig({})
  const verdict = shouldDeliver({ config, event: { kind: 'turn-done', durationMs: 1_200 }, seen: new Map(), now: Date.now() })
  assert.equal(verdict.deliver, true)
  // An explicit threshold still filters short turns.
  const strict = resolveConfig({ turnDoneMinDurationMs: 30_000 })
  assert.equal(
    shouldDeliver({ config: strict, event: { kind: 'turn-done', durationMs: 1_200 }, seen: new Map(), now: Date.now() }).deliver,
    false,
  )
})

test('shouldDeliver collapses duplicates inside the window only', () => {
  const config = resolveConfig({ dedupeWindowMs: 5_000 })
  const seen = new Map()
  const event = { kind: 'approval', sessionId: 's1', toolName: 'bash' }
  assert.equal(shouldDeliver({ config, event, seen, now: 1_000 }).deliver, true)
  assert.equal(shouldDeliver({ config, event, seen, now: 3_000 }).deliver, false)
  assert.equal(shouldDeliver({ config, event, seen, now: 7_000 }).deliver, true)
  // Two different questions must not collapse into one; identical repeats do.
  const firstQuestion = { kind: 'question', sessionId: 's1', question: 'Which name?' }
  const secondQuestion = { kind: 'question', sessionId: 's1', question: 'Which colour?' }
  assert.equal(shouldDeliver({ config, event: firstQuestion, seen, now: 7_500 }).deliver, true)
  assert.equal(shouldDeliver({ config, event: secondQuestion, seen, now: 7_600 }).deliver, true)
  assert.equal(shouldDeliver({ config, event: firstQuestion, seen, now: 7_700 }).deliver, false)
})

test('shouldDeliver reports quiet hours without refusing delivery', () => {
  const config = resolveConfig({ quietHours: '00:00-23:59' })
  const verdict = shouldDeliver({ config, event: { kind: 'test' }, seen: new Map(), now: Date.now() })
  assert.equal(verdict.deliver, true)
  assert.equal(verdict.quiet, true)
})

test('dedupeKey separates kinds, sessions and tools', () => {
  assert.equal(dedupeKey({ kind: 'approval', sessionId: 'a', toolName: 'bash' }), 'approval|a|bash')
  assert.notEqual(dedupeKey({ kind: 'approval', sessionId: 'a' }), dedupeKey({ kind: 'approval', sessionId: 'b' }))
  assert.notEqual(dedupeKey({ kind: 'error' }), dedupeKey({ kind: 'test' }))
})

// ---------------------------------------------------------------- formatting

test('formatDuration is stable', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(12_400), '12s')
  assert.equal(formatDuration(65_000), '1m05s')
  assert.equal(formatDuration(125_000), '2m05s')
  assert.equal(formatDuration(3_725_000), '1h02m')
})

test('truncate collapses whitespace and cuts on a word', () => {
  assert.equal(truncate('  a   b  '), 'a b')
  assert.equal(truncate('x'.repeat(10), 5), 'xxxx…')
  const wide = 'alpha beta gamma delta epsilon'
  const cut = truncate(wide, 20)
  assert.ok(cut.length <= 20, `expected <= 20 chars, got ${cut.length}`)
  assert.ok(cut.endsWith('…'))
})

// ------------------------------------------------------------------- toast

test('xmlEscape escapes the five XML entities and drops control bytes', () => {
  assert.equal(xmlEscape('<a & b>"c"\'d\''), '&lt;a &amp; b&gt;&quot;c&quot;&apos;d&apos;')
  assert.equal(xmlEscape('a\u0000b'), 'ab')
})

test('buildToastXml carries both lines and honours silent', () => {
  const xml = buildToastXml({ title: '标题 <1>', body: '正文 & 内容' })
  assert.ok(xml.includes('<text>标题 &lt;1&gt;</text>'))
  assert.ok(xml.includes('<text>正文 &amp; 内容</text>'))
  assert.ok(!xml.includes('<audio'))
  assert.ok(buildToastXml({ title: 't', silent: true }).includes('<audio silent="true"/>'))
  assert.ok(!buildToastXml({ title: 't', body: '  ' }).includes('<text>  </text>'))
})

test('buildToastScript round-trips the XML through base64', () => {
  const xml = buildToastXml({ title: '需要授权', body: 'bash · rm -rf' })
  const script = buildToastScript({ xml, appId: 'com.deepseek.dsh' })
  const match = /FromBase64String\('([^']+)'\)/.exec(script)
  assert.ok(match !== null, 'script must embed a base64 payload')
  assert.equal(Buffer.from(match[1], 'base64').toString('utf8'), xml)
  // Pure ASCII keeps PowerShell 5.1 from guessing the file encoding wrong.
  assert.ok(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(script), 'script must be ASCII only')
  assert.ok(script.includes("CreateToastNotifier('com.deepseek.dsh')"))
})

test('buildToastScript escapes single quotes in the app id', () => {
  const script = buildToastScript({ xml: '<toast/>', appId: "a'b" })
  assert.ok(script.includes("CreateToastNotifier('a''b')"))
})

test('buildToastXml honours scenario and duration', () => {
  const important = buildToastXml({ title: 't', scenario: 'reminder', duration: 'long' })
  assert.ok(important.includes('scenario="reminder"'))
  assert.ok(important.includes('duration="long"'))
})

test('buildToastXml whitelists scenario and duration (no XML injection)', () => {
  const hostile = buildToastXml({ title: 't', scenario: '"><script>', duration: 'forever' })
  assert.ok(hostile.includes('scenario="default"'), 'unknown scenario must fall back to default')
  assert.ok(hostile.includes('duration="short"'), 'unknown duration must fall back to short')
  assert.ok(!hostile.includes('<script>'))
})

test('resolveConfig validates the chime volume', () => {
  assert.equal(resolveConfig({}).volume, 0.6)
  assert.equal(resolveConfig({ volume: 2 }).volume, 1)
  assert.equal(resolveConfig({ volume: 0 }).volume, 0.05)
  assert.equal(resolveConfig({ volume: 'loud' }).volume, 0.6)
  assert.equal(resolveConfig({ volume: 0.35 }).volume, 0.35)
  assert.equal(resolveConfig({}).chimeWithOsToast, false)
  assert.equal(resolveConfig({ chimeWithOsToast: true }).chimeWithOsToast, true)
})

// -------------------------------------------------------------- ring buffer

test('buildRevealScript is ASCII-only and matches the configured process', () => {
  const script = buildRevealScript({ processName: 'DeepSeek Harness' })
  assert.ok(script.includes("[DhReveal]::Find('DeepSeek Harness')"))
  assert.ok(script.includes('exit 3'))
  assert.ok(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(script), 'reveal script must be ASCII only')
  assert.ok(buildRevealScript({ processName: "a'b" }).includes("[DhReveal]::Find('a''b')"))
})

test('resolveConfig defaults the reveal behaviour', () => {
  assert.equal(resolveConfig({}).revealOnClick, true)
  assert.equal(resolveConfig({ revealOnClick: false }).revealOnClick, false)
  assert.equal(resolveConfig({}).windowProcessName, 'DeepSeek Harness')
  assert.equal(resolveConfig({ windowProcessName: '  ' }).windowProcessName, 'DeepSeek Harness')
})

test('collectReadTargets resolves seqs, session and all', () => {
  const items = [
    { seq: 1, sessionId: 'a', read: false },
    { seq: 2, sessionId: 'b', read: false },
    { seq: 3, sessionId: 'a', read: true },
    { seq: 4, sessionId: 'a' },
  ]
  assert.deepEqual(collectReadTargets(items, { seqs: [2] }), [2])
  assert.deepEqual(collectReadTargets(items, { sessionId: 'a' }), [1, 4])
  assert.deepEqual(collectReadTargets(items, { all: true }), [1, 2, 4])
  assert.deepEqual(collectReadTargets(items, {}), [])
  assert.deepEqual(collectReadTargets(items, { seqs: [3] }), [], 'already read entries are never returned')
  assert.deepEqual(collectReadTargets(undefined, { all: true }), [])
  assert.deepEqual(collectReadTargets(items, { seqs: ['x', 1] }), [1])
})

test('isCriticalKind marks the blocking kinds', () => {
  assert.equal(isCriticalKind('approval'), true)
  assert.equal(isCriticalKind('question'), true)
  assert.equal(isCriticalKind('turn-done'), false)
  assert.equal(isCriticalKind('error'), false)
  assert.equal(isCriticalKind(undefined), false)
})

test('resolveConfig normalizes notifyWhileViewing', () => {
  assert.equal(resolveConfig({}).notifyWhileViewing, 'important')
  assert.equal(resolveConfig({ notifyWhileViewing: 'never' }).notifyWhileViewing, 'never')
  assert.equal(resolveConfig({ notifyWhileViewing: 'sometimes' }).notifyWhileViewing, 'important')
})

test('RingBuffer can be seeded with a clock value so restarts stay monotonic', () => {
  const seeded = new RingBuffer(5, 1_700_000_000_000)
  const entry = seeded.push({ kind: 'a' })
  assert.equal(entry.seq, 1_700_000_000_000)
  // A page that remembered a smaller cursor still sees the entry.
  assert.deepEqual(seeded.since(10).map((item) => item.kind), ['a'])
  assert.deepEqual(new RingBuffer(5, Number.NaN).push({ kind: 'b' }).seq, 1)
})

test('RingBuffer numbers entries and reports incremental reads', () => {
  const buffer = new RingBuffer(3)
  buffer.push({ kind: 'a' })
  buffer.push({ kind: 'b' })
  assert.deepEqual(
    buffer.all().map((entry) => entry.seq),
    [1, 2],
  )
  assert.deepEqual(
    buffer.since(1).map((entry) => entry.kind),
    ['b'],
  )
  buffer.push({ kind: 'c' })
  buffer.push({ kind: 'd' })
  assert.deepEqual(
    buffer.all().map((entry) => entry.kind),
    ['b', 'c', 'd'],
  )
  assert.equal(buffer.nextSeq, 5)
})

// --------------------------------------------------------------- packaging

test('package.json exports every file it points at', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-feedback-hub')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (subpath.includes('*')) continue
    assert.ok(existsSync(join(root, target)), `missing export target for ${subpath}: ${target}`)
  }
  for (const entry of manifest.files) {
    if (entry.includes('*')) continue
    assert.ok(existsSync(join(root, entry)), `missing file listed in package.json: ${entry}`)
  }
})

test('the patch inserts the same package name the manifest declares', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes(`name: ${manifest.name}`), 'cordis.patch.yml must insert the manifest name')
  assert.ok(patch.includes(`id: ${manifest.name}`), 'cordis.patch.yml must use the manifest name as its id')
})

test('locale metadata is present in both languages', () => {
  for (const language of ['en', 'zh']) {
    const dictionary = JSON.parse(readFileSync(join(root, 'locale', `${language}.json`), 'utf8'))
    assert.equal(typeof dictionary.meta?.title, 'string', `${language}.json needs meta.title`)
    assert.equal(typeof dictionary.meta?.description, 'string', `${language}.json needs meta.description`)
    assert.ok(dictionary.meta.title.length > 0)
    assert.ok(dictionary.meta.description.length > 0)
  }
})

test('the client registers under the package name', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const client = readFileSync(join(root, 'client.js'), 'utf8')
  assert.ok(client.includes(`id: '${manifest.name}'`), 'client.js module id must equal the package name')
  assert.ok(client.includes('shell.overlay') && client.includes('settings.section'))
})

test('every default event kind has a UI label and a host toast entry', () => {
  const client = readFileSync(join(root, 'client.js'), 'utf8')
  const host = readFileSync(join(root, 'index.js'), 'utf8')
  for (const kind of EVENT_KINDS) {
    if (kind === 'test') continue
    assert.ok(DEFAULT_CONFIG.events[kind] !== undefined, `events.${kind} is missing from DEFAULT_CONFIG`)
    assert.ok(client.includes(`'kind.${kind}'`), `client.js needs a dictionary entry for kind.${kind}`)
  }
  for (const kind of ['approval', 'question', 'turn-done', 'error']) {
    assert.ok(host.includes(`${kind}: {`) || host.includes(`'${kind}': {`), `index.js needs toast copy for ${kind}`)
  }
})

// ------------------------------------------------------------------ report

const failures = results.filter((result) => !result.ok)
for (const result of results) {
  if (result.ok) continue
  console.error(`✗ ${result.name}`)
  console.error(String(result.error?.stack ?? result.error).replace(/^/gm, '    '))
}
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
if (failures.length > 0) process.exitCode = 1
