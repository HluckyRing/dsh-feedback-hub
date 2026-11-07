/**
 * dsh-feedback-hub — pure helpers shared by the Host half, the Client half and
 * `test/smoke.mjs`.
 *
 * This module deliberately imports nothing: it has no closure over `ctx`, no
 * timers and no I/O, so it can be unit tested with plain `node`.
 */

/** Every notification kind this plugin can emit. */
export const EVENT_KINDS = [
  'approval',
  'question',
  'turn-done',
  'error',
  'subagent-end',
  'workflow-end',
  'test',
]

/** Kinds the user has to act on; they keep their notification even while focused. */
export const CRITICAL_KINDS = new Set(['approval', 'question'])

/** True for the kinds that block the agent until the user acts. */
export function isCriticalKind(kind) {
  return CRITICAL_KINDS.has(kind)
}

/** How each kind behaves by default. */
export const DEFAULT_CONFIG = {
  events: {
    approval: true,
    question: true,
    'turn-done': true,
    error: true,
    'subagent-end': false,
    'workflow-end': false,
  },
  /**
   * A finished turn shorter than this is not announced (0 = announce every turn).
   * Defaults to 0: "task finished" is worth knowing even for short tasks, and the
   * session you are actually looking at suppresses it anyway.
   */
  turnDoneMinDurationMs: 0,
  /** "23:00-08:00" / "12:00-13:30,18:00-19:00" (comma separated). Empty disables. */
  quietHours: '',
  /** Identical events inside this window collapse into one notification. */
  dedupeWindowMs: 5_000,
  /**
   * Which surface owns the OS-level toast.
   * - `auto`   the page reports back and the host only steps in when it cannot
   * - `client` page only (never spawn a process)
   * - `host`   always from the Host (works even when no page is connected)
   * - `off`    no OS toast at all
   */
  osToast: 'auto',
  /** Play the in-app chime. */
  sound: true,
  /** Chime loudness, 0–1. Only used when the OS toast is not the one making the sound. */
  volume: 0.6,
  /** Play the chime even when a system notification already rings. */
  chimeWithOsToast: false,
  /**
   * What happens when a notification arrives for the session on screen.
   * - `important` (default) authorization and questions still pop a toast
   * - `never`     everything is just marked read
   */
  notifyWhileViewing: 'important',
  /** Clicking a notification brings the DSH window back (desktop only). */
  revealOnClick: true,
  /** Window-process name used by the Win32 reveal fallback (desktop app's exe name). */
  windowProcessName: 'DeepSeek Harness',
  /** Android/Windows toast identity; the DSH desktop app's own AUMID by default. */
  toastAppId: 'com.deepseek.dsh',
  /** How long an in-app toast stays on screen. */
  toastDurationMs: 8_000,
  /** Ring-buffer length kept in Host memory (never written to disk). */
  historyLimit: 100,
  /** Longest single line of text put into a notification. */
  maxTextLength: 160,
}

const OS_TOAST_MODES = new Set(['auto', 'client', 'host', 'off'])

/** @param {unknown} value @returns {boolean} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {unknown} value @param {number} fallback @param {number} min @param {number} max */
function clampNumber(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Merge user config over {@link DEFAULT_CONFIG} and drop anything invalid.
 * Unknown keys survive on the returned object so a future version can read
 * them, but they never influence the current behaviour.
 * @param {unknown} raw the `config` object handed to `apply()`.
 */
export function resolveConfig(raw) {
  const input = isPlainObject(raw) ? raw : {}
  const eventsInput = isPlainObject(input.events) ? input.events : {}
  const events = { ...DEFAULT_CONFIG.events }
  for (const kind of EVENT_KINDS) {
    if (typeof eventsInput[kind] === 'boolean') events[kind] = eventsInput[kind]
  }

  const quietHours = typeof input.quietHours === 'string' ? normalizeQuietHours(input.quietHours) : ''
  const toastAppId =
    typeof input.toastAppId === 'string' && input.toastAppId.trim() !== ''
      ? input.toastAppId.trim()
      : DEFAULT_CONFIG.toastAppId
  const rawVolume = typeof input.volume === 'number' && Number.isFinite(input.volume) ? input.volume : DEFAULT_CONFIG.volume
  const volume = Math.round(Math.min(1, Math.max(0.05, rawVolume)) * 100) / 100

  return {
    ...DEFAULT_CONFIG,
    ...input,
    events,
    turnDoneMinDurationMs: clampNumber(
      input.turnDoneMinDurationMs,
      DEFAULT_CONFIG.turnDoneMinDurationMs,
      0,
      24 * 60 * 60 * 1000,
    ),
    dedupeWindowMs: clampNumber(input.dedupeWindowMs, DEFAULT_CONFIG.dedupeWindowMs, 0, 10 * 60 * 1000),
    toastDurationMs: clampNumber(input.toastDurationMs, DEFAULT_CONFIG.toastDurationMs, 1_500, 60_000),
    historyLimit: clampNumber(input.historyLimit, DEFAULT_CONFIG.historyLimit, 10, 500),
    maxTextLength: clampNumber(input.maxTextLength, DEFAULT_CONFIG.maxTextLength, 24, 500),
    quietHours,
    osToast: OS_TOAST_MODES.has(input.osToast) ? input.osToast : DEFAULT_CONFIG.osToast,
    sound: input.sound !== false,
    volume,
    chimeWithOsToast: input.chimeWithOsToast === true,
    notifyWhileViewing: input.notifyWhileViewing === 'never' ? 'never' : 'important',
    revealOnClick: input.revealOnClick !== false,
    windowProcessName:
      typeof input.windowProcessName === 'string' && input.windowProcessName.trim() !== ''
        ? input.windowProcessName.trim()
        : DEFAULT_CONFIG.windowProcessName,
    toastAppId,
  }
}

/**
 * Parse one or more `HH:MM-HH:MM` ranges, keeping only well formed ones.
 * @param {string} spec
 * @returns {Array<{ start: number, end: number }>} ranges as minutes of day
 */
export function parseQuietHours(spec) {
  if (typeof spec !== 'string' || spec.trim() === '') return []
  const ranges = []
  for (const piece of spec.split(',')) {
    const match = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(piece)
    if (match === null) continue
    const start = Number(match[1]) * 60 + Number(match[2])
    const end = Number(match[3]) * 60 + Number(match[4])
    if (Number(match[1]) > 23 || Number(match[2]) > 59) continue
    if (Number(match[3]) > 23 || Number(match[4]) > 59) continue
    if (start === end) continue
    ranges.push({ start, end })
  }
  return ranges
}

/** Canonical form of a quiet-hours spec, or `''` when nothing parses. */
export function normalizeQuietHours(spec) {
  const ranges = parseQuietHours(spec)
  if (ranges.length === 0) return ''
  return ranges
    .map(({ start, end }) => `${two(start / 60 | 0)}:${two(start % 60)}-${two(end / 60 | 0)}:${two(end % 60)}`)
    .join(',')
}

/** @param {number} n */
function two(n) {
  return String(n).padStart(2, '0')
}

/**
 * Is `date` inside a quiet-hours range? Ranges that wrap midnight (`23:00-08:00`)
 * match on both sides of the wrap.
 * @param {string} spec
 * @param {Date | number} [date]
 */
export function inQuietHours(spec, date = new Date()) {
  const ranges = parseQuietHours(spec)
  if (ranges.length === 0) return false
  const at = date instanceof Date ? date : new Date(date)
  const minutes = at.getHours() * 60 + at.getMinutes()
  for (const { start, end } of ranges) {
    if (start < end) {
      if (minutes >= start && minutes < end) return true
    } else if (minutes >= start || minutes < end) {
      return true
    }
  }
  return false
}

/**
 * Collapse whitespace and cut to `max` characters on a word boundary when one
 * is close enough, appending an ellipsis.
 * @param {unknown} value
 * @param {number} [max]
 */
export function truncate(value, max = DEFAULT_CONFIG.maxTextLength) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, Math.max(0, max - 1))
  const space = cut.lastIndexOf(' ')
  const body = space > max * 0.6 ? cut.slice(0, space) : cut
  return `${body}…`
}

/**
 * Human duration without locale words: `12s`, `1m05s`, `2h03m`.
 * @param {number} ms
 */
export function formatDuration(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes}m${two(seconds)}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${two(minutes % 60)}m`
}

/**
 * Escape a string for use as XML text content.
 * @param {unknown} value
 */
export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // XML 1.0 forbids most control characters; drop them instead of failing to parse.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** Windows toast scenarios we allow; anything else falls back to `default`. */
const TOAST_SCENARIOS = new Set(['default', 'reminder', 'alarm', 'incomingCall'])
/** Windows toast durations; `long` keeps the banner up ~25s instead of ~5s. */
const TOAST_DURATIONS = new Set(['short', 'long'])

/**
 * Build the ToastGeneric payload. Kept free of locale-specific markup so the
 * Host never needs to know the user's language.
 * @param {{ title: string, body?: string, silent?: boolean, scenario?: string, duration?: string }} input
 */
export function buildToastXml({ title, body = '', silent = false, scenario = 'default', duration = 'short' }) {
  const lines = [`<text>${xmlEscape(title)}</text>`]
  if (String(body).trim() !== '') lines.push(`<text>${xmlEscape(body)}</text>`)
  const audio = silent ? '<audio silent="true"/>' : ''
  const safeScenario = TOAST_SCENARIOS.has(scenario) ? scenario : 'default'
  const safeDuration = TOAST_DURATIONS.has(duration) ? duration : 'short'
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<toast activationType="foreground" scenario="${safeScenario}" duration="${safeDuration}">`,
    '<visual><binding template="ToastGeneric">',
    lines.join(''),
    '</binding></visual>',
    audio,
    '</toast>',
  ].join('')
}

/**
 * PowerShell 5.1 script that shows one Windows toast.
 *
 * The XML is carried as base64 so the script stays pure ASCII: this sidesteps
 * the BOM/`-Encoding` problems that mangle non-ASCII text when a `.ps1` file is
 * written and re-read on Windows.
 * @param {{ xml: string, appId: string }} input
 */
export function buildToastScript({ xml, appId }) {
  const payload = Buffer.from(xml, 'utf8').toString('base64')
  const id = String(appId ?? DEFAULT_CONFIG.toastAppId).replace(/'/g, "''")
  return [
    "$ErrorActionPreference = 'Stop'",
    '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
    '[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]',
    `$xml = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payload}'))`,
    '$doc = New-Object Windows.Data.Xml.Dom.XmlDocument',
    '$doc.LoadXml($xml)',
    '$toast = New-Object Windows.UI.Notifications.ToastNotification $doc',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${id}').Show($toast)`,
    '',
  ].join('\r\n')
}

/**
 * Stable dedupe key for one notification. Two approvals for the same tool in
 * the same session within the window collapse; two questions do not.
 * @param {{ kind: string, sessionId?: string, toolName?: string, at?: number }} event
 */
export function dedupeKey(event) {
  const scope = event.sessionId ?? '-'
  const detail = event.toolName ?? (event.kind === 'question' ? String(event.question ?? '').slice(0, 40) : '')
  return `${event.kind}|${scope}|${detail}`
}

/**
 * Decide whether one normalised notification should be delivered.
 * @param {object} input
 * @param {ReturnType<typeof resolveConfig>} input.config
 * @param {{ kind: string, sessionId?: string, toolName?: string, durationMs?: number }} input.event
 * @param {Map<string, number>} input.seen dedupe memory, mutated in place
 * @param {number} input.now epoch milliseconds
 * @returns {{ deliver: boolean, quiet: boolean, reason?: string }}
 */
export function shouldDeliver({ config, event, seen, now }) {
  // `test` is not a user-toggleable trigger: the settings page sends it on demand.
  if (event.kind !== 'test' && config.events[event.kind] !== true) {
    return { deliver: false, quiet: false, reason: 'disabled' }
  }
  if (event.kind === 'turn-done' && config.turnDoneMinDurationMs > 0) {
    if (!(event.durationMs >= config.turnDoneMinDurationMs)) {
      return { deliver: false, quiet: false, reason: 'too-short' }
    }
  }
  const key = dedupeKey(event)
  const last = seen.get(key)
  if (last !== undefined && config.dedupeWindowMs > 0 && now - last < config.dedupeWindowMs) {
    return { deliver: false, quiet: false, reason: 'duplicate' }
  }
  seen.set(key, now)
  // Drop stale dedupe entries so the map cannot grow without bound.
  if (seen.size > 256) {
    for (const [entryKey, at] of seen) {
      if (now - at > Math.max(config.dedupeWindowMs, 60_000)) seen.delete(entryKey)
    }
  }
  return { deliver: true, quiet: inQuietHours(config.quietHours, now) }
}

/**
 * PowerShell that finds the app's top-level window — including one hidden to the
 * tray, which `Get-Process.MainWindowHandle` reports as `0` — and raises it.
 *
 * Exit code: `0` revealed, `3` no window found, anything else failure. The script
 * is pure ASCII so PowerShell 5.1 cannot misread its encoding.
 * @param {{ processName?: string }} input
 */
export function buildRevealScript({ processName }) {
  const name = String(processName ?? DEFAULT_CONFIG.windowProcessName).replace(/'/g, "''")
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @\'',
    'using System;',
    'using System.Collections.Generic;',
    'using System.Diagnostics;',
    'using System.Runtime.InteropServices;',
    'public static class DhReveal {',
    '  private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);',
    '  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr l);',
    '  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr h);',
    '  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int c);',
    '  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);',
    '  [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr h);',
    '  [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);',
    '  public static IntPtr Find(string processName) {',
    '    var ids = new HashSet<uint>();',
    '    foreach (var p in Process.GetProcessesByName(processName)) ids.Add((uint)p.Id);',
    '    if (ids.Count == 0) return IntPtr.Zero;',
    '    IntPtr hidden = IntPtr.Zero;',
    '    IntPtr shown = IntPtr.Zero;',
    '    EnumWindows(delegate (IntPtr h, IntPtr l) {',
    '      uint pid; GetWindowThreadProcessId(h, out pid);',
    '      if (!ids.Contains(pid)) return true;',
    '      if (GetWindowTextLength(h) == 0) return true;',
    '      if (IsWindowVisible(h)) { if (shown == IntPtr.Zero) shown = h; }',
    '      else if (hidden == IntPtr.Zero) hidden = h;',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return shown != IntPtr.Zero ? shown : hidden;',
    '  }',
    '  public static void Raise(IntPtr h) {',
    '    ShowWindow(h, 9);',
    '    ShowWindow(h, 5);',
    '    BringWindowToTop(h);',
    '    SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 3);',
    '    SetWindowPos(h, new IntPtr(-2), 0, 0, 0, 0, 3);',
    '    SetForegroundWindow(h);',
    '  }',
    '}',
    "'@",
    `$handle = [DhReveal]::Find('${name}')`,
    'if ($handle -eq [IntPtr]::Zero) { exit 3 }',
    '[DhReveal]::Raise($handle)',
    'exit 0',
    '',
  ].join('\r\n')
}
/**
 * Which entries a read-mark request flips. Explicit seqs, everything belonging
 * to one session, or the whole history — the caller decides, this only resolves.
 * Entries that are already read are never returned.
 * @param {Array<{ seq: number, sessionId?: string, read?: boolean }>} items
 * @param {{ seqs?: number[], sessionId?: string, all?: boolean }} request
 * @returns {number[]}
 */
export function collectReadTargets(items, request) {
  if (!Array.isArray(items)) return []
  const wanted = new Set(
    Array.isArray(request?.seqs) ? request.seqs.filter((value) => typeof value === 'number' && Number.isFinite(value)) : [],
  )
  const bySession = typeof request?.sessionId === 'string' && request.sessionId !== ''
  const targets = []
  for (const item of items) {
    if (item === null || typeof item !== 'object' || item.read === true) continue
    const hit = request?.all === true || wanted.has(item.seq) || (bySession && item.sessionId === request.sessionId)
    if (hit) targets.push(item.seq)
  }
  return targets
}

/**
 * Bounded, monotonically numbered buffer. `seq` is the cursor the page sends
 * back when it reconnects, so a short disconnect loses nothing.
 *
 * `startSeq` should be seeded with `Date.now()` by the Host: a page keeps its
 * cursor in memory, so a restart that reused small numbers would make every new
 * entry look like a duplicate and silently drop it.
 * @template T
 */
export class RingBuffer {
  /** @param {number} limit @param {number} [startSeq] */
  constructor(limit = DEFAULT_CONFIG.historyLimit, startSeq = 1) {
    this.limit = Math.max(1, limit)
    const seed = Number(startSeq)
    this.nextSeq = Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : 1
    this.items = []
  }

  /** @param {Omit<T, 'seq'> & { seq?: number }} item */
  push(item) {
    const seq = this.nextSeq++
    const entry = { ...item, seq }
    this.items.push(entry)
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit)
    return entry
  }

  /** Everything after `cursor` (exclusive), in order. */
  since(cursor = 0) {
    return this.items.filter((item) => item.seq > cursor)
  }

  /** Everything currently held, oldest first. */
  all() {
    return this.items.slice()
  }

  clear() {
    this.items.length = 0
  }
}
