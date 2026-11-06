# 配置参考

所有配置都写在 profile 的 `cordis.patch.yml` 里（安装时由 `plugin_manager` 插入）。改完保存即生效；普通字段变更会重载插件，插件内存里的历史会清空。

## 完整示例

```yaml
- id: dsh-feedback-hub
  name: 'dsh-feedback-hub'
  config:
    events:
      approval: true
      question: true
      turn-done: true
      error: true
      subagent-end: false
      workflow-end: false
    turnDoneMinDurationMs: 60000
    quietHours: '23:00-08:00'
    dedupeWindowMs: 5000
    osToast: auto
    sound: true
    toastAppId: com.deepseek.dsh
    toastDurationMs: 8000
    historyLimit: 100
    maxTextLength: 160
```

## 字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `events.approval` | boolean | `true` | 工具调用需要授权时提醒 |
| `events.question` | boolean | `true` | 代理提问、计划确认、内联审批时提醒 |
| `events.turn-done` | boolean | `true` | 一轮任务完成时提醒 |
| `events.error` | boolean | `true` | 步骤/回合出错时提醒 |
| `events.subagent-end` | boolean | `false` | 子代理结束时提醒（并行子任务多时会比较吵） |
| `events.workflow-end` | boolean | `false` | 工作流结束时提醒 |
| `turnDoneMinDurationMs` | number | `60000` | 完成通知的门限：只有跑满这么久的回合才提醒。下限 0（每轮都提醒），上限 24h |
| `quietHours` | string | `''` | 静音时段，支持多段与跨午夜：`"23:00-08:00"`、`"12:00-13:30,18:00-19:00"`。空串 = 不启用。注意：静音时段内浮窗与历史**仍然记录**，只是不弹系统通知、不出声 |
| `dedupeWindowMs` | number | `5000` | 同一事件在这个窗口内只提醒一次。判定键 = `类型 + 会话 + 工具名/问题摘要`。范围 0–600000 |
| `osToast` | enum | `auto` | 系统通知由谁弹：`auto` / `client` / `host` / `off`，见下 |
| `sound` | boolean | `true` | 应用内提示音（三类事件三种音） |
| `toastAppId` | string | `com.deepseek.dsh` | Windows Toast 的 AppUserModelID；默认即 DSH 桌面端身份，显示名会是 “DeepSeek Harness” |
| `toastDurationMs` | number | `8000` | 应用内浮窗停留时长，范围 1500–60000 |
| `historyLimit` | number | `100` | Host 内存环形缓冲长度，范围 10–500（不落盘） |
| `maxTextLength` | number | `160` | 单条通知文本的裁剪长度，范围 24–500 |

任何非法值都会被**静默回退到默认值**，不会让插件启动失败。未知字段会被保留但不影响行为。

## `osToast` 四种模式

| 值 | 行为 | 适用场景 |
|---|---|---|
| `auto`（默认） | 页面在线且已获通知权限 → 页面负责（能感知窗口是否聚焦）；页面不在线或无权限 → Host 用 PowerShell 弹 | 绝大多数情况 |
| `client` | **只**由页面弹，Host 永不启动外部进程 | 不想让 DSH 调起 PowerShell |
| `host` | **始终**由 Host 弹（页面只做浮窗） | 页面渲染进程被节流/冻结时更可靠；或页面通知权限被拒 |
| `off` | 不弹系统通知，只有浮窗 + 提示音 | 只要能回到应用里看 |

## 常见用法

**只关心“要你动手”的时刻，不要完成通知**

```yaml
events:
  approval: true
  question: true
  turn-done: false
  error: true
```

**只在长时间任务结束后提醒**

```yaml
turnDoneMinDurationMs: 300000   # 5 分钟以上才提醒
```

**晚上和午休静音**

```yaml
quietHours: '23:00-08:00,12:00-13:30'
```

**完全不经页面，全部由 Host 弹系统通知**

```yaml
osToast: host
```

**子代理 / 工作流也提醒**

```yaml
events:
  subagent-end: true
  workflow-end: true
```

## 与 `plugin_manager` 的关系

- `install_bundle` 负责把包写进 profile 并插入这一行；
- 卸载/禁用插件时，事件监听、HTTP 路由与定时器都会随插件一起销毁，不会残留；
- 重装（升级已安装包）需要重启 DSH 才会加载新的 JS 模块 —— 目录链接方式下改代码也一样。

## 环境要求

| 项 | 要求 |
|---|---|
| DSH 版本 | 带 Web GUI 的桌面端或 `dsh web`（需要 `webServer` 服务） |
| Node | ≥ 20（只用于跑测试脚本；插件本身跑在 DSH 内） |
| 平台 | Windows（Host 兜底 toast）；macOS / Linux 只走页面通道 |
