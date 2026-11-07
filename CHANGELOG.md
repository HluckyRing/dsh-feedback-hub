# 更新日志

**DSH 反馈中心（dsh-feedback-hub）** —— 在 DSH 需要你授权、向你提问或任务完成时，用 Windows 系统通知、应用内浮窗和侧边栏未读数把反馈送到你面前。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[0.3.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.3.0
[0.2.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.2.0
[0.1.2]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.2
[0.1.1]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.1
[0.1.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.0
