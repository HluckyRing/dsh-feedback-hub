# 架构说明

本插件是**一个 bundle、两个半边**：Host 半跑在 DSH 进程里负责采集与分发，Client 半跑在浏览器页面里负责呈现。两者通过一个只读 SSE 通道 + 三个小 POST 路由通讯。

```
                      ┌──────────────────────── DSH Host 进程 ────────────────────────┐
 approval/request ───▶│                                                              │
 user-questions/req ─▶│  FeedbackHub                                                 │
 agent/status ───────▶│   ├─ shouldDeliver()  过滤：开关 / 静音时段 / 去重 / 时长门限 │
 agent/error ────────▶│   ├─ RingBuffer(100)  内存环形缓冲（不落盘）                  │
 subagent/end ───────▶│   ├─ broadcast() ──▶ SSE  /dsh-feedback-hub/events            │
 workflow/end ───────▶│   └─ maybeToast() ──▶ PowerShell WinRT toast（兜底）          │
                      └──────────────────────────────────────────────────────────────┘
                                             ▲   │
                      GET  /events  (SSE) ◀──┘   │  POST /presence /test /mute
                      GET  /snapshot                 (带 x-dsh-feedback-hub: 1 头)
                                             │   ▼
                      ┌──────────────────────── Web 页面 ─────────────────────────────┐
                      │  client.js                                                   │
                      │   ├─ store（history + active toasts + cursor）                │
                      │   ├─ shell.overlay            → 右上角浮窗                    │
                      │   ├─ sidebar.footer.action    → 铃铛 + 未读数 + 面板           │
                      │   ├─ settings.section         → 「通知中心」设置页            │
                      │   ├─ Notification API         → 窗口失焦/隐藏时的系统通知      │
                      │   └─ WebAudio                 → 合成提示音                    │
                      └──────────────────────────────────────────────────────────────┘
```

## 为什么是 SSE，而不是别的通道

- Client 半是**普通 bundle 的浏览器半**（`window.__ModuleLoader__.load` + `require('react')`），没有动态插件沙箱里的 `host.call`，所以通讯只能走 HTTP。
- `ctx.webServer.register({ kind: 'exact', path })` 是公开扩展点，本仓库的同类插件（如 git-graph）已在用同款 SSE 路由，行为稳定。
- SSE 相比轮询：真正的事件推送、断线自动重连、连接数极小（每个页面一条）。断线期间的事件由环形缓冲补齐 —— 页面带着 `?since=<cursor>` 重连，Host 立刻回放遗漏条目。

## 数据流

1. **采集**：Host 订阅 6 个事件。两个 waterfall 事件（`approval/request`、`user-questions/request`）的监听器只做旁听，永远 `return next()`；`agent/status` 用 `running → idle` 的时间差作为“本轮用时”。
2. **规范化**：事件被压成同一种形状

   ```js
   { seq, kind, at, sessionId?, sessionTitle?, toolName?, reason?, question?, header?,
     intentKind?, durationMs?, errorMessage?, label?, quiet?, muted?, silent? }
   ```

   会话标题来自 `sessionTitle` 服务（可选依赖，取不到就退回无标题）。
3. **过滤**（`core.js` 的 `shouldDeliver`）：事件开关 → 完成时长门限 → 去重窗口 → 静音时段（静音不丢弃，只标记 `quiet`）。
4. **分发**：
   - 写入环形缓冲并广播给所有 SSE 订阅者；
   - 决定是否由 Host 兜底弹系统通知（`osToast` 模式 + 页面在线情况）。
5. **呈现**（Client）：合并进 store → 浮窗 + 提示音；若页面不可见且已授权，再发一条系统通知；静音或 `entry.silent` 时跳过声音与系统通知。

## HTTP 路由

| 方法 | 路径 | 作用 | 鉴权 |
|---|---|---|---|
| GET | `/dsh-feedback-hub/events?since=N` | SSE 流：先回放 `since` 之后的条目，再推新条目，15s 心跳 | 只读 |
| GET | `/dsh-feedback-hub/snapshot?since=N` | 首屏快照：历史条目 + 游标 + 生效配置 + 静音状态 | 只读 |
| POST | `/dsh-feedback-hub/presence` | 页面上报：`clientId`、通知权限、语言、是否隐藏（25s 一次） | 需要 `x-dsh-feedback-hub: 1` |
| POST | `/dsh-feedback-hub/test` | 设置页测试按钮，走同一条分发管线（`force: true`，绕过开关/去重/静音） | 同上 |
| POST | `/dsh-feedback-hub/mute` | `{ minutes }`，0 = 取消静音 | 同上 |
| POST | `/dsh-feedback-hub/reveal` | 点击通知时把窗口拉回前台并聚焦；返回走了哪条策略 | 同上 |

要求自定义请求头是为了让浏览器**强制跨域预检**：别的网页无法在用户不知情时触发我们的 POST。

## “谁弹系统通知”的判定

`osToast: auto`（默认）下：

```
有页面在线且 notification permission === 'granted' ？
 ├─ 是 → Host 不弹，交给页面：页面可见且聚焦 = 只弹浮窗；失焦/隐藏 = 再弹系统通知
 └─ 否 → Host 用 PowerShell + WinRT 直接弹（Windows 专用）
```

页面的“在线”有 60s 有效期：`presence` 停止上报后自动失效，避免页面卡死时再也收不到通知。

## 点击通知 → 唤起窗口 + 跳会话

点击通知时页面做两件事：先本地 `openSession(sessionId)` 把选中项切过去，再
`POST /reveal` 让 Host 把窗口拉回前台（这两步顺序无关，页面隐藏时导航同样生效）。

窗口为什么必须由 Host 来拉：

- 渲染进程只能 `window.focus()`，它不会把 `BrowserWindow.hide()` 隐藏到托盘的窗口
  变回来；
- Host 跑在 Electron 主进程里（`process.versions.electron` 有值），但**插件模块图里
  拿不到 `electron` 内置模块**：`import('electron')` 在 ESM 下拿到的是二进制路径，
  `createRequire(import.meta.url)('electron')` 会报 `Cannot find module 'electron'`；
- 所以实现是两条策略依次尝试：

| 顺序 | 策略 | 说明 |
|---|---|---|
| 1 | `revealViaElectron()` | `import` → `process.mainModule.require` → `createRequire`，命中则 `restore/show/focus/moveTop` |
| 2 | `revealViaPowerShell()` | Win32：`EnumWindows` 按进程名找到应用的顶层窗口（**隐藏的窗口也在枚举结果里**，而 `Get-Process.MainWindowHandle` 为 0），再 `ShowWindow(SW_RESTORE)` + `SW_SHOW` + `BringWindowToTop` + TOPMOST/NOTOPMOST 翻转 + `SetForegroundWindow` |

实测（Windows）：先 `ShowWindow(h, 0)` 隐藏窗口 → 调 `/reveal` →
`ok: true, via: 'win32'`，窗口重新可见，耗时 562ms。`ok: false, reason: 'no-window'`
表示找不到该进程的窗口（例如 `dsh web` 无桌面窗口），此时页面侧只做跳转。

脚本同样遵守两条约束：纯 ASCII（避免 PowerShell 5.1 编码误判）、临时文件用完即删；
进程名可通过 `windowProcessName` 配置（默认 `DeepSeek Harness`）。

## Windows toast 兜底实现

Host 侧写一个临时 `.ps1`，用隐藏窗口的 `powershell.exe -NoProfile -NonInteractive` 执行：

- Toast XML 先在 JS 里构造，再 **base64** 编码后嵌进脚本 —— 脚本本体是纯 ASCII，绕开 PowerShell 5.1 读取 `.ps1` 时的编码/BOM 问题（中文标题不会乱码）；
- `stdio: 'ignore'` + 进程数上限 4，失败静默降级，绝不阻塞事件管线；
- 脚本执行完毕后立即删除临时文件。

## 生命周期与清理

`apply()` 里创建的每个东西都有销毁路径：

| 资源 | 销毁方式 |
|---|---|
| 事件监听 | `ctx.on` 返回的 disposer，收进 hub 的 disposer 列表 |
| HTTP 路由 | 包在 `ctx.inject(['webServer'], …)` + `scoped.effect()` 里 |
| 定时器（心跳、presence 清理） | 显式 `clearInterval` |
| SSE 订阅者 | 插件销毁时 `res.end()` 并清空集合 |
| Client 侧 3 个槽位注册 | `ctx.slots.inject` 返回值，随插件销毁 |
| Client 侧定时器 / 事件监听 / EventSource | `apply` 返回的 cleanup 函数 |

禁用或卸载插件后不会残留监听、路由、定时器或 SSE 连接。

## 扩展点选择

| 需求 | 用的扩展点 | 理由 |
|---|---|---|
| 采集授权/提问 | `ctx.on('approval/request')` / `('user-questions/request')` | 唯一能在**决策发生前**感知的公开扩展点；旁听不改变结果 |
| 判断“任务完成” | `agent/status` | 比轮询 `whenIdle()` 精确，且不依赖会话日志格式 |
| 浮窗 | `shell.overlay`（list，root 作用域） | 框架级浮层，条目自行开启 pointer-events，不挡应用 |
| 铃铛 | `sidebar.footer.action`（list） | 设置按钮旁边的常驻位置，天然带 `wide` 折叠态信息 |
| 设置页 | `settings.section`（list） | 一个功能一页的标准席位，`label` 支持 thunk 自动跟随语言 |
| 页面 ↔ Host | `webServer` + SSE | 见上文 |
| 系统通知 | Client `Notification` → 兜底 Host PowerShell | 页面通道能感知焦点；Host 通道在无页面时仍可用 |

## 未采用的方案

- **改会话日志 / 追加自定义事件**：会破坏会话格式兼容性，明确不做。
- **Host 直接操作 `BrowserWindow` 唤起窗口**：v0.1 不做（需要验证 Host 是否运行在 Electron 主进程、以及版本兼容性），留待 v0.2。
- **轮询**：SSE 更省，且断线回放语义天然成立。
- **引入客户端 UI 框架或 Harness 客户端包**：本插件只用 `require('react')` + 主题令牌，避免版本漂移导致渲染崩溃。
