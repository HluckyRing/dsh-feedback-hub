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
        'bell.noUnread': '没有未读通知',
        'bell.onlyUnread': '只看未读',
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
        'settings.channel.volume': '提示音音量',
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
        'settings.edit.title': '通知行为',
        'settings.edit.hint': '在这里改会写回配置（profile 的 cordis.patch.yml），保存后插件会重载一次，历史会清空。',
        'settings.edit.save': '保存并重载',
        'settings.edit.reset': '放弃更改',
        'settings.edit.saving': '保存中…',
        'settings.edit.saved': '已保存，插件正在重载…',
        'settings.edit.failed': '保存失败：{reason}',
        'settings.edit.volume': '提示音音量',
        'settings.edit.osToast': '系统通知由谁弹',
        'settings.edit.viewing': '你正看着该会话时',
        'settings.edit.threshold': '完成通知门限',
        'settings.edit.quiet': '静音时段',
        'settings.edit.quietPlaceholder': '例如 23:00-08:00（留空关闭）',
        'settings.edit.reveal': '点击通知唤起窗口',
        'settings.edit.chimeWithOsToast': '系统通知之外再响一次应用内音',
        'settings.threshold.every': '每轮都提醒',
        'settings.threshold.minute': '60 秒以上',
        'settings.threshold.five': '5 分钟以上',
        'settings.value.never': '只标已读，不打扰',
        'settings.value.important': '仍提醒授权/提问',
        'settings.test.title': '测试',
        'settings.test.hint': '点一下应当立刻看到浮窗和提示音；窗口失焦时会弹系统通知。',
        'settings.test.send': '测试',
        'settings.test.preview': '试听提示音',
        'settings.test.delayed': '5 秒后测试（先切走窗口）',
        'settings.test.reveal': '测试唤起窗口',
        'settings.grant': '允许桌面通知',
        'settings.granted': '桌面通知已开启',
        'settings.mute': '静音 1 小时',
        'settings.muted': '已静音至 {time}',
        'settings.unmute': '取消静音',
        'settings.clear': '清空历史',
        'settings.empty': '暂无历史通知',
        'settings.time.justNow': '刚刚',
        'settings.diag.title': '诊断',
        'settings.diag.hint': '插件最近看到的事件。某次通知没出现时，这里能看出它是否被收到、是否被过滤。',
        'settings.diag.refresh': '刷新',
        'settings.diag.empty': '暂无记录',
        'settings.diag.delivered': '已发送',
        'settings.diag.dropped': '被过滤',
        'settings.time.minutes': '{n} 分钟前',
        'settings.time.hours': '{n} 小时前',
      },
      en: {
        'bell.tooltip': 'Notifications',
        'bell.empty': 'Nothing yet',
        'bell.noUnread': 'No unread notifications',
        'bell.onlyUnread': 'Unread only',
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
        'settings.channel.volume': 'Chime volume',
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
        'settings.edit.title': 'Behaviour',
        'settings.edit.hint': 'Saving writes back to the config (the profile cordis.patch.yml). The plugin restarts once and its history is cleared.',
        'settings.edit.save': 'Save and reload',
        'settings.edit.reset': 'Discard changes',
        'settings.edit.saving': 'Saving…',
        'settings.edit.saved': 'Saved. The plugin is restarting…',
        'settings.edit.failed': 'Save failed: {reason}',
        'settings.edit.volume': 'Chime volume',
        'settings.edit.osToast': 'Who raises the OS toast',
        'settings.edit.viewing': 'While you are viewing that session',
        'settings.edit.threshold': 'Finished-turn threshold',
        'settings.edit.quiet': 'Quiet hours',
        'settings.edit.quietPlaceholder': 'e.g. 23:00-08:00 (empty disables)',
        'settings.edit.reveal': 'Reveal the window on click',
        'settings.edit.chimeWithOsToast': 'Also play the chime beside the OS toast',
        'settings.threshold.every': 'Every turn',
        'settings.threshold.minute': 'After 60 s',
        'settings.threshold.five': 'After 5 min',
        'settings.value.never': 'Mark read only',
        'settings.value.important': 'Still alert for approval/question',
        'settings.test.title': 'Test',
        'settings.test.hint': 'You should see a toast and hear a chime immediately; an OS notification appears while the window is unfocused.',
        'settings.test.send': 'Test',
        'settings.test.preview': 'Play chime',
        'settings.test.delayed': 'Test in 5s (switch away first)',
        'settings.test.reveal': 'Test reveal window',
        'settings.grant': 'Enable desktop notifications',
        'settings.granted': 'Desktop notifications enabled',
        'settings.mute': 'Mute for 1 hour',
        'settings.muted': 'Muted until {time}',
        'settings.unmute': 'Unmute',
        'settings.clear': 'Clear history',
        'settings.empty': 'No history yet',
        'settings.time.justNow': 'just now',
        'settings.diag.title': 'Diagnostics',
        'settings.diag.hint': 'Events the plugin recently saw. When a notification is missing, this shows whether it arrived and whether it was filtered.',
        'settings.diag.refresh': 'Refresh',
        'settings.diag.empty': 'Nothing recorded',
        'settings.diag.delivered': 'delivered',
        'settings.diag.dropped': 'filtered',
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
        /** Session currently open in the Conversation, reported by `SessionObserver`. */
        activeSessionId: undefined,
        /** Recent raw events the Host saw, for the settings page diagnosis list. */
        sightings: [],
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
        setSightings(sightings) {
          state.sightings = Array.isArray(sightings) ? sightings : []
          emit()
        },
        setMutedUntil(value) {
          state.mutedUntil = Number.isFinite(value) ? value : 0
          emit()
        },
        muted() {
          return state.mutedUntil > Date.now()
        },
        /** Unread entries currently held (the bell badge). */
        unread() {
          let count = 0
          for (const entry of state.history) if (entry.read !== true) count += 1
          return count
        },
        /** Apply a read mark that already happened on the Host. */
        applyRead(seqs) {
          if (!Array.isArray(seqs) || seqs.length === 0) return 0
          const wanted = new Set(seqs)
          let changed = 0
          for (const entry of state.history) {
            if (entry.read === true || !wanted.has(entry.seq)) continue
            entry.read = true
            changed += 1
          }
          if (changed > 0) emit()
          return changed
        },
        applyReadForSession(sessionId) {
          if (typeof sessionId !== 'string' || sessionId === '') return 0
          let changed = 0
          for (const entry of state.history) {
            if (entry.read === true || entry.sessionId !== sessionId) continue
            entry.read = true
            changed += 1
          }
          if (changed > 0) emit()
          return changed
        },
        applyReadAll() {
          let changed = 0
          for (const entry of state.history) {
            if (entry.read === true) continue
            entry.read = true
            changed += 1
          }
          if (changed > 0) emit()
          return changed
        },
        /** The Conversation moved to another session (or none). */
        setActiveSession(sessionId) {
          if (state.activeSessionId === sessionId) return false
          state.activeSessionId = sessionId
          emit()
          return true
        },
        /**
         * True when the user is looking at that session right now: same session,
         * page visible and focused. Used to mark arriving notifications read
         * instead of interrupting.
         */
        isViewing(sessionId) {
          if (typeof sessionId !== 'string' || sessionId === '') return false
          if (state.activeSessionId !== sessionId) return false
          if (typeof document === 'undefined') return false
          if (document.hidden === true || document.visibilityState === 'hidden') return false
          if (typeof document.hasFocus === 'function' && document.hasFocus() === false) return false
          return true
        },
        clearHistory() {
          for (const entry of active) clearTimer(entry)
          timers.clear()
          active.length = 0
          state.history = []
          emit()
        },
        /**
         * Adopt a Host sequence that restarted behind our back (the Host seeds
         * its cursor with the clock, but a downgrade or a fresh profile could
         * still hand us a lower value; dropping our cursor is better than
         * treating every new entry as a duplicate).
         */
        resetTo(cursor) {
          for (const entry of active) clearTimer(entry)
          timers.clear()
          active.length = 0
          state.history = []
          state.cursor = typeof cursor === 'number' && Number.isFinite(cursor) && cursor > 0 ? cursor : 0
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
        /**
         * A short two-tone chime. Loud enough to be noticed across a room when
         * `volume` is high, and harmonically rich so it cuts through music.
         * @param {string} kind event kind, selects the interval
         * @param {number} [volume] 0–1 peak gain
         */
        play(kind, volume = 0.6) {
          if (!unlocked) return
          const ctx = ensure()
          if (ctx === undefined) return
          try {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {})
            const peak = Math.min(1, Math.max(0.05, Number.isFinite(volume) ? volume : 0.6))
            const notes =
              kind === 'approval' ? [880, 1174.7] : kind === 'turn-done' ? [659.3, 880] : kind === 'error' ? [440, 329.6] : [783.99, 1046.5]
            const master = ctx.createGain()
            master.gain.value = 1
            master.connect(ctx.destination)
            const start = ctx.currentTime
            notes.forEach((frequency, index) => {
              const at = start + index * 0.16
              // Fundamental plus a quiet octave: an additive bell rather than a beep.
              for (const [partial, weight] of [
                [1, 1],
                [2, 0.35],
                [3, 0.12],
              ]) {
                const oscillator = ctx.createOscillator()
                const gain = ctx.createGain()
                oscillator.type = partial === 1 ? 'sine' : 'triangle'
                oscillator.frequency.setValueAtTime(frequency * partial, at)
                gain.gain.setValueAtTime(0.0001, at)
                gain.gain.exponentialRampToValueAtTime(peak * weight * 0.5, at + 0.015)
                gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
                oscillator.connect(gain)
                gain.connect(master)
                oscillator.start(at)
                oscillator.stop(at + 0.5)
              }
            })
            // Release the master so the graph can be collected.
            setTimeout(() => {
              try {
                master.disconnect()
              } catch {
                // already gone
              }
            }, 1_500)
          } catch {
            // A failed chime is never worth surfacing.
          }
        },
      }
    }

    function createNotifier(store, text, jump, reveal) {
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

      /**
       * Raise an OS notification when the page cannot be read right now.
       * @returns true when a notification was actually created
       */
      function notify(entry) {
        if (permission() !== 'granted') return false
        // Only interrupt the desktop when the page cannot be read right now.
        const hidden = typeof document === 'undefined' || document.hidden || document.visibilityState === 'hidden'
        const focused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true
        if (!hidden && focused) return false
        const important = entry.kind === 'approval' || entry.kind === 'question'
        const sound = store.state.config?.sound !== false
        try {
          const notification = new Notification(`${KIND_META[entry.kind]?.icon ?? '🔔'} ${kindLabel(text.t, entry.kind)}`, {
            body: describe(text.t, entry),
            tag: `dsh-feedback-hub-${entry.seq}`,
            // While the page is hidden this is the only reliably audible cue:
            // let Windows play its own sound instead of our suspended WebAudio.
            silent: !sound,
            // Authorization and questions stay on screen until dismissed; the
            // user may be in another application entirely.
            timeoutType: important ? 'never' : 'default',
            urgency: important ? 'critical' : 'normal',
          })
          notification.onclick = () => {
            // `reveal` asks the Host to pull the window out of the tray, which a
            // renderer cannot do on its own; it also navigates to the session.
            if (typeof reveal === 'function') reveal(entry)
            else jump(entry)
            notification.close()
          }
          return true
        } catch {
          // Some environments throw when constructing a notification.
          return false
        }
      }

      return { requestPermission, notify, permission }
    }

    function createLink(store, chime, notifier, presenter) {
      let source
      let disposed = false
      let reconnectTimer = 0
      let attempt = 0
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
          if (typeof result?.mutedUntil === 'number') store.setMutedUntil(result.mutedUntil)
        } catch {
          // The busy flag is the SSE stream's job; a failed heartbeat just means
          // the Host is restarting.
        }
      }

      async function loadSnapshot() {
        try {
          const response = await fetch('/dsh-feedback-hub/snapshot?since=0', { credentials: 'same-origin' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const snapshot = await response.json()
          if (disposed) return
          if (snapshot?.config !== undefined) store.setConfig(snapshot.config)
          if (typeof snapshot?.mutedUntil === 'number') store.setMutedUntil(snapshot.mutedUntil)
          store.setSightings(snapshot?.sightings)
          if (typeof snapshot?.cursor === 'number' && snapshot.cursor < store.state.cursor) {
            store.resetTo(snapshot.cursor)
          }
          store.hydrate(snapshot?.items, snapshot?.cursor)
        } catch {
          // Snapshot failures are retried by the next reconnect.
        }
      }

      function handle(entry) {
        // Backlog and duplicates only reach the history, never the screen.
        if (store.add(entry) === undefined) return
        if (presenter !== undefined && typeof presenter.fn === 'function') presenter.fn(entry)
      }

      /**
       * Open (or reopen) the event stream. A browser closes an EventSource for
       * good when the response is not 200 — which is exactly what happens while
       * the plugin is being reloaded — so reopening is our job.
       */
      function openEvents() {
        if (disposed || typeof EventSource === 'undefined') return
        try {
          source?.close()
        } catch {
          // already closed
        }
        try {
          source = new EventSource(`/dsh-feedback-hub/events?since=${store.state.cursor}`)
          source.addEventListener('open', () => {
            attempt = 0
            store.setConnected(true)
          })
          source.addEventListener('notification', (event) => {
            try {
              handle(JSON.parse(event.data))
            } catch {
              // Ignore malformed frames.
            }
          })
          source.addEventListener('read', (event) => {
            try {
              store.applyRead(JSON.parse(event.data)?.seqs)
            } catch {
              // Ignore malformed frames.
            }
          })
          source.addEventListener('clear', () => store.clearHistory())
          source.addEventListener('error', () => {
            store.setConnected(false)
            if (source?.readyState === 2) scheduleReconnect()
          })
        } catch {
          store.setConnected(false)
          scheduleReconnect()
        }
      }

      function scheduleReconnect() {
        if (disposed || reconnectTimer !== 0) return
        const delay = Math.min(30_000, 1_000 * 2 ** attempt)
        attempt = Math.min(attempt + 1, 5)
        reconnectTimer = setTimeout(() => {
          reconnectTimer = 0
          void start()
        }, delay)
      }

      /** Watchdog entry: reopen a stream that ended or never opened. */
      function ensureConnected() {
        if (disposed || typeof EventSource === 'undefined') return
        if (source === undefined || source.readyState === 2) {
          attempt = 0
          openEvents()
        }
      }

      async function start() {
        await loadSnapshot()
        if (disposed) return
        openEvents()
        await reportPresence()
      }

      return {
        clientId,
        start,
        post,
        refresh: () => loadSnapshot(),
        reportPresence,
        ensureConnected,
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
.dfh-row--unread{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}
.dfh-row--unread .dfh-row__title{font-weight:700}
.dfh-row--read{opacity:.6}
.dfh-row__dot{flex:none;width:6px;height:6px;border-radius:3px;background:var(--dsw-alias-brand-primary);margin-top:10px}
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
.dfh-field{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 2px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12.5px}
.dfh-field:last-child{border-bottom:0}
.dfh-field__label{color:var(--dsw-alias-label-secondary)}
.dfh-switch{position:relative;flex:none;width:34px;height:18px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background .12s ease}
.dfh-switch[data-on="true"]{background:var(--dsw-alias-brand-primary);border-color:transparent}
.dfh-switch::after{content:'';position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .12s ease}
.dfh-switch[data-on="true"]::after{transform:translateX(16px)}
.dfh-select,.dfh-input{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 8px;font-size:12px;min-width:118px}
.dfh-range{width:130px}
.dfh-status{font-size:11.5px;margin-top:8px;color:var(--dsw-alias-label-secondary)}
.dfh-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dfh-status[data-tone="saved"]{color:var(--dsw-alias-state-success-primary)}
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

    function ToastStack({ store, text, jump, markRead }) {
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
                  markRead([entry.seq])
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

    /**
     * Invisible reporter registered in a session-scoped slot. It is how the
     * client learns which Conversation is open, without reading shell DOM.
     */
    function SessionObserver({ sessionId, onActiveSession }) {
      React.useEffect(() => {
        onActiveSession(sessionId)
        return () => onActiveSession(undefined)
      }, [sessionId, onActiveSession])
      return null
    }

    function Bell({ store, text, link, notifier, jump, chime, markRead, markAllRead, clearAll }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)
      const [view, setView] = React.useState('list')
      const [onlyUnread, setOnlyUnread] = React.useState(false)
      const [rect, setRect] = React.useState(undefined)
      const buttonRef = React.useRef(null)
      const unread = store.unread()
      const badge = unread > 9 ? '9+' : String(unread)
      const rows = onlyUnread ? state.history.filter((entry) => entry.read !== true) : state.history

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
                  : h(
                      React.Fragment,
                      null,
                      h('span', { style: { flex: 1 } }, unread > 0 ? `${text.t('bell.tooltip')} · ${unread}` : text.t('bell.tooltip')),
                      h(
                        'button',
                        {
                          className: onlyUnread ? 'dfh-btn dfh-btn--primary' : 'dfh-btn',
                          type: 'button',
                          onClick: () => setOnlyUnread((value) => !value),
                        },
                        text.t('bell.onlyUnread'),
                      ),
                    ),
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
                ? h('div', { className: 'dfh-pop__body' }, h(Settings, { store, text, link, notifier, jump, chime, markRead, clearAll }))
                : h(
                'div',
                { className: 'dfh-pop__list' },
                rows.length === 0
                  ? h('div', { className: 'dfh-pop__empty' }, onlyUnread ? text.t('bell.noUnread') : text.t('bell.empty'))
                  : rows.map((entry) =>
                      h(
                        'div',
                        {
                          key: `${entry.seq}`,
                          className: entry.read === true ? 'dfh-row dfh-row--read' : 'dfh-row dfh-row--unread',
                          onClick: () => {
                            markRead([entry.seq])
                            setOpen(false)
                            store.dismiss(entry)
                            jump(entry)
                          },
                        },
                        entry.read === true ? null : h('span', { className: 'dfh-row__dot', 'aria-hidden': true }),
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
                h(
                  'button',
                  { className: 'dfh-btn', type: 'button', disabled: unread === 0, onClick: () => markAllRead() },
                  text.t('bell.markAll'),
                ),
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

    function Toggle({ label, on, onChange }) {
      return h(
        'div',
        { className: 'dfh-field' },
        h('span', { className: 'dfh-field__label' }, label),
        h('button', {
          type: 'button',
          className: 'dfh-switch',
          role: 'switch',
          'aria-checked': on === true,
          'aria-label': label,
          'data-on': on === true ? 'true' : 'false',
          onClick: () => onChange(on !== true),
        }),
      )
    }

    function SelectField({ label, value, options, onChange }) {
      return h(
        'div',
        { className: 'dfh-field' },
        h('span', { className: 'dfh-field__label' }, label),
        h(
          'select',
          { className: 'dfh-select', value, onChange: (event) => onChange(event.target.value) },
          options.map((option) => h('option', { key: String(option.value), value: String(option.value) }, option.label)),
        ),
      )
    }

    function RangeField({ label, value, min, max, step, onChange, format }) {
      return h(
        'div',
        { className: 'dfh-field' },
        h('span', { className: 'dfh-field__label' }, `${label} · ${format(value)}`),
        h('input', {
          className: 'dfh-range',
          type: 'range',
          min,
          max,
          step,
          value,
          onChange: (event) => onChange(Number(event.target.value)),
        }),
      )
    }

    function TextField({ label, value, placeholder, onChange }) {
      return h(
        'div',
        { className: 'dfh-field' },
        h('span', { className: 'dfh-field__label' }, label),
        h('input', {
          className: 'dfh-input',
          type: 'text',
          value,
          placeholder,
          onChange: (event) => onChange(event.target.value),
        }),
      )
    }

    /**
     * Editable copy of the plugin config. Saves through `POST /config`, which
     * makes the Host persist the patch with its config editor; the row restarts,
     * so the panel then waits for the stream to come back and re-reads it.
     */
    function ConfigPanel({ store, text, link }) {
      const state = useStore(store)
      const config = state.config
      const [draft, setDraft] = React.useState(undefined)
      const [status, setStatus] = React.useState('idle')
      const [reason, setReason] = React.useState('')

      React.useEffect(() => {
        if (config === undefined) return
        setDraft({ ...config, events: { ...config.events } })
        setStatus('idle')
      }, [config])

      if (config === undefined || draft === undefined) return null

      const dirty = JSON.stringify(draft) !== JSON.stringify(config)
      const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
      const setEvent = (kind, value) =>
        setDraft((current) => ({ ...current, events: { ...current.events, [kind]: value } }))

      const threshold = typeof draft.turnDoneMinDurationMs === 'number' ? draft.turnDoneMinDurationMs : 0
      const known = [0, 60_000, 300_000]
      const thresholdValues = known.includes(threshold) ? known : [...known, threshold].sort((a, b) => a - b)
      const thresholdLabel = (value) => {
        if (value === 0) return text.t('settings.threshold.every')
        if (value === 60_000) return text.t('settings.threshold.minute')
        if (value === 300_000) return text.t('settings.threshold.five')
        return `${Math.round(value / 1000)}s`
      }

      const save = async () => {
        setStatus('saving')
        setReason('')
        const patch = { ...draft }
        let result
        try {
          result = await link.post('/dsh-feedback-hub/config', { patch })
        } catch {
          // The row restarts as the change lands, so the response may never
          // arrive; the resync below decides whether it actually worked.
          result = undefined
        }
        for (let attempt = 0; attempt < 12; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 600))
          link.ensureConnected()
          await link.refresh()
          if (store.state.connected && store.state.config !== undefined) break
        }
        if (result !== undefined && result.ok === false) {
          setStatus('error')
          setReason(String(result.reason ?? 'unknown'))
          return
        }
        setStatus('saved')
      }

      return h(
        'div',
        { className: 'dfh-card' },
        h('h3', null, text.t('settings.edit.title')),
        h('p', null, text.t('settings.edit.hint')),
        h(
          'div',
          { style: { marginTop: 8 } },
          ['approval', 'question', 'turn-done', 'error', 'subagent-end', 'workflow-end'].map((kind) =>
            h(Toggle, {
              key: kind,
              label: kindLabel(text.t, kind),
              on: draft.events?.[kind] === true,
              onChange: (value) => setEvent(kind, value),
            }),
          ),
          h(Toggle, {
            label: text.t('settings.channel.sound'),
            on: draft.sound !== false,
            onChange: (value) => setField('sound', value),
          }),
          h(RangeField, {
            label: text.t('settings.edit.volume'),
            value: typeof draft.volume === 'number' ? draft.volume : 0.6,
            min: 0.05,
            max: 1,
            step: 0.05,
            onChange: (value) => setField('volume', value),
            format: (value) => `${Math.round(value * 100)}%`,
          }),
          h(SelectField, {
            label: text.t('settings.edit.osToast'),
            value: draft.osToast,
            options: [
              { value: 'auto', label: text.t('settings.value.auto') },
              { value: 'client', label: text.t('settings.value.client') },
              { value: 'host', label: text.t('settings.value.host') },
              { value: 'off', label: text.t('settings.value.off') },
            ],
            onChange: (value) => setField('osToast', value),
          }),
          h(Toggle, {
            label: text.t('settings.edit.chimeWithOsToast'),
            on: draft.chimeWithOsToast === true,
            onChange: (value) => setField('chimeWithOsToast', value),
          }),
          h(SelectField, {
            label: text.t('settings.edit.viewing'),
            value: draft.notifyWhileViewing ?? 'important',
            options: [
              { value: 'important', label: text.t('settings.value.important') },
              { value: 'never', label: text.t('settings.value.never') },
            ],
            onChange: (value) => setField('notifyWhileViewing', value),
          }),
          h(SelectField, {
            label: text.t('settings.edit.threshold'),
            value: String(threshold),
            options: thresholdValues.map((value) => ({ value, label: thresholdLabel(value) })),
            onChange: (value) => setField('turnDoneMinDurationMs', Number(value)),
          }),
          h(TextField, {
            label: text.t('settings.edit.quiet'),
            value: draft.quietHours ?? '',
            placeholder: text.t('settings.edit.quietPlaceholder'),
            onChange: (value) => setField('quietHours', value),
          }),
          h(Toggle, {
            label: text.t('settings.edit.reveal'),
            on: draft.revealOnClick !== false,
            onChange: (value) => setField('revealOnClick', value),
          }),
        ),
        h(
          'div',
          { className: 'dfh-actions' },
          h(
            'button',
            {
              className: 'dfh-btn dfh-btn--primary',
              type: 'button',
              disabled: dirty !== true || status === 'saving',
              onClick: () => void save(),
            },
            status === 'saving' ? text.t('settings.edit.saving') : text.t('settings.edit.save'),
          ),
          h(
            'button',
            {
              className: 'dfh-btn',
              type: 'button',
              disabled: dirty !== true || status === 'saving',
              onClick: () => {
                setDraft({ ...config, events: { ...config.events } })
                setStatus('idle')
              },
            },
            text.t('settings.edit.reset'),
          ),
        ),
        status === 'saved' ? h('div', { className: 'dfh-status', 'data-tone': 'saved' }, text.t('settings.edit.saved')) : null,
        status === 'error'
          ? h('div', { className: 'dfh-status', 'data-tone': 'error' }, text.t('settings.edit.failed', { reason }))
          : null,
      )
    }

    function Settings({ store, text, link, notifier, jump, chime, markRead, clearAll }) {
      const state = useStore(store)
      const [busy, setBusy] = React.useState(false)
      const config = state.config

      const send = async (kind, delayMs = 0) => {
        if (delayMs > 0) {
          // Gives the user time to switch to another application, so the
          // notification is raised while the page is hidden — the real case.
          setTimeout(() => {
            void link.post('/dsh-feedback-hub/test', { kind }).catch(() => {})
          }, delayMs)
          return
        }
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
            h(Chip, {
              label: text.t('settings.channel.volume'),
              value: `${Math.round((typeof config?.volume === 'number' ? config.volume : 0.6) * 100)}%`,
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
        h(ConfigPanel, { store, text, link }),
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
            h(
              'button',
              {
                className: 'dfh-btn',
                type: 'button',
                onClick: () => {
                  chime?.unlock?.()
                  chime?.play?.('test', typeof config?.volume === 'number' ? config.volume : 0.6)
                },
              },
              text.t('settings.test.preview'),
            ),
            h(
              'button',
              {
                className: 'dfh-btn',
                type: 'button',
                onClick: () => void send('question', 5_000),
              },
              text.t('settings.test.delayed'),
            ),
            h(
              'button',
              {
                className: 'dfh-btn',
                type: 'button',
                onClick: () => void link.post('/dsh-feedback-hub/reveal', {}).catch(() => {}),
              },
              text.t('settings.test.reveal'),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dfh-card' },
          h('h3', null, text.t('settings.diag.title')),
          h('p', null, text.t('settings.diag.hint')),
          state.sightings.length === 0
            ? h('p', { style: { marginTop: 8 } }, text.t('settings.diag.empty'))
            : h(
                'div',
                { className: 'dfh-history', style: { maxHeight: 180 } },
                state.sightings
                  .slice()
                  .reverse()
                  .map((item, index) =>
                    h(
                      'div',
                      { key: `${item.at}-${index}`, className: 'dfh-row', style: { cursor: 'default' } },
                      h(
                        'div',
                        { className: 'dfh-row__body' },
                        h(
                          'div',
                          { className: 'dfh-row__title' },
                          `${kindLabel(text.t, item.kind)} · ${item.delivered ? text.t('settings.diag.delivered') : text.t('settings.diag.dropped')}${item.reason ? ` (${item.reason})` : ''}`,
                        ),
                        h(
                          'div',
                          { className: 'dfh-row__time' },
                          `${new Date(item.at).toLocaleTimeString()}${item.toolName ? ` · ${item.toolName}` : ''}`,
                        ),
                      ),
                    ),
                  ),
              ),
          h(
            'div',
            { className: 'dfh-actions' },
            h('button', { className: 'dfh-btn', type: 'button', onClick: () => void link.refresh() }, text.t('settings.diag.refresh')),
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
                      onClick: () => {
                        if (typeof markRead === 'function') markRead([entry.seq])
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
          h(
            'div',
            { className: 'dfh-actions' },
            h(
              'button',
              {
                className: 'dfh-btn',
                type: 'button',
                onClick: () => (typeof clearAll === 'function' ? clearAll() : store.clearHistory()),
              },
              text.t('settings.clear'),
            ),
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

        // `reveal` needs `link`, `link` needs `notifier`, `notifier` needs
        // `reveal`: bind it late through one holder instead of reordering.
        const revealHolder = { reveal: (entry) => jump(entry) }
        // Same trick for the incoming-notification presenter, which needs
        // `markRead` (and therefore `link`).
        const presenter = { fn: undefined }
        const notifier = createNotifier(store, text, jump, (entry) => revealHolder.reveal(entry))
        const link = createLink(store, chime, notifier, presenter)
        revealHolder.reveal = (entry) => {
          jump(entry)
          if (entry?.seq !== undefined) markRead([entry.seq])
          try {
            window.focus()
          } catch {
            // Best effort; the Host is what actually restores a hidden window.
          }
          void link.post('/dsh-feedback-hub/reveal', { sessionId: entry?.sessionId }).catch(() => {})
        }

        // The Host owns read state so it survives reloads and is shared by tabs;
        // these helpers update the local mirror first, then tell the Host.
        const markRead = (seqs) => {
          if (!Array.isArray(seqs) || seqs.length === 0) return
          store.applyRead(seqs)
          void link.post('/dsh-feedback-hub/read', { seqs }).catch(() => {})
        }
        const markAllRead = () => {
          store.applyReadAll()
          void link.post('/dsh-feedback-hub/read', { all: true }).catch(() => {})
        }
        const clearAll = () => {
          store.clearHistory()
          void link.post('/dsh-feedback-hub/clear', {}).catch(() => {})
        }
        /** A session became the open one: everything about it is now read. */
        const onActiveSession = (sessionId) => {
          const changed = store.setActiveSession(sessionId)
          if (!changed || typeof sessionId !== 'string' || sessionId === '') return
          if (store.applyReadForSession(sessionId) === 0) return
          void link.post('/dsh-feedback-hub/read', { sessionId }).catch(() => {})
        }

        presenter.fn = (entry) => {
          const config = store.state.config
          if (store.isViewing(entry.sessionId)) {
            // Authorization and questions still deserve a visible nudge — the
            // user asked for "waiting for approval" to never pass silently.
            const critical = entry.kind === 'approval' || entry.kind === 'question'
            if (!(critical && config?.notifyWhileViewing !== 'never')) {
              markRead([entry.seq])
              return
            }
            if (config?.sound !== false) chime.play(entry.kind, config?.volume ?? 0.6)
            return
          }
          if (store.muted() || entry.silent === true) return
          const sound = config?.sound !== false
          const shown = notifier.notify(entry)
          // The system notification already rang; only add the chime when nothing
          // else made a noise (or when the user explicitly asked for both).
          if (sound && (shown === false || config?.chimeWithOsToast === true)) {
            chime.play(entry.kind, config?.volume ?? 0.6)
          }
        }

        // Audio needs one gesture before it may play.
        const unlock = () => chime.unlock()
        try {
          document.addEventListener('pointerdown', unlock, { once: true, capture: true })
        } catch {
          // Not a DOM environment.
        }

        const onVisibility = () => {
          // Coming back to the tab is a good moment to repair a dead stream.
          link.ensureConnected()
          void link.reportPresence()
        }
        try {
          document.addEventListener('visibilitychange', onVisibility)
        } catch {
          // Not a DOM environment.
        }

        void link.start()
        const heartbeat = setInterval(() => {
          link.ensureConnected()
          void link.reportPresence()
        }, 10_000)
        if (typeof Notification === 'undefined') store.setOsPermission('unsupported')

        const register = (slot, id, order, Component, label) =>
          ctx.slots.inject(slot, () =>
            ctx.slots.register({ name: slot, id, order, ...(label === undefined ? {} : { label }) }, Component),
          )

        disposable.push(register('shell.overlay', 'dsh-feedback-hub.toasts', 80, () => h(ToastStack, { store, text, jump, markRead })))
        disposable.push(
          register('sidebar.footer.action', 'dsh-feedback-hub.bell', 20, () =>
            h(Bell, { store, text, link, notifier, jump, chime, markRead, markAllRead, clearAll }),
          ),
        )
        disposable.push(
          register(
            'settings.section',
            'dsh-feedback-hub',
            70,
            () => h(Settings, { store, text, link, notifier, jump, chime, markRead, clearAll }),
            () => text.t('settings.title'),
          ),
        )
        // An invisible reporter in a session-scoped slot: it is how the client
        // learns which Conversation is on screen, without touching shell DOM.
        disposable.push(
          register('conversation.composer.dock', 'dsh-feedback-hub.session', 900, (props) =>
            h(SessionObserver, { sessionId: props?.sessionId, onActiveSession }),
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
