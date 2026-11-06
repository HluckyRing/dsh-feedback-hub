/**
 * dsh-feedback-hub — Client half.
 *
 * Subscribes to the Host's SSE stream and turns notifications into three
 * surfaces: a toast stack in `shell.overlay`, an unread bell beside Settings,
 * and a settings page with channel status plus test buttons.
 *
 * Constraints this file respects:
 * - no Harness client package is imported; React comes from the module table;
 * - styles are plain CSS using `--dsw-alias-*` tokens only;
 * - every registration is created inside `apply` and disposed with the plugin.
 */

window.__ModuleLoader__.load({
  id: 'dsh-feedback-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ------------------------------------------------------------ dictionary

    const DICT = {
      zh: {
        'bell.tooltip': '通知中心',
        'bell.empty': '还没有通知',
        'bell.markAll': '全部已读',
        'bell.mute': '静音 1 小时',
        'bell.unmute': '取消静音',
        'bell.settings': '通知设置',
        'kind.approval': '需要授权',
        'kind.question': '等待你的回答',
        'kind.turn-done': '任务完成',
        'kind.error': '出错了',
        'kind.subagent-end': '子代理结束',
        'kind.workflow-end': '工作流结束',
        'kind.test': '测试通知',
        'kind.unknown': '通知',
        'settings.title': '通知中心',
        'settings.desc': '授权请求、代理提问和任务完成时给你反馈。窗口失焦或隐藏时会弹系统通知。',
        'settings.hint.path': '也可以从「设置 → 通知中心」打开这一页',
        'settings.channel.title': '通道状态',
        'settings.channel.page': '页面连线',
        'settings.channel.permission': '桌面通知权限',
        'settings.channel.sound': '提示音',
        'settings.channel.fallback': '系统兜底',
        'settings.value.connected': '已连接',
        'settings.value.disconnected': '未连接',
        'settings.value.on': '开',
        'settings.value.off': '关',
        'settings.value.granted': '已允许',
        'settings.value.denied': '已拒绝',
        'settings.value.default': '未询问',
        'settings.value.unsupported': '不支持',
        'settings.value.auto': '自动',
        'settings.value.host': '仅 Host',
        'settings.value.client': '仅页面',
        'settings.events.title': '触发事件',
        'settings.events.hint': '这些开关来自插件配置（cordis.patch.yml），改完重载插件生效。',
        'settings.test.title': '测试',
        'settings.test.hint': '点一下应当立刻看到浮窗和提示音；窗口失焦时会弹系统通知。',
        'settings.test.send': '测试',
        'settings.grant': '允许桌面通知',
        'settings.granted': '桌面通知已开启',
        'settings.mute': '静音 1 小时',
        'settings.muted': '已静音至 {time}',
        'settings.unmute': '取消静音',
        'settings.clear': '清空历史',
        'settings.empty': '暂无历史通知',
        'settings.time.justNow': '刚刚',
        'settings.time.minutes': '{n} 分钟前',
        'settings.time.hours': '{n} 小时前',
      },
      en: {
        'bell.tooltip': 'Notifications',
        'bell.empty': 'Nothing yet',
        'bell.markAll': 'Mark all read',
        'bell.mute': 'Mute for 1 hour',
        'bell.unmute': 'Unmute',
        'bell.settings': 'Notification settings',
        'kind.approval': 'Authorization needed',
        'kind.question': 'Waiting for your answer',
        'kind.turn-done': 'Task finished',
        'kind.error': 'Something failed',
        'kind.subagent-end': 'Subagent finished',
        'kind.workflow-end': 'Workflow finished',
        'kind.test': 'Test notification',
        'kind.unknown': 'Notification',
        'settings.title': 'Notifications',
        'settings.desc':
          'Feedback when the agent needs your authorization, asks a question, or finishes a task. OS notifications appear while the window is unfocused or hidden.',
        'settings.hint.path': 'Also available under Settings → Notifications',
        'settings.channel.title': 'Channels',
        'settings.channel.page': 'Page link',
        'settings.channel.permission': 'Desktop notifications',
        'settings.channel.sound': 'Chime',
        'settings.channel.fallback': 'System fallback',
        'settings.value.connected': 'connected',
        'settings.value.disconnected': 'disconnected',
        'settings.value.on': 'on',
        'settings.value.off': 'off',
        'settings.value.granted': 'granted',
        'settings.value.denied': 'denied',
        'settings.value.default': 'not asked',
        'settings.value.unsupported': 'unsupported',
        'settings.value.auto': 'automatic',
        'settings.value.host': 'host only',
        'settings.value.client': 'page only',
        'settings.events.title': 'Triggers',
        'settings.events.hint': 'These toggles come from the plugin config (cordis.patch.yml); reload the plugin after editing.',
        'settings.test.title': 'Test',
        'settings.test.hint': 'You should see a toast and hear a chime immediately; an OS notification appears while the window is unfocused.',
        'settings.test.send': 'Test',
        'settings.grant': 'Enable desktop notifications',
        'settings.granted': 'Desktop notifications enabled',
        'settings.mute': 'Mute for 1 hour',
        'settings.muted': 'Muted until {time}',
        'settings.unmute': 'Unmute',
        'settings.clear': 'Clear history',
        'settings.empty': 'No history yet',
        'settings.time.justNow': 'just now',
        'settings.time.minutes': '{n} min ago',
        'settings.time.hours': '{n} h ago',
      },
    }

    const KIND_META = {
      approval: { icon: '🔐', tone: 'brand' },
      question: { icon: '❓', tone: 'warn' },
      'turn-done': { icon: '✅', tone: 'success' },
      error: { icon: '⚠️', tone: 'error' },
      'subagent-end': { icon: '🧩', tone: 'idle' },
      'workflow-end': { icon: '🔀', tone: 'idle' },
      test: { icon: '🔔', tone: 'brand' },
    }

    const TONE_VAR = {
      brand: 'var(--dsw-alias-brand-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    // ------------------------------------------------------------------ utils

    /** Read a service without making it a hard dependency. */
    function service(ctx, name) {
      try {
        const viaGet = ctx.get?.(name)
        if (viaGet !== undefined) return viaGet
      } catch {
        // fall through to the property form
      }
      try {
        return ctx[name]
      } catch {
        return undefined
      }
    }

    /** Active locale id: the locale service first, the browser second. */
    function detectLocale(ctx) {
      try {
        const locale = service(ctx, 'locale')
        const snapshot = locale?.getLocale?.() ?? locale?.getSnapshot?.()
        const id = snapshot?.id ?? snapshot?.locale ?? snapshot?.language ?? snapshot?.tag
        if (typeof id === 'string' && id !== '') return id
      } catch {
        // fall through to the browser
      }
      return typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en'
    }

    /**
     * Build the translator. The dictionary is registered with the host's locale
     * service when possible; if that registration is unavailable (or does not
     * resolve keys), a local lookup over the same dictionary is used so the UI
     * never renders raw keys.
     */
    function createText(ctx) {
      const locale = service(ctx, 'locale')
      let bound
      try {
        locale?.register?.('dsh-feedback-hub', 'zh', DICT.zh)
        locale?.register?.('dsh-feedback-hub', 'en', DICT.en)
        const candidate = locale?.bind?.('dsh-feedback-hub')
        if (typeof candidate === 'function' && candidate('bell.tooltip') !== 'bell.tooltip') bound = candidate
      } catch {
        bound = undefined
      }

      const local = (key, params) => {
        const lang = detectLocale(ctx).toLowerCase().startsWith('zh') ? 'zh' : 'en'
        const template = DICT[lang][key] ?? DICT.en[key] ?? key
        if (params === undefined) return template
        return template.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])))
      }

      return {
        t: bound ?? local,
        language() {
          return detectLocale(ctx).toLowerCase().startsWith('zh') ? 'zh' : 'en'
        },
      }
    }

    function clockTime(ms) {
      const date = new Date(ms)
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    /** Same shape as the Host helper so both halves read identically. */
    function formatDuration(ms) {
      const total = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0
      if (total < 60) return `${total}s`
      const minutes = Math.floor(total / 60)
      if (minutes < 60) return `${minutes}m${String(total % 60).padStart(2, '0')}s`
      return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
    }

    function relativeTime(t, at) {
      const delta = Date.now() - at
      if (!Number.isFinite(delta) || delta < 60_000) return t('settings.time.justNow')
      const minutes = Math.floor(delta / 60_000)
      if (minutes < 60) return t('settings.time.minutes', { n: minutes })
      return t('settings.time.hours', { n: Math.floor(minutes / 60) })
    }

    function kindLabel(t, kind) {
      return t(`kind.${KIND_META[kind] ? kind : 'unknown'}`)
    }

    /** A short, readable body for one entry, in the active language. */
    function describe(t, entry) {
      const parts = []
      if (entry.kind === 'approval') {
        if (entry.toolName) parts.push(String(entry.toolName))
        if (entry.reason) parts.push(String(entry.reason))
      } else if (entry.kind === 'question') {
        if (entry.header) parts.push(String(entry.header))
        if (entry.question) parts.push(String(entry.question))
      } else if (entry.kind === 'turn-done') {
        if (entry.sessionTitle) parts.push(String(entry.sessionTitle))
        if (typeof entry.durationMs === 'number') parts.push(formatDuration(entry.durationMs))
      } else if (entry.kind === 'error') {
        if (entry.sessionTitle) parts.push(String(entry.sessionTitle))
        if (entry.errorMessage) parts.push(String(entry.errorMessage))
      } else {
        if (entry.label) parts.push(String(entry.label))
        if (entry.errorMessage) parts.push(String(entry.errorMessage))
      }
      const text = parts.filter((part) => part.trim() !== '').join(' · ')
      return text !== '' ? text : kindLabel(t, entry.kind)
    }

    // ------------------------------------------------------------------ store

    /**
     * One observable store for both surfaces. `active` holds the toasts currently
     * on screen; `history` survives until the page reloads and feeds the bell.
     */
    function createStore() {
      const listeners = new Set()
      const active = []
      const timers = new Map()
      const state = {
        history: [],
        cursor: 0,
        connected: false,
        config: undefined,
        mutedUntil: 0,
        osPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
      }

      const emit = () => {
        for (const listener of listeners) {
          try {
            listener()
          } catch {
            // One broken subscriber must not stop the others.
          }
        }
      }

      const clearTimer = (entry) => {
        const timer = timers.get(entry)
        if (timer !== undefined) clearTimeout(timer)
        timers.delete(entry)
      }

      const store = {
        state,
        active,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        emit,
        dismiss(entry) {
          clearTimer(entry)
          const index = active.indexOf(entry)
          if (index >= 0) active.splice(index, 1)
          emit()
        },
        setConnected(value) {
          if (state.connected === value) return
          state.connected = value
          emit()
        },
        setOsPermission(value) {
          if (state.osPermission === value) return
          state.osPermission = value
          emit()
        },
        setConfig(config) {
          state.config = config
          emit()
        },
        setMutedUntil(value) {
          state.mutedUntil = Number.isFinite(value) ? value : 0
          emit()
        },
        muted() {
          return state.mutedUntil > Date.now()
        },
        clearHistory() {
          for (const entry of active) clearTimer(entry)
          timers.clear()
          active.length = 0
          state.history = []
          emit()
        },
        /** Backlog from `/snapshot`: history only, never an interruption. */
        hydrate(items, cursor) {
          for (const item of Array.isArray(items) ? items : []) store.add(item, { backlog: true })
          if (typeof cursor === 'number' && cursor > state.cursor) state.cursor = cursor
          emit()
        },
        /**
         * Merge one notification.
         * @returns the entry when it is news (a toast was queued), otherwise undefined
         */
        add(entry, options = {}) {
          if (entry === null || typeof entry !== 'object' || typeof entry.seq !== 'number') return undefined
          if (entry.seq <= state.cursor) return undefined
          state.cursor = entry.seq
          state.history = [entry, ...state.history].slice(0, 50)
          if (options.backlog === true) {
            emit()
            return undefined
          }
          active.push(entry)
          while (active.length > 3) {
            const dropped = active.shift()
            clearTimer(dropped)
          }
          const duration = state.config?.toastDurationMs ?? 8_000
          timers.set(
            entry,
            setTimeout(() => store.dismiss(entry), duration),
          )
          emit()
          return entry
        },
      }
      return store
    }

    // --------------------------------------------------------------- channels

    function createChime() {
      let audioContext
      let unlocked = false

      const ensure = () => {
        if (audioContext !== undefined) return audioContext
        const Ctor = window.AudioContext ?? window.webkitAudioContext
        if (typeof Ctor !== 'function') return undefined
        try {
          audioContext = new Ctor()
        } catch {
          audioContext = undefined
        }
        return audioContext
      }

      return {
        /** Browsers only allow audio after a gesture; call this from a click. */
        unlock() {
          const ctx = ensure()
          if (ctx === undefined) return
          try {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {})
            unlocked = true
          } catch {
            // Autoplay policy refused: stay silent rather than throwing.
          }
        },
        play(kind) {
          if (!unlocked) return
          const ctx = ensure()
          if (ctx === undefined) return
          try {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {})
            const notes =
              kind === 'approval' ? [880, 1174.7] : kind === 'turn-done' ? [659.3, 880] : kind === 'error' ? [440, 329.6] : [783.99]
            const start = ctx.currentTime
            notes.forEach((frequency, index) => {
              const at = start + index * 0.12
              const oscillator = ctx.createOscillator()
              const gain = ctx.createGain()
              oscillator.type = 'sine'
              oscillator.frequency.setValueAtTime(frequency, at)
              gain.gain.setValueAtTime(0.0001, at)
              gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02)
              gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
              oscillator.connect(gain)
              gain.connect(ctx.destination)
              oscillator.start(at)
              oscillator.stop(at + 0.3)
            })
          } catch {
            // A failed chime is never worth surfacing.
          }
        },
      }
    }

    function createNotifier(store, text, jump) {
      const permission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

      async function requestPermission() {
        if (typeof Notification === 'undefined') {
          store.setOsPermission('unsupported')
          return 'unsupported'
        }
        if (Notification.permission === 'granted') {
          store.setOsPermission('granted')
          return 'granted'
        }
        try {
          const result = await Notification.requestPermission()
          store.setOsPermission(result)
          return result
        } catch {
          store.setOsPermission('denied')
          return 'denied'
        }
      }

      function notify(entry) {
        if (permission() !== 'granted') return
        // Only interrupt the desktop when the page cannot be read right now.
        const hidden = typeof document === 'undefined' || document.hidden || document.visibilityState === 'hidden'
        const focused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true
        if (!hidden && focused) return
        try {
          const notification = new Notification(`${KIND_META[entry.kind]?.icon ?? '🔔'} ${kindLabel(text.t, entry.kind)}`, {
            body: describe(text.t, entry),
            tag: `dsh-feedback-hub-${entry.seq}`,
            // The page owns the chime; the OS toast stays quiet to avoid a double sound.
            silent: true,
          })
          notification.onclick = () => {
            try {
              window.focus()
            } catch {
              // focus is best effort
            }
            jump(entry)
            notification.close()
          }
        } catch {
          // Some environments throw when constructing a notification.
        }
      }

      return { requestPermission, notify, permission }
    }

    function createLink(store, chime, notifier) {
      let source
      let disposed = false
      const clientId = Math.random().toString(36).slice(2, 10)

      async function post(path, body) {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dsh-feedback-hub': '1' },
          body: JSON.stringify(body ?? {}),
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json().catch(() => ({}))
      }

      async function reportPresence() {
        if (disposed) return
        try {
          const result = await post('/dsh-feedback-hub/presence', {
            clientId,
            osNotify: notifier.permission(),
            locale: typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en',
            hidden: typeof document !== 'undefined' ? document.hidden : false,
          })
          store.setConnected(true)
          if (typeof result?.mutedUntil === 'number') store.setMutedUntil(result.mutedUntil)
        } catch {
          store.setConnected(false)
        }
      }

      async function loadSnapshot() {
        try {
          const response = await fetch('/dsh-feedback-hub/snapshot?since=0', { credentials: 'same-origin' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const snapshot = await response.json()
          if (disposed) return
          store.setConnected(true)
          if (snapshot?.config !== undefined) store.setConfig(snapshot.config)
          if (typeof snapshot?.mutedUntil === 'number') store.setMutedUntil(snapshot.mutedUntil)
          store.hydrate(snapshot?.items, snapshot?.cursor)
        } catch {
          store.setConnected(false)
        }
      }

      function handle(entry) {
        const isNews = store.add(entry) !== undefined
        if (!isNews) return
        const muted = store.muted() || entry.silent === true
        if (!muted && store.state.config?.sound !== false) chime.play(entry.kind)
        if (!muted) notifier.notify(entry)
      }

      async function start() {
        await loadSnapshot()
        if (disposed) return
        if (typeof EventSource !== 'undefined') {
          try {
            source = new EventSource(`/dsh-feedback-hub/events?since=${store.state.cursor}`)
            source.addEventListener('open', () => store.setConnected(true))
            source.addEventListener('notification', (event) => {
              try {
                handle(JSON.parse(event.data))
              } catch {
                // Ignore malformed frames.
              }
            })
            source.addEventListener('error', () => store.setConnected(false))
          } catch {
            store.setConnected(false)
          }
        }
        await reportPresence()
      }

      return {
        clientId,
        start,
        post,
        reportPresence,
        dispose() {
          disposed = true
          try {
            source?.close()
          } catch {
            // already closed
          }
          source = undefined
        },
      }
    }

    // ---------------------------------------------------------------- styles

    const CSS = `
.dfh-toasts{position:fixed;top:16px;right:16px;z-index:60;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(380px,calc(100vw - 32px))}
.dfh-toast{pointer-events:auto;display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 8px 28px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45;animation:dfh-in .18s ease-out;cursor:pointer}
.dfh-toast:hover{border-color:var(--dsw-alias-border-l2)}
.dfh-toast__icon{flex:none;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;background:color-mix(in srgb,currentColor 12%,transparent)}
.dfh-toast__body{min-width:0;flex:1}
.dfh-toast__title{font-weight:600;font-size:12.5px;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:6px}
.dfh-toast__text{color:var(--dsw-alias-label-secondary);word-break:break-word;margin-top:2px;font-size:12.5px}
.dfh-toast__close{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;padding:2px 4px;border-radius:6px}
.dfh-toast__close:hover{background:var(--dsw-alias-bg-layer-2)}
@keyframes dfh-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.dfh-bell{position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;line-height:1}
.dfh-bell:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dfh-bell[data-unread="true"]{color:var(--dsw-alias-brand-primary)}
.dfh-bell__dot{position:absolute;top:2px;right:2px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:9px;font-weight:700;line-height:14px;text-align:center}
.dfh-pop{position:fixed;z-index:70;width:320px;max-height:min(60vh,440px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.22);overflow:hidden}
.dfh-pop__head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12.5px;font-weight:600}
.dfh-pop__list{overflow:auto;padding:6px}
.dfh-pop--wide{width:360px}
.dfh-pop__body{overflow:auto;padding:12px 14px}
.dfh-pop__back{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;padding:2px 8px;border-radius:6px}
.dfh-pop__back:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dfh-pop__empty{padding:18px 12px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px}
.dfh-row{display:flex;gap:9px;padding:8px;border-radius:8px;cursor:pointer}
.dfh-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dfh-row__icon{flex:none;width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;background:color-mix(in srgb,currentColor 12%,transparent)}
.dfh-row__body{min-width:0;flex:1}
.dfh-row__title{font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px}
.dfh-row__text{font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-word;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dfh-row__time{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8;margin-top:2px}
.dfh-pop__foot{display:flex;gap:6px;flex-wrap:wrap;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
.dfh-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}
.dfh-btn:hover{border-color:var(--dsw-alias-border-l2)}
.dfh-btn:disabled{opacity:.6;cursor:default}
.dfh-btn--primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.dfh-btn--primary:hover{filter:brightness(1.06)}
.dfh-settings{display:flex;flex-direction:column;gap:18px;padding:2px 2px 24px;color:var(--dsw-alias-label-primary);font-size:13px}
.dfh-settings h3{margin:0 0 6px;font-size:13px;font-weight:600}
.dfh-settings p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.5}
.dfh-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-layer-1)}
.dfh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:10px}
.dfh-chip{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:7px 10px;font-size:12px;background:var(--dsw-alias-bg-base)}
.dfh-chip__label{color:var(--dsw-alias-label-secondary)}
.dfh-chip__value{font-weight:600}
.dfh-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.dfh-history{display:flex;flex-direction:column;gap:2px;margin-top:8px;max-height:260px;overflow:auto}
`

    function Styles() {
      return h('style', { 'data-dfh': '1' }, CSS)
    }

    // ------------------------------------------------------------- components

    function useStore(store) {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        const unsubscribe = store.subscribe(() => setTick((value) => value + 1))
        return () => {
          unsubscribe()
        }
      }, [store])
      return store.state
    }

    function KindIcon({ kind, size }) {
      const meta = KIND_META[kind] ?? KIND_META.test
      return h(
        'span',
        {
          className: 'dfh-toast__icon',
          style: { color: TONE_VAR[meta.tone] ?? TONE_VAR.idle, width: size, height: size },
          'aria-hidden': true,
        },
        meta.icon,
      )
    }

    function ToastStack({ store, text, jump }) {
      const state = useStore(store)
      const toasts = store.active.slice()
      if (toasts.length === 0 && state.history.length === 0) return h(Styles)
      return h(
        'div',
        null,
        h(Styles),
        h(
          'div',
          { className: 'dfh-toasts', role: 'status', 'aria-live': 'polite' },
          toasts.map((entry) =>
            h(
              'div',
              {
                key: `${entry.seq}`,
                className: 'dfh-toast',
                onClick: () => {
                  store.dismiss(entry)
                  jump(entry)
                },
              },
              h(KindIcon, { kind: entry.kind, size: 26 }),
              h(
                'div',
                { className: 'dfh-toast__body' },
                h('div', { className: 'dfh-toast__title' }, kindLabel(text.t, entry.kind)),
                h('div', { className: 'dfh-toast__text' }, describe(text.t, entry)),
              ),
              h(
                'button',
                {
                  className: 'dfh-toast__close',
                  type: 'button',
                  'aria-label': 'close',
                  onClick: (event) => {
                    event.stopPropagation()
                    store.dismiss(entry)
                  },
                },
                '✕',
              ),
            ),
          ),
        ),
      )
    }

    function Bell({ store, text, link, notifier, jump }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)
      const [view, setView] = React.useState('list')
      const [rect, setRect] = React.useState(undefined)
      const buttonRef = React.useRef(null)
      const unread = state.history.length
      const badge = unread > 9 ? '9+' : String(unread)

      const openPanel = () => {
        const node = buttonRef.current
        if (node !== null && node !== undefined && typeof node.getBoundingClientRect === 'function') {
          const box = node.getBoundingClientRect()
          setRect({ left: Math.max(8, box.left - 4), bottom: Math.max(8, window.innerHeight - box.top + 8) })
        }
        setView('list')
        setOpen(true)
        void notifier.requestPermission()
        void link.reportPresence()
      }

      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open])

      const mute = async (minutes) => {
        try {
          const result = await link.post('/dsh-feedback-hub/mute', { minutes })
          store.setMutedUntil(minutes === 0 ? 0 : typeof result.mutedUntil === 'number' ? result.mutedUntil : Date.now() + minutes * 60_000)
        } catch {
          store.setMutedUntil(minutes === 0 ? 0 : Date.now() + minutes * 60_000)
        }
      }

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            ref: buttonRef,
            type: 'button',
            className: 'dfh-bell',
            title: text.t('bell.tooltip'),
            'aria-label': text.t('bell.tooltip'),
            'data-unread': unread > 0 ? 'true' : 'false',
            onClick: () => (open ? setOpen(false) : openPanel()),
          },
          '🔔',
          unread > 0 ? h('span', { className: 'dfh-bell__dot' }, badge) : null,
        ),
        open
          ? h(
              'div',
              {
                className: view === 'settings' ? 'dfh-pop dfh-pop--wide' : 'dfh-pop',
                role: 'dialog',
                'aria-label': view === 'settings' ? text.t('settings.title') : text.t('bell.tooltip'),
                style: rect === undefined ? { right: 8, bottom: 56 } : { left: rect.left, bottom: rect.bottom },
              },
              h(
                'div',
                { className: 'dfh-pop__head' },
                view === 'settings'
                  ? h(
                      React.Fragment,
                      null,
                      h(
                        'button',
                        {
                          className: 'dfh-pop__back',
                          type: 'button',
                          'aria-label': 'back',
                          onClick: () => setView('list'),
                        },
                        '←',
                      ),
                      h('span', { style: { flex: 1 } }, text.t('settings.title')),
                    )
                  : h('span', null, text.t('bell.tooltip')),
                h(
                  'button',
                  {
                    className: 'dfh-btn',
                    type: 'button',
                    'aria-label': 'close',
                    onClick: () => setOpen(false),
                  },
                  '✕',
                ),
              ),
              view === 'settings'
                ? h('div', { className: 'dfh-pop__body' }, h(Settings, { store, text, link, notifier, jump }))
                : h(
                'div',
                { className: 'dfh-pop__list' },
                state.history.length === 0
                  ? h('div', { className: 'dfh-pop__empty' }, text.t('bell.empty'))
                  : state.history.map((entry) =>
                      h(
                        'div',
                        {
                          key: `${entry.seq}`,
                          className: 'dfh-row',
                          onClick: () => {
                            setOpen(false)
                            store.dismiss(entry)
                            jump(entry)
                          },
                        },
                        h(KindIcon, { kind: entry.kind, size: 24 }),
                        h(
                          'div',
                          { className: 'dfh-row__body' },
                          h('div', { className: 'dfh-row__title' }, kindLabel(text.t, entry.kind)),
                          h('div', { className: 'dfh-row__text' }, describe(text.t, entry)),
                          h('div', { className: 'dfh-row__time' }, relativeTime(text.t, entry.at)),
                        ),
                      ),
                    ),
              ),
              view === 'settings'
                ? null
                : h(
                'div',
                { className: 'dfh-pop__foot' },
                store.muted()
                  ? h('button', { className: 'dfh-btn', type: 'button', onClick: () => void mute(0) }, text.t('bell.unmute'))
                  : h('button', { className: 'dfh-btn', type: 'button', onClick: () => void mute(60) }, text.t('bell.mute')),
                h('button', { className: 'dfh-btn', type: 'button', onClick: () => store.clearHistory() }, text.t('bell.markAll')),
                h(
                  'button',
                  {
                    className: 'dfh-btn dfh-btn--primary',
                    type: 'button',
                    onClick: () => setView('settings'),
                  },
                  text.t('bell.settings'),
                ),
              ),
            )
          : null,
      )
    }

    function Chip({ label, value }) {
      return h(
        'div',
        { className: 'dfh-chip' },
        h('span', { className: 'dfh-chip__label' }, label),
        h('span', { className: 'dfh-chip__value' }, value),
      )
    }

    function Settings({ store, text, link, notifier, jump }) {
      const state = useStore(store)
      const [busy, setBusy] = React.useState(false)
      const config = state.config

      const send = async (kind) => {
        setBusy(true)
        try {
          await link.post('/dsh-feedback-hub/test', { kind })
        } catch {
          // The button is a convenience; a failed send is visible as no toast.
        } finally {
          setBusy(false)
        }
      }

      const muteFor = async (minutes) => {
        try {
          const result = await link.post('/dsh-feedback-hub/mute', { minutes })
          store.setMutedUntil(minutes === 0 ? 0 : typeof result.mutedUntil === 'number' ? result.mutedUntil : Date.now() + minutes * 60_000)
        } catch {
          store.setMutedUntil(minutes === 0 ? 0 : Date.now() + minutes * 60_000)
        }
      }

      const permissionLabel = text.t(`settings.value.${state.osPermission}`)
      const fallbackLabel =
        config?.osToast === 'host'
          ? text.t('settings.value.host')
          : config?.osToast === 'client'
            ? text.t('settings.value.client')
            : config?.osToast === 'off'
              ? text.t('settings.value.off')
              : text.t('settings.value.auto')

      return h(
        'div',
        { className: 'dfh-settings' },
        h(Styles),
        h(
          'div',
          null,
          h('h3', null, text.t('settings.channel.title')),
          h('p', null, text.t('settings.desc')),
          h('p', { style: { marginTop: 6, opacity: 0.75, fontSize: 11.5 } }, text.t('settings.hint.path')),
          h(
            'div',
            { className: 'dfh-grid' },
            h(Chip, {
              label: text.t('settings.channel.page'),
              value: state.connected ? text.t('settings.value.connected') : text.t('settings.value.disconnected'),
            }),
            h(Chip, { label: text.t('settings.channel.permission'), value: permissionLabel }),
            h(Chip, {
              label: text.t('settings.channel.sound'),
              value: config?.sound === false ? text.t('settings.value.off') : text.t('settings.value.on'),
            }),
            h(Chip, { label: text.t('settings.channel.fallback'), value: fallbackLabel }),
          ),
          h(
            'div',
            { className: 'dfh-actions' },
            state.osPermission === 'granted'
              ? h('button', { className: 'dfh-btn', type: 'button', disabled: true }, text.t('settings.granted'))
              : h(
                  'button',
                  { className: 'dfh-btn dfh-btn--primary', type: 'button', onClick: () => void notifier.requestPermission() },
                  text.t('settings.grant'),
                ),
            store.muted()
              ? h(
                  'button',
                  { className: 'dfh-btn', type: 'button', onClick: () => void muteFor(0) },
                  text.t('settings.muted', { time: clockTime(state.mutedUntil) }),
                )
              : h('button', { className: 'dfh-btn', type: 'button', onClick: () => void muteFor(60) }, text.t('settings.mute')),
            h(
              'button',
              { className: 'dfh-btn', type: 'button', onClick: () => void link.reportPresence() },
              state.connected ? '↻' : '⟳',
            ),
          ),
        ),
        h(
          'div',
          { className: 'dfh-card' },
          h('h3', null, text.t('settings.events.title')),
          h('p', null, text.t('settings.events.hint')),
          h(
            'div',
            { className: 'dfh-grid' },
            ['approval', 'question', 'turn-done', 'error', 'subagent-end', 'workflow-end'].map((kind) =>
              h(Chip, {
                key: kind,
                label: kindLabel(text.t, kind),
                value: config?.events?.[kind] === true ? text.t('settings.value.on') : text.t('settings.value.off'),
              }),
            ),
          ),
          config !== undefined && config.quietHours ? h('p', { style: { marginTop: 10 } }, `quietHours: ${config.quietHours}`) : null,
        ),
        h(
          'div',
          { className: 'dfh-card' },
          h('h3', null, text.t('settings.test.title')),
          h('p', null, text.t('settings.test.hint')),
          h(
            'div',
            { className: 'dfh-actions' },
            ['test', 'approval', 'question', 'turn-done', 'error'].map((kind) =>
              h(
                'button',
                {
                  key: kind,
                  className: kind === 'test' ? 'dfh-btn dfh-btn--primary' : 'dfh-btn',
                  type: 'button',
                  disabled: busy,
                  onClick: () => void send(kind),
                },
                `${text.t('settings.test.send')} · ${kindLabel(text.t, kind)}`,
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dfh-card' },
          h('h3', null, text.t('settings.title')),
          state.history.length === 0
            ? h('p', null, text.t('settings.empty'))
            : h(
                'div',
                { className: 'dfh-history' },
                state.history.map((entry) =>
                  h(
                    'div',
                    {
                      key: `${entry.seq}`,
                      className: 'dfh-row',
                      onClick: () => jump(entry),
                    },
                    h(KindIcon, { kind: entry.kind, size: 24 }),
                    h(
                      'div',
                      { className: 'dfh-row__body' },
                      h('div', { className: 'dfh-row__title' }, kindLabel(text.t, entry.kind)),
                      h('div', { className: 'dfh-row__text' }, describe(text.t, entry)),
                      h('div', { className: 'dfh-row__time' }, relativeTime(text.t, entry.at)),
                    ),
                  ),
                ),
              ),
          h(
            'div',
            { className: 'dfh-actions' },
            h('button', { className: 'dfh-btn', type: 'button', onClick: () => store.clearHistory() }, text.t('settings.clear')),
          ),
        ),
      )
    }

    // ------------------------------------------------------------------ entry

    return {
      inject: ['slots'],
      apply(ctx) {
        const text = createText(ctx)
        const store = createStore()
        const chime = createChime()
        const disposable = []

        const jump = (entry) => {
          const sessionId = entry?.sessionId
          if (typeof sessionId !== 'string' || sessionId === '') return
          try {
            service(ctx, 'uiWorkspace')?.openSession?.(sessionId)
          } catch {
            // Navigation is best effort; the notification itself already landed.
          }
        }

        const notifier = createNotifier(store, text, jump)
        const link = createLink(store, chime, notifier)

        // Audio needs one gesture before it may play.
        const unlock = () => chime.unlock()
        try {
          document.addEventListener('pointerdown', unlock, { once: true, capture: true })
        } catch {
          // Not a DOM environment.
        }

        const onVisibility = () => void link.reportPresence()
        try {
          document.addEventListener('visibilitychange', onVisibility)
        } catch {
          // Not a DOM environment.
        }

        void link.start()
        const heartbeat = setInterval(() => void link.reportPresence(), 25_000)
        if (typeof Notification === 'undefined') store.setOsPermission('unsupported')

        const register = (slot, id, order, Component, label) =>
          ctx.slots.inject(slot, () =>
            ctx.slots.register({ name: slot, id, order, ...(label === undefined ? {} : { label }) }, Component),
          )

        disposable.push(register('shell.overlay', 'dsh-feedback-hub.toasts', 80, () => h(ToastStack, { store, text, jump })))
        disposable.push(
          register('sidebar.footer.action', 'dsh-feedback-hub.bell', 20, () =>
            h(Bell, { store, text, link, notifier, jump }),
          ),
        )
        disposable.push(
          register(
            'settings.section',
            'dsh-feedback-hub',
            70,
            () => h(Settings, { store, text, link, notifier, jump }),
            () => text.t('settings.title'),
          ),
        )

        return () => {
          clearInterval(heartbeat)
          try {
            document.removeEventListener('visibilitychange', onVisibility)
          } catch {
            // ignore
          }
          link.dispose()
          for (const dispose of disposable) {
            try {
              dispose?.()
            } catch {
              // The registration may already be gone.
            }
          }
        }
      },
    }
  },
})
