# 更新日志

**DSH 反馈中心（dsh-feedback-hub）** —— 在 DSH 需要你授权、向你提问或任务完成时，用 Windows 系统通知、应用内浮窗和侧边栏未读数把反馈送到你面前。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-11-12

### 新增
- **设置页就地改配置**：新增「通知行为」卡片，可直接调整事件开关、提示音开关与音量、
  系统通知归属（auto/client/host/off）、是否在系统通知外叠音、看会话时的策略、
  完成通知门限、静音时段、点击唤起窗口；「保存并重载」写回配置并让该行重载。
- Host 新增 `POST /config`：经 DSH 的 `configEditor` 把**完整 config** 写入 profile 的
  `cordis.patch.yml` 覆盖行（不手改用户文件）；编辑器不可用/被上层覆盖时返回原因，
  页面照实展示。
- `core.js` 新增 `applyConfigPatch()` 纯函数：合并 + 校验 + 补齐默认值，返回可直接落盘的完整配置。
- 保存后客户端主动重连并重读快照，无需手动刷新；状态提示区分「保存中 / 已保存 / 失败」。

### 变更
- `/snapshot` 的 `config` 统一由 `publicConfig()` 产出，与 `/config` 响应同构。
- 测试补到 35 项（配置补丁合并、越界钳制、完整字段检查）。

## [0.3.3] - 2026-11-07

### 变更
- **`turnDoneMinDurationMs` 默认值从 `60000` 改为 `0`**：默认每轮任务完成都提醒。
  原来的 60s 门限会把短任务静默掉（实测 21:27 与 21:37 两次真实完成事件
  都是 `reason='too-short'` 被过滤）。想只被长任务打扰，把它设成 `300000` 之类即可。
- 文档同步：README / CONFIG 的门限说明与示例。
- 测试补到 34 项（零门限放行短回合、显式门限仍然过滤）。

## [0.3.2] - 2026-11-07

### 修复
- **提问（`ask_user_question`）同样收不到通知**：和授权一样，`user-questions/request`
  是 waterfall，被 Web 弹窗提前 claim。两个 waterfall 监听器改为 `{ prepend: true }`
  注册到链首，先旁听再 `next()`，弹窗行为不变。
- **Host 重启后所有通知被客户端静默丢弃**：序号从 1 重新编号，而页面记着旧游标，
  新事件全被判成“已见过”。`RingBuffer` 改为用 `Date.now()` 播种序号，客户端在
  快照游标回退时也会重置本地游标。
- **SSE 断开后不恢复**：浏览器遇到非 200 会永久关闭 `EventSource`（插件重载期间正好
  命中）。客户端加看门狗：10s 检查 `readyState === CLOSED` 就重开，失败按 1s→30s
  退避，窗口重新可见时也会修复。
- **页面 SSE 死掉时 Host 仍以为它会弹**：`osToast: auto` 的判定改为“有 SSE 订阅者
  且页面已授权”才交给页面，否则 Host 直接弹兜底 toast。

### 新增
- `/snapshot` 增加 `sseClients`，设置页「诊断」能直接看到页面是否真的连着事件流。
- 测试补到 33 项（含序号播种）。

## [0.3.1] - 2026-11-07

### 修复
- **等待审批时没有任何提示**。根因：`approval/request` 是 waterfall，Web 授权弹窗作为
  answerer 会提前 claim，注册在它之后的监听器根本不会被调用（已用会话日志与插件缓冲区
  对照确认：同一会话的 turn-done 收到、approval 完全没有）。改为监听持久化会话事件
  `approval/asked`，它走 post-commit 的 `session/event` feed，不存在被 claim 的问题；
  原 waterfall 监听保留作补充，重复事件由去重窗口吸收。
- 你正看着某个会话时，**授权/提问仍然弹浮窗提醒**（新配置 `notifyWhileViewing`，
  默认 `important`；设为 `never` 恢复“一律只标已读”的旧行为）。

### 新增
- 诊断能力：`/snapshot` 增加 `sightings`（最近 15 个候选事件及其 `delivered`/`reason`）
  与 `sessionEvents`（看到的各类会话事件计数）；设置页新增「诊断」卡片 + 刷新按钮，
  能区分“没收到事件”和“收到但被过滤”。
- 测试补到 32 项。

## [0.3.0] - 2026-11-07

### 新增
- **已读 / 未读**：铃铛角标只数未读；点浮窗、点系统通知、点列表条目都会标记已读；
  面板里未读高亮 + 圆点、已读变暗，并新增「只看未读」筛选。
- **「全部已读」与「清空历史」分离**：前者只改状态，后者才从 Host 内存删除。
- **正在看的会话自动已读**：在会话级槽位 `conversation.composer.dock` 注册渲染为
  null 的观察组件拿到 `sessionId`；通知到达时若用户正停留该会话（页面可见且聚焦），
  直接标记已读且不弹浮窗、不出声、不发系统通知。
- 切换会话时，该会话的历史通知自动全部已读。

### 变更
- 已读状态由 **Host 持有**（缓冲条目带 `read` / `readAt`），通过 SSE `read` / `clear`
  帧广播；刷新页面、多标签页状态一致。
- 新增 `POST /read`（`{ seqs }` / `{ sessionId }` / `{ all: true }`）与 `POST /clear`。
- `collectReadTargets` 纯函数解析已读目标，测试补到 30 项。

## [0.2.0] - 2026-11-07

### 新增
- **点击系统通知 → 把 DSH 窗口从托盘/最小化拉回前台，并切到对应会话**。
  Host 侧两条策略依次尝试：Electron 主进程 API（本插件的模块图里通常解析不到
  `electron` 内置模块，已做实测确认）→ Win32 `EnumWindows` + `ShowWindow` +
  `SetForegroundWindow` 兜底。实测：隐藏窗口后调用 `/reveal`，562ms 恢复可见。
- 配置项 `revealOnClick`（默认开）与 `windowProcessName`（默认 `DeepSeek Harness`）。
- `/snapshot` 的 presence 摘要与 `/reveal` 的失败诊断（`via`、`reason`、`diagnostics`）
  便于排查“为什么没唤起”。
- 设置页新增「测试唤起窗口」按钮；测试补到 29 项（含 reveal 脚本 ASCII/转义检查）。

## [0.1.2] - 2026-11-06

### 改进
- **声音太轻**：应用内提示音改为「基频 + 八度 + 十二度」的加法合成钟声，峰值增益从 0.16 提到
  可配置的 `volume`（默认 0.6，范围 0.05–1）。
- **窗口失焦时改由系统通知发声**：此时页面音频可能被浏览器挂起，系统通知音更可靠；
  默认不再叠加应用内音（`chimeWithOsToast: false` 可改成双保险）。
- **重要通知常驻**：授权请求与代理提问的系统通知改用 `scenario="reminder"` +
  `duration="long"`（页面侧 `timeoutType: 'never'`），会一直留在屏幕右下角直到关闭；
  任务完成仍用短通知。
- `/snapshot` 增加 `presence` 摘要（页面数、通知权限、语言、是否隐藏），便于排查「为什么没弹」。
- 设置页显示提示音音量，并新增「试听提示音」按钮。

## [0.1.1] - 2026-11-06

### 修复
- 铃铛面板里的「通知设置」点击无反应：`sidebar.settings` 是 shell 独占的 single 槽，
  插件侧没有打开设置面板的 API（`layout.selectPanel('settings')` 会抛异常）。
  改为在浮层内部切换视图，复用同一个设置组件；设置页入口（设置 → 通知中心）保留。

## [0.1.0] - 2026-11-06

### 新增
- 事件监听：授权请求、代理提问、回合完成、出错、子代理结束、工作流结束
- Windows 系统通知通道（含托盘/后台场景）、应用内浮窗、侧边栏铃铛未读数
- 设置页「通知中心」：通道状态 + 发送测试通知
- 静音时段、去重窗口、完成通知最短时长阈值

[0.4.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.4.0
[0.3.3]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.3.3
[0.3.2]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.3.2
[0.3.1]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.3.1
[0.3.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.3.0
[0.2.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.2.0
[0.1.2]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.2
[0.1.1]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.1
[0.1.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.0
