# 更新日志

**DSH 反馈中心（dsh-feedback-hub）** —— 在 DSH 需要你授权、向你提问或任务完成时，用 Windows 系统通知、应用内浮窗和侧边栏未读数把反馈送到你面前。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[0.1.1]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.1
[0.1.0]: https://github.com/HluckyRing/dsh-feedback-hub/releases/tag/v0.1.0
