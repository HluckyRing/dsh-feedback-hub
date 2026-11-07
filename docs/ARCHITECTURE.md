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
| POST | `/dsh-feedback-hub/read` | 标记已读：`{ seqs }` / `{ sessionId }` / `{ all: true }`，返回实际变更的 seq | 同上 |
| POST | `/dsh-feedback-hub/clear` | 清空历史（从 Host 内存删除） | 同上 |

要求自定义请求头是为了让浏览器**强制跨域预检**：别的网页无法在用户不知情时触发我们的 POST。

## “谁弹系统通知”的判定

`osToast: auto`（默认）下：

```
有页面在线且 notification permission === 'granted' ？
 ├─ 是 → Host 不弹，交给页面：页面可见且聚焦 = 只弹浮窗；失焦/隐藏 = 再弹系统通知
 └─ 否 → Host 用 PowerShell + WinRT 直接弹（Windows 专用）
```

页面的“在线”有 60s 有效期：`presence` 停止上报后自动失效，避免页面卡死时再也收不到通知。

## 序号为什么用时间戳播种

页面把 `cursor`（最后处理的 `seq`）记在内存里，重连时带 `?since=cursor` 请求回放。
如果 Host 每次重启都从 1 重新编号，页面就会认为所有新事件都“已经见过”并**静默丢弃**
—— 实测症状：SSE 明明连着、`sseClients=1`，但页面一条都不处理。

所以 `RingBuffer` 的起始序号由 `Date.now()` 播种（每次重启都严格大于上一次），
客户端另有兜底：快照里的 `cursor` 比本地小时直接重置本地游标。

## SSE 自愈与 Host 兜底

- 浏览器在收到非 200 响应时会把 `EventSource` 关掉且不再自动重连，而插件重载期间
  路由正好短暂消失。客户端因此加了看门狗：10s 心跳检查 `readyState === CLOSED` 就重开，
  失败按 1s→30s 退避；`visibilitychange` 时也顺手修复。
- Host 的“由页面弹系统通知”判定不再只看 presence：**必须同时有 SSE 订阅者**才把
  通知交给页面。页面 SSE 死掉时 presence 仍在（那是另一个请求），只看 presence 会
  导致通知两边都不弹。没有订阅者时 Host 直接弹自己的 Windows toast。



`approval/request` 是 **waterfall**：某个监听器返回结果即“claim”这次请求，后面的监听器
**根本不会被调用**。Web 设置/授权弹窗就是那个提前 claim 的 answerer —— 实测把
`approval/request` 注册为普通监听器后，一次真实审批（20:31，ai_rag 会话）**完全没有进入
插件**，而同一会话的 `turn-done` 正常到达，缓冲里找不到任何 approval 条目。

所以授权/提问的监听器都用 **`{ prepend: true }`** 注册到链首：先旁听、再 `next()`
把决定权交回弹窗；同时授权另有一条持久化会话事件 `approval/asked` 兜底。

- `approval/asked` 是审批开始时写进会话日志的提交事件（数据里带 `toolName` / `callId` /
  `reason`），属于 `session/event` 这条 **post-commit、fire-and-forget** 的 feed，
  没有“被谁 claim”的问题；
- 监听器只做一次类型判断，其余事件立即返回，开销可忽略；
- `approval/request` 的监听器保留作补充（其他组合下可能先于弹窗注册），重复事件由
  5s 去重窗口吸收。

诊断字段（`/snapshot`）：

| 字段 | 含义 |
|---|---|
| `sessionEvents` | 插件看到的各类会话事件计数 —— 用它能判断 feed 是否还活着 |
| `sightings` | 最近 15 个通知候选：`kind`、`delivered`、`reason`（`disabled` / `too-short` / `duplicate` / `forced`），用它能区分“没收到”和“收到但被过滤” |

设置页的「诊断」卡片就是这两组数据的展示 + 刷新按钮。

## 已读状态归谁管

**Host 是唯一真源**：环形缓冲里的每条通知带 `read` / `readAt`，页面只是镜像。

- 页面标记已读时先本地更新（即时反馈），再 `POST /read`；Host 更新后通过 SSE
  `event: read` 广播 `{ seqs }`，其他标签页同步；
- 清空同理，Host 广播 `event: clear`，所有页面一起清；
- 刷新页面后 `/snapshot` 带回 `read` 字段，所以不会全部变回未读。

“用户正看着哪个会话”只有页面知道，所以由客户端上报：在**会话级槽位**
`conversation.composer.dock`（`scope: session`，standardProps 里带 `sessionId`）
注册一个**渲染为 `null` 的观察组件**，它挂载时告知 store 当前会话、卸载时清空。
这条路不读 shell DOM、不订阅会话日志，切换会话时自动触发“该会话全部已读”。

到达时的分流规则在客户端：`isViewing(sessionId)`（同一会话 + 页面可见 + 聚焦）为真
则直接标已读并跳过浮窗/声音/系统通知，否则走正常提醒。

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
