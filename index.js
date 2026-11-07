/**
 * dsh-feedback-hub — Host half.
 *
 * Watches the events that mean "the human is needed" or "the work finished",
 * keeps a bounded in-memory history, pushes it to the Web page over SSE, and
 * steps in with a Windows toast whenever no page can do the OS-level part.
 *
 * Everything here is read-only with respect to the agent loop: listeners on the
 * `approval/request` and `user-questions/request` waterfalls always call
 * `next()`, so a notification can never change what the user is asked or how
 * the request settles.
 */

import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import {
  RingBuffer,
  buildRevealScript,
  buildToastScript,
  buildToastXml,
  collectReadTargets,
  formatDuration,
  resolveConfig,
  shouldDeliver,
  truncate,
} from './core.js'

/** Route namespace; all three routes live under it. */
const ROUTE_PREFIX = '/dsh-feedback-hub'

/** A page reports at least this often; older reports no longer count as a live page. */
const PRESENCE_TTL_MS = 60_000

/** SSE keep-alive, so proxies and the browser do not consider the stream idle. */
const SSE_HEARTBEAT_MS = 15_000

/** Never run more than this many PowerShell toasts at once. */
const MAX_CONCURRENT_TOASTS = 4

const PLATFORM = process.platform

/**
 * Host-side copy for OS toasts. The in-app UI localizes from the page's own
 * dictionary; only the fallback channel needs text before a page can decide.
 */
const TOAST_TEXT = {
  zh: {
    approval: { title: '🔐 需要授权', body: (event) => join([event.toolName, event.reason]) },
    question: { title: '❓ 等待你的回答', body: (event) => join([event.header, event.question]) },
    'turn-done': {
      title: '✅ 任务完成',
      body: (event) => join([event.sessionTitle, event.durationMs === undefined ? '' : formatDuration(event.durationMs)]),
    },
    error: { title: '⚠️ 出错了', body: (event) => join([event.sessionTitle, event.errorMessage]) },
    'subagent-end': { title: '🧩 子代理结束', body: (event) => join([event.label]) },
    'workflow-end': { title: '🔀 工作流结束', body: (event) => join([event.label, event.errorMessage]) },
    test: { title: '🔔 测试通知', body: () => '通知通道正常，你可以继续工作了。' },
  },
  en: {
    approval: { title: '🔐 Authorization needed', body: (event) => join([event.toolName, event.reason]) },
    question: { title: '❓ Waiting for your answer', body: (event) => join([event.header, event.question]) },
    'turn-done': {
      title: '✅ Task finished',
      body: (event) => join([event.sessionTitle, event.durationMs === undefined ? '' : formatDuration(event.durationMs)]),
    },
    error: { title: '⚠️ Something failed', body: (event) => join([event.sessionTitle, event.errorMessage]) },
    'subagent-end': { title: '🧩 Subagent finished', body: (event) => join([event.label]) },
    'workflow-end': { title: '🔀 Workflow finished', body: (event) => join([event.label, event.errorMessage]) },
    test: { title: '🔔 Test notification', body: () => 'The notification channel works.' },
  },
}

/** @param {Array<string | undefined>} parts */
function join(parts) {
  return parts.filter((part) => typeof part === 'string' && part.trim() !== '').join(' · ')
}

/** Map a browser locale onto the two dictionaries above. */
function pickLanguage(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** host toast text for one event */
function toastTextFor(event, locale) {
  const dictionary = TOAST_TEXT[pickLanguage(locale)]
  const entry = dictionary[event.kind] ?? dictionary.test
  return { title: entry.title, body: truncate(entry.body(event), 200) }
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** Read and JSON-parse a small request body. Resolves to `undefined` when it is not JSON. */
async function readJsonBody(req, limitBytes = 32 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) return undefined
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * One process-wide hub. `apply` creates exactly one and disposes it with the
 * plugin, so no listener, route or timer can outlive the plugin row.
 */
class FeedbackHub {
  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx
   * @param {ReturnType<typeof resolveConfig>} settings
   */
  constructor(ctx, settings) {
    this.ctx = ctx
    this.settings = settings
    this.buffer = new RingBuffer(settings.historyLimit)
    this.seen = new Map()
    this.subscribers = new Set()
    this.presence = new Map()
    this.turnStarts = new Map()
    /** Recent candidates this plugin saw, for diagnosing "why no notification". */
    this.sightings = []
    /** Count of every session event type seen after commit (diagnonstic). */
    this.sessionEvents = new Map()
    this.mutedUntil = 0
    this.activeToasts = 0
    this.disposers = []
    this.timers = []
    this.disposed = false
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.track(() => this.ctx.on('approval/request', (req, next) => this.onApproval(req, next)))
    // Durable backstop: the `approval/request` waterfall can be claimed by an
    // earlier answerer (the Web dialog does exactly that), which means a
    // listener registered later is never invoked. The committed session event
    // is appended regardless, and this feed cannot be claimed.
    this.track(() => this.ctx.on('session/event', (session, event) => this.onSessionEvent(session, event)))
    this.track(() => this.ctx.on('user-questions/request', (request, next) => this.onQuestion(request, next)))
    this.track(() => this.ctx.on('agent/status', (payload) => this.onAgentStatus(payload)))
    this.track(() => this.ctx.on('agent/error', (payload) => this.onAgentError(payload)))
    this.track(() => this.ctx.on('subagent/end', (info) => this.onSubagentEnd(info)))
    this.track(() => this.ctx.on('workflow/end', (info, result) => this.onWorkflowEnd(info, result)))

    // Routes only exist in a profile that serves a Web GUI.
    this.track(() =>
      this.ctx.inject(['webServer'], (scoped) => {
        scoped.effect(() => this.registerRoutes(scoped), 'dsh-feedback-hub: routes')
      }),
    )

    this.timers.push(
      setInterval(() => this.prunePresence(), SSE_HEARTBEAT_MS).unref?.(),
      setInterval(() => this.heartbeat(), SSE_HEARTBEAT_MS).unref?.(),
    )
  }

  /** Wrap one registration so disposing the plugin disposes it too. */
  track(register) {
    try {
      const dispose = register()
      if (typeof dispose === 'function') this.disposers.push(dispose)
    } catch (error) {
      this.ctx.logger?.('dsh-feedback-hub')?.warn?.(error)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const timer of this.timers) clearInterval(timer)
    this.timers.length = 0
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // A disposer that throws must not keep the other ones from running.
      }
    }
    for (const subscriber of this.subscribers) {
      try {
        subscriber.res.end()
      } catch {
        // The socket may already be gone.
      }
    }
    this.subscribers.clear()
    this.presence.clear()
    this.buffer.clear()
  }

  // ------------------------------------------------------------------ events

  /** @param {any} req @param {() => Promise<any>} next */
  onApproval(req, next) {
    try {
      this.push({
        kind: 'approval',
        sessionId: sessionIdOf(req?.agent),
        sessionTitle: this.titleOf(req?.agent),
        toolName: req?.toolName,
        reason: localized(req?.displayReason) ?? req?.reason,
      })
    } catch {
      // Observing must never disturb the approval flow.
    }
    return next()
  }

  /**
   * Observe the durable session log. Only `approval/asked` matters here: the
   * `approval/request` waterfall is claimed by the Web dialog before later
   * listeners run, so this committed event is the reliable signal.
   * @param {any} session @param {any} event
   */
  onSessionEvent(session, event) {
    const type = event?.type
    if (typeof type === 'string') {
      this.sessionEvents.set(type, (this.sessionEvents.get(type) ?? 0) + 1)
      if (this.sessionEvents.size > 60) {
        // Keep the diagnostic map bounded; the feed is high frequency.
        const keep = [...this.sessionEvents].slice(-60)
        this.sessionEvents = new Map(keep)
      }
    }
    if (type !== 'approval/asked') return
    try {
      this.push({
        kind: 'approval',
        sessionId: session?.id,
        sessionTitle: this.titleOfSession(session),
        toolName: event.data?.toolName,
        reason: truncate(event.data?.reason ?? ''),
      })
    } catch {
      // Observing must never disturb the session.
    }
  }

  /** @param {any} request @param {() => Promise<any>} next */
  onQuestion(request, next) {    try {
      const first = request?.questions?.[0]
      const intent = first?.intent
      const isApproval = intent?.kind === 'approval' || intent?.kind === 'plan-review'
      this.push({
        kind: 'question',
        sessionId: sessionIdOf(request?.agent),
        sessionTitle: this.titleOf(request?.agent),
        header: first?.header,
        question: localized(intent?.display?.question) ?? first?.question,
        intentKind: intent?.kind,
        // A plan review or an inline approval is authorization by another name:
        // say so instead of asking the user to decode an option list.
        urgent: isApproval === true,
      })
    } catch {
      // Same rule as approvals: never break the question flow.
    }
    return next()
  }

  onAgentStatus(payload) {
    const agent = payload?.agent
    const id = sessionIdOf(agent)
    if (id === undefined) return
    if (payload?.status === 'running') {
      this.turnStarts.set(id, Date.now())
      return
    }
    const startedAt = this.turnStarts.get(id)
    if (startedAt === undefined) return
    this.turnStarts.delete(id)
    this.push({
      kind: 'turn-done',
      sessionId: id,
      sessionTitle: this.titleOf(agent),
      durationMs: Date.now() - startedAt,
    })
  }

  onAgentError(payload) {
    this.push({
      kind: 'error',
      sessionId: sessionIdOf(payload?.agent),
      sessionTitle: this.titleOf(payload?.agent),
      errorMessage: messageOf(payload?.error),
    })
  }

  onSubagentEnd(info) {
    this.push({
      kind: 'subagent-end',
      sessionId: info?.childSessionId ?? info?.sessionId ?? info?.id,
      label: info?.name ?? info?.title ?? info?.description ?? info?.provider,
      errorMessage: messageOf(info?.error ?? info?.failure),
    })
  }

  onWorkflowEnd(info, result) {
    this.push({
      kind: 'workflow-end',
      label: info?.name ?? info?.meta?.name ?? 'workflow',
      errorMessage: messageOf(result?.error),
    })
  }

  // -------------------------------------------------------------- delivery

  /**
   * Normalise, filter and publish one notification.
   * @param {Record<string, any>} partial
   * @param {{ force?: boolean }} [options] `force` bypasses toggles, quiet hours,
   *   dedupe and the minimum turn length (used by the test button).
   */
  push(partial, options = {}) {
    if (this.disposed) return undefined
    const now = Date.now()
    const event = { at: now, ...partial }
    const verdict = options.force
      ? { deliver: true, quiet: false }
      : shouldDeliver({ config: this.settings, event, seen: this.seen, now })
    // Record before filtering, so "the plugin never saw it" and "the plugin
    // deliberately dropped it" are distinguishable afterwards.
    this.recordSighting(event, verdict, options.force === true)
    if (!verdict.deliver) return undefined

    const muted = this.mutedUntil > now
    const silent = muted || verdict.quiet || this.settings.sound === false
    const entry = this.buffer.push({ ...event, quiet: verdict.quiet, muted, silent, read: false })
    this.broadcast(entry)
    this.maybeToast(entry)
    return entry
  }

  /** @param {{ seq: number }} entry */
  broadcast(entry) {
    this.broadcastFrame('notification', entry)
  }

  /** One SSE frame to every page; a broken socket is simply dropped. */
  broadcastFrame(event, payload) {
    if (this.subscribers.size === 0) return
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const subscriber of this.subscribers) {
      try {
        subscriber.res.write(frame)
      } catch {
        this.subscribers.delete(subscriber)
      }
    }
  }

  /**
   * Flip history entries to read. The Host owns this flag so it survives a page
   * reload and is shared by every open tab.
   * @returns the seqs that actually changed
   */
  markRead(request) {
    const items = this.buffer.all()
    const seqs = collectReadTargets(items, request ?? {})
    if (seqs.length === 0) return []
    const changed = new Set(seqs)
    const now = Date.now()
    for (const item of items) {
      if (!changed.has(item.seq)) continue
      item.read = true
      item.readAt = now
    }
    this.broadcastFrame('read', { seqs })
    return seqs
  }

  /** Drop the whole history; pages clear themselves when they see the frame. */
  clearHistory() {
    const cleared = this.buffer.all().length
    this.buffer.clear()
    this.broadcastFrame('clear', { cleared })
    return cleared
  }

  heartbeat() {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.res.write(': ping\n\n')
      } catch {
        this.subscribers.delete(subscriber)
      }
    }
  }

  prunePresence() {
    const now = Date.now()
    for (const [id, report] of this.presence) {
      if (now - report.at > PRESENCE_TTL_MS) this.presence.delete(id)
    }
  }

  /** The first live page that may raise an OS notification, if any. */
  livePage() {
    for (const report of this.presence.values()) {
      if (report.osNotify === 'granted') return report
    }
    return undefined
  }

  /** Locale most recently reported by a page, used only for fallback toast text. */
  pageLocale() {
    let latest
    for (const report of this.presence.values()) {
      if (latest === undefined || report.at > latest.at) latest = report
    }
    return latest?.locale
  }

  /**
   * What the Host believes about the page, exposed in `/snapshot` so the
   * settings page and a human debugging a missing notification can see it.
   */
  presenceSummary() {
    let latest
    for (const report of this.presence.values()) {
      if (latest === undefined || report.at > latest.at) latest = report
    }
    return {
      pages: this.presence.size,
      osNotify: latest?.osNotify ?? 'unknown',
      locale: latest?.locale ?? null,
      hidden: latest?.hidden ?? null,
      ageMs: latest === undefined ? null : Date.now() - latest.at,
    }
  }

  /**
   * Windows toast fallback. Runs only when the page cannot raise one itself
   * (`osToast: host`), or when no page reports notification permission.
   * @param {any} entry
   */
  maybeToast(entry) {
    const mode = this.settings.osToast
    if (mode === 'off' || mode === 'client') return
    if (mode === 'auto' && this.livePage() !== undefined) return
    this.showWindowsToast(entry)
  }

  /** Remember what this plugin saw, for the settings page's diagnosis list. */
  recordSighting(event, verdict, forced) {
    this.sightings.push({
      at: event.at,
      kind: event.kind,
      sessionId: event.sessionId ?? null,
      toolName: event.toolName ?? null,
      delivered: verdict.deliver === true,
      reason: forced === true ? 'forced' : (verdict.reason ?? null),
      quiet: verdict.quiet === true,
    })
    if (this.sightings.length > 30) this.sightings.splice(0, this.sightings.length - 30)
  }

  /** @param {any} entry */
  async showWindowsToast(entry) {
    if (PLATFORM !== 'win32') return
    if (this.activeToasts >= MAX_CONCURRENT_TOASTS) return
    const { title, body } = toastTextFor(entry, this.pageLocale())
    const important = entry.kind === 'approval' || entry.kind === 'question'
    const xml = buildToastXml({
      title,
      body,
      // Quiet hours / mute / `sound: false` are the only reasons to stay quiet.
      silent: entry.silent === true,
      // Authorization and questions stay on screen until dismissed; finished
      // work only needs a glance.
      scenario: important ? 'reminder' : 'default',
      duration: important ? 'long' : 'short',
    })
    const script = buildToastScript({ xml, appId: this.settings.toastAppId })
    const file = path.join(os.tmpdir(), `dsh-feedback-hub-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`)

    this.activeToasts += 1
    try {
      await fsp.writeFile(file, script, 'utf8')
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file],
        { stdio: 'ignore', windowsHide: true, detached: false },
      )
      const done = () => {
        this.activeToasts = Math.max(0, this.activeToasts - 1)
        fsp.rm(file, { force: true }).catch(() => {})
      }
      child.once('error', done)
      child.once('close', done)
      child.unref?.()
    } catch {
      this.activeToasts = Math.max(0, this.activeToasts - 1)
      fsp.rm(file, { force: true }).catch(() => {})
    }
  }

  // ------------------------------------------------------------- inspection

  /** Best-effort session title; absent when the title service is not composed. */
  titleOfSession(session) {
    if (session === undefined || session === null) return undefined
    try {
      const snapshot = this.ctx.get('sessionTitle')?.get?.(session)
      const title = snapshot?.title
      return typeof title === 'string' && title.trim() !== '' ? title.trim() : undefined
    } catch {
      return undefined
    }
  }

  /** @param {any} agent */
  titleOf(agent) {
    return this.titleOfSession(agent?.session)
  }

  /**
   * Resolve the Electron API, if this Host runs inside an Electron main process.
   *
   * Two shapes matter: `import('electron')` in an ESM context yields a namespace
   * whose default export is the binary path (not the API), while
   * `createRequire(...)('electron')` yields the familiar CJS API object. Try the
   * dynamic import first and fall back to `require`, then report a shape
   * diagnostic instead of failing silently.
   */
  async electronApi() {
    const pick = (candidate) => {
      if (candidate === null || candidate === undefined) return undefined
      if (typeof candidate.BrowserWindow?.getAllWindows === 'function') return candidate
      const fallback = candidate.default
      if (fallback !== undefined && fallback !== null && typeof fallback.BrowserWindow?.getAllWindows === 'function') return fallback
      return undefined
    }
    const shape = (candidate) => ({
      type: typeof candidate,
      keys: candidate !== null && typeof candidate === 'object' ? Object.keys(candidate).slice(0, 12) : [],
      defaultType: typeof candidate?.default,
    })

    try {
      const imported = await import('electron')
      const api = pick(imported)
      if (api !== undefined) return { api, via: 'import' }
    } catch (error) {
      // Not in Electron, or the module is unavailable in this realm.
    }
    try {
      const fromMain = process.mainModule?.require?.('electron')
      const api = pick(fromMain)
      if (api !== undefined) return { api, via: 'mainModule' }
    } catch (error) {
      // `process.mainModule` is absent under ESM entry points.
    }
    try {
      const required = createRequire(import.meta.url)('electron')
      const api = pick(required)
      if (api !== undefined) return { api, via: 'require' }
      return { api: undefined, via: 'require', diagnostics: { ...shape(required), electronVersion: process.versions.electron ?? null } }
    } catch (error) {
      return { api: undefined, via: 'require', diagnostics: { error: messageOf(error), electronVersion: process.versions.electron ?? null } }
    }
  }

  /**
   * Bring the DSH window back from the tray / taskbar and focus it.
   *
   * Two strategies, because the plugin module graph cannot always reach the
   * Electron API: `revealViaElectron` (fast, in-process) and a Win32 fallback
   * that enumerates the app's top-level windows, which also works for a window
   * hidden with `BrowserWindow.hide()`.
   */
  async revealWindow() {
    if (this.settings.revealOnClick !== true) return { ok: false, reason: 'disabled' }
    const electron = await this.revealViaElectron()
    if (electron.ok === true) return electron
    const win32 = await this.revealViaPowerShell()
    return { ...win32, electron }
  }

  /** Fast path: call `BrowserWindow` directly when this realm can resolve it. */
  async revealViaElectron() {
    const { api, via, diagnostics } = await this.electronApi()
    if (api === undefined) {
      return {
        ok: false,
        reason: process.versions.electron === undefined ? 'not-electron' : 'unsupported',
        via,
        diagnostics,
      }
    }
    let windows
    try {
      windows = api.BrowserWindow.getAllWindows().filter((win) => typeof win?.isDestroyed === 'function' && win.isDestroyed() === false)
    } catch (error) {
      return { ok: false, reason: 'no-window', via, message: messageOf(error) }
    }
    if (windows.length === 0) return { ok: false, reason: 'no-window', via }
    // Prefer a window that is already visible, then the last created one.
    const target = windows.find((win) => win.isVisible?.() === true) ?? windows[windows.length - 1]
    try {
      if (target.isMinimized?.() === true) target.restore?.()
      target.show?.()
      target.focus?.()
      target.moveTop?.()
      return { ok: true, via, windows: windows.length }
    } catch (error) {
      return { ok: false, reason: 'failed', via, message: messageOf(error) }
    }
  }

  /** Fallback: find the app window through Win32 and raise it. Windows only. */
  async revealViaPowerShell() {
    if (PLATFORM !== 'win32') return { ok: false, reason: 'platform', via: 'win32' }
    const script = buildRevealScript({ processName: this.settings.windowProcessName })
    const file = path.join(os.tmpdir(), `dsh-feedback-hub-reveal-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.ps1`)
    try {
      await fsp.writeFile(file, script, 'utf8')
      const code = await new Promise((resolve) => {
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file],
          { stdio: 'ignore', windowsHide: true },
        )
        const timer = setTimeout(() => {
          try {
            child.kill()
          } catch {
            // already gone
          }
          resolve(-2)
        }, 8_000)
        const settle = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
        child.once('error', () => settle(-1))
        child.once('close', (exitCode) => settle(exitCode ?? -1))
        child.unref?.()
      })
      fsp.rm(file, { force: true }).catch(() => {})
      if (code === 0) return { ok: true, via: 'win32' }
      // The script exits 3 when no window of that process exists.
      return { ok: false, reason: code === 3 ? 'no-window' : 'failed', via: 'win32', code }
    } catch (error) {
      fsp.rm(file, { force: true }).catch(() => {})
      return { ok: false, reason: 'failed', via: 'win32', message: messageOf(error) }
    }
  }

  // ----------------------------------------------------------------- routes

  /** @param {any} scoped */
  registerRoutes(scoped) {
    const disposers = [
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/events`, handler: (req, res) => this.handleEvents(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/snapshot`, handler: (req, res) => this.handleSnapshot(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/presence`, handler: (req, res) => this.handlePresence(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/test`, handler: (req, res) => this.handleTest(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/mute`, handler: (req, res) => this.handleMute(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/reveal`, handler: (req, res) => this.handleReveal(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/read`, handler: (req, res) => this.handleRead(req, res) }),
      scoped.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}/clear`, handler: (req, res) => this.handleClear(req, res) }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }

  /** Server-sent events: backlog after `?since=`, then every new notification. */
  handleEvents(req, res) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'GET only' })
      return
    }
    const since = Number(new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('since') ?? '0')
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('retry: 3000\n\n')
    for (const entry of this.buffer.since(Number.isFinite(since) ? since : 0)) {
      res.write(`event: notification\ndata: ${JSON.stringify(entry)}\n\n`)
    }
    const subscriber = { res }
    this.subscribers.add(subscriber)
    const drop = () => {
      this.subscribers.delete(subscriber)
    }
    req.on('close', drop)
    req.on('error', drop)
  }

  handleSnapshot(req, res) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'GET only' })
      return
    }
    const since = Number(new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('since') ?? '0')
    sendJson(res, 200, {
      ok: true,
      platform: PLATFORM,
      cursor: this.buffer.nextSeq - 1,
      items: this.buffer.since(Number.isFinite(since) ? since : 0),
      mutedUntil: this.mutedUntil,
      presence: this.presenceSummary(),
      sightings: this.sightings.slice(-15),
      sessionEvents: Object.fromEntries(this.sessionEvents),
      config: {
        events: this.settings.events,
        turnDoneMinDurationMs: this.settings.turnDoneMinDurationMs,
        quietHours: this.settings.quietHours,
        dedupeWindowMs: this.settings.dedupeWindowMs,
        osToast: this.settings.osToast,
        sound: this.settings.sound,
        volume: this.settings.volume,
        chimeWithOsToast: this.settings.chimeWithOsToast,
        notifyWhileViewing: this.settings.notifyWhileViewing,
        revealOnClick: this.settings.revealOnClick,
        toastDurationMs: this.settings.toastDurationMs,
        historyLimit: this.settings.historyLimit,
      },
    })
  }

  async handlePresence(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (req.headers['x-dsh-feedback-hub'] !== '1') {
      sendJson(res, 403, { ok: false, error: 'missing plugin header' })
      return
    }
    const body = await readJsonBody(req)
    if (body === undefined || typeof body !== 'object' || body === null) {
      sendJson(res, 400, { ok: false, error: 'expected a JSON object' })
      return
    }
    const id = typeof body.clientId === 'string' && body.clientId !== '' ? body.clientId.slice(0, 64) : 'unknown'
    this.presence.set(id, {
      at: Date.now(),
      osNotify: ['granted', 'denied', 'default', 'unsupported'].includes(body.osNotify) ? body.osNotify : 'unknown',
      locale: typeof body.locale === 'string' ? body.locale.slice(0, 32) : undefined,
      hidden: body.hidden === true,
    })
    sendJson(res, 200, { ok: true })
  }

  async handleTest(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (req.headers['x-dsh-feedback-hub'] !== '1') {
      sendJson(res, 403, { ok: false, error: 'missing plugin header' })
      return
    }
    const body = (await readJsonBody(req)) ?? {}
    const kind = typeof body.kind === 'string' ? body.kind : 'test'
    const entry = this.push(testEvent(kind), { force: true })
    sendJson(res, 200, { ok: true, entry })
  }

  async handleMute(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (req.headers['x-dsh-feedback-hub'] !== '1') {
      sendJson(res, 403, { ok: false, error: 'missing plugin header' })
      return
    }
    const body = (await readJsonBody(req)) ?? {}
    const minutes = Number.isFinite(body.minutes) ? Math.min(24 * 60, Math.max(0, Math.round(body.minutes))) : 0
    this.mutedUntil = minutes === 0 ? 0 : Date.now() + minutes * 60_000
    sendJson(res, 200, { ok: true, mutedUntil: this.mutedUntil })
  }

  /** Bring the window back after a notification click; also reports the session. */
  async handleReveal(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (req.headers['x-dsh-feedback-hub'] !== '1') {
      sendJson(res, 403, { ok: false, error: 'missing plugin header' })
      return
    }
    const body = (await readJsonBody(req)) ?? {}
    const revealed = await this.revealWindow()
    sendJson(res, 200, { ...revealed, sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined })
  }

  /** Mark history read: `{ seqs: [...] }`, `{ sessionId }` or `{ all: true }`. */
  async handleRead(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (req.headers['x-dsh-feedback-hub'] !== '1') {
      sendJson(res, 403, { ok: false, error: 'missing plugin header' })
      return
    }
    const body = (await readJsonBody(req)) ?? {}
    const seqs = this.markRead({
      seqs: Array.isArray(body.seqs) ? body.seqs : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      all: body.all === true,
    })
    sendJson(res, 200, { ok: true, seqs })
  }

  /** Drop the whole history (and tell every page). */
  async handleClear(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (req.headers['x-dsh-feedback-hub'] !== '1') {
      sendJson(res, 403, { ok: false, error: 'missing plugin header' })
      return
    }
    const cleared = this.clearHistory()
    sendJson(res, 200, { ok: true, cleared })
  }
}

/** Synthetic shapes for the "send a test notification" buttons. */
function testEvent(kind) {
  const base = { kind, at: Date.now(), sessionTitle: 'dsh-feedback-hub' }
  switch (kind) {
    case 'approval':
      return { ...base, toolName: 'bash', reason: 'test notification' }
    case 'question':
      return { ...base, question: 'This is a test question.', header: 'test' }
    case 'turn-done':
      return { ...base, durationMs: 125_000 }
    case 'error':
      return { ...base, errorMessage: 'This is a test error.' }
    default:
      return { ...base, kind: 'test' }
  }
}

/** @param {any} agent */
function sessionIdOf(agent) {
  const id = agent?.id ?? agent?.session?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** Pick a readable string out of an `{ en, [locale] }` display record. */
function localized(record) {
  if (record === undefined || record === null) return undefined
  if (typeof record === 'string') return record
  for (const key of ['zh', 'zh-CN', 'zh-cn', 'en']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/** @param {unknown} error */
function messageOf(error) {
  if (error === undefined || error === null) return undefined
  if (typeof error === 'string') return truncate(error)
  const message = error?.message ?? error?.reason ?? error?.code
  return typeof message === 'string' ? truncate(message) : undefined
}

/**
 * Plugin entry point. Every resource is registered on `ctx`, so disabling or
 * removing the row leaves nothing behind.
 * @param {any} ctx
 * @param {unknown} config
 */
export function apply(ctx, config) {
  const settings = resolveConfig(config)
  const hub = new FeedbackHub(ctx, settings)
  hub.start()
  ctx.effect(() => () => hub.dispose(), 'dsh-feedback-hub: hub')
  return () => hub.dispose()
}

export const name = 'dsh-feedback-hub'

export { FeedbackHub }
