# 更新日志

**DSH 反馈中心（dsh-feedback-hub）** —— 在 DSH 需要你授权、向你提问或任务完成时，用 Windows 系统通知、应用内浮窗和侧边栏未读数把反馈送到你面前。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[0.1.2]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.2
[0.1.1]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.1
[0.1.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.0
