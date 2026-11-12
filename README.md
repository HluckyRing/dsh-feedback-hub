# dsh-feedback-hub · DSH 通知中心

> 让 DeepSeek Harness 在**需要你授权**、**等你回答**、**任务跑完**、**出错**时主动提醒你 —— 不用一直盯着窗口。
> 系统通知（Windows）/ 应用内浮窗 / 侧边栏铃铛未读数 / 提示音，四条反馈通道自动协同，窗口最小化或隐藏到托盘时照样收得到。

[![license: MIT](https://img.shields.io/badge/license-MIT-4F7CFF.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-0.4.0-F5A524.svg)](https://github.com/HluckyRing/dsh-feedback-hub)
[![tests](https://img.shields.io/badge/tests-35%20passed-2ea44f.svg)](test/smoke.mjs)
[![CI](https://github.com/HluckyRing/dsh-feedback-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/HluckyRing/dsh-feedback-hub/actions/workflows/ci.yml)

---

## 它解决什么问题

DSH 在后台跑长任务时，你切去做了别的事。两种时刻最容易空等：

1. **它卡在等你** —— 工具调用需要授权、代理通过 `ask_user_question` 问你一个问题；
2. **它已经跑完了** —— 回合结束、子代理结束、报错退出。

本插件把这两类时刻变成可感知的反馈：屏幕右下角弹系统通知 + 提示音，应用里留下浮窗和未读数，点一下直接跳回对应会话。

## 功能

| 能力 | 说明 |
|---|---|
| 6 类事件 | 授权请求、代理提问、回合完成、出错、子代理结束、工作流结束（后两个默认关） |
| 四条通道 | Windows 系统通知 / 应用内浮窗 / 提示音 / 侧边栏铃铛未读数 |
| 自动兜底 | 页面在线且已授权 → 页面负责弹；页面不在或无权限 → Host 直接弹系统通知 |
| 只在不打扰时打扰 | 默认「窗口聚焦只弹浮窗，失焦/隐藏才弹系统通知」；完成通知默认每轮都发，不想被短任务打扰可调 `turnDoneMinDurationMs` |
| 叫得住人 | 授权/提问的系统通知**常驻屏幕直到你关掉**（reminder 场景），并发系统通知音；应用内音量和「双保险」可配 |
| 点一下回去 | 点系统通知 → 窗口从托盘/最小化**拉回前台**并切到对应会话（Electron API 优先，失败退回 Win32 枚举） |
| 已读 / 未读 | 铃铛只数**未读**；点浮窗、点系统通知、点列表条目即已读；「全部已读」和「清空历史」是两件事 |
| 授权/提问不漏 | 两个 waterfall 监听器用 `prepend` 注册到链首（弹窗会提前 claim，注册在后面的监听器根本不会执行）；授权另有一条持久化会话事件兜底 |
| 静音时段 | `quietHours: "23:00-08:00"`，跨午夜也支持 |
| 去重窗口 | 同一事件 5s 内只提醒一次，避免重试/重复派发刷屏 |
| 一键跳转 | 点浮窗、点通知、点铃铛里的条目 → 打开对应会话 |
| 静音 1 小时 | 临时按下所有声音与系统通知，浮窗与历史仍保留 |
| 设置页 | 设置 → 通知中心：通道状态、**就地改配置**（事件开关 / 音量 / 系统通知模式 / 门限 / 静音时段）、测试按钮与诊断；铃铛面板里的「通知设置」也能打开同一张页 |
| 零依赖零构建 | 纯 ESM + 浏览器原生能力，没有 `node_modules`，没有打包步骤 |

## 事件一览

| 事件 | 何时触发 | 默认 |
|---|---|---|
| `approval/request` | 工具调用需要你授权 | ✅ |
| `user-questions/request` | 代理提问 / 计划确认 / 内联审批 | ✅ |
| `agent/status` → idle | 本轮任务完成（默认每轮都提醒；`turnDoneMinDurationMs` 可设最短时长门限） | ✅ |
| `agent/error` | 步骤或回合出错 | ✅ |
| `subagent/end` | 子代理结束 | ⬜ |
| `workflow/end` | 工作流结束 | ⬜ |

两个 waterfall 事件（`approval/request`、`user-questions/request`）本插件**只旁听**：监听器一定 `return next()`，绝不改变谁被问到、也不改变授权结果。

## 安装

### 1. 拿到代码

```bash
git clone https://github.com/HluckyRing/dsh-feedback-hub.git
cd dsh-feedback-hub
```

也可以直接把仓库放到任意目录 —— DSH 以**本地目录**方式安装，`install_bundle` 会链接这个 checkout，不需要发布到 npm。

### 2. 安装到当前 profile

在 DSH 里让 agent 执行（或按你自己的插件安装流程操作）：

```
plugin_manager(action: "install_bundle", target: "D:\\path\\to\\dsh-feedback-hub")
```

安装实际做两件事：把本仓库以 `link:` 依赖写进 profile 的 `package.json`，并把 `dsh-feedback-hub` 加进 `dsh.profile.bundles`。**插件行与默认配置来自本仓库自带的 `cordis.patch.yml`**，不会被复制进 profile 的覆盖文件 —— 所以改默认值请按下面的「配置」一节做。

### 3. 验收

打开 **设置 → 通知中心**，点「测试 · 测试通知」：

- 应当立刻出现右上角浮窗 + 提示音；
- 把窗口最小化或切走，再点一次，应当弹 Windows 系统通知。

### 4. 启用密钥守卫（推荐）

```bash
git config core.hooksPath .githooks
node .githooks/check-secrets.mjs   # 手动自查，退出码 0 才算干净
```

## 配置

默认配置写在仓库自带的 `cordis.patch.yml` 里。**推荐改法**是在 profile 的 `cordis.patch.yml` 末尾追加一条同 `id` 的覆盖行（Loader 的匹配覆盖会替换整份 `config`，没写的字段仍由插件默认值兜底）：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml 末尾
- id: dsh-feedback-hub
  config:
    events:
      turn-done: false
    quietHours: '23:00-08:00'
```

完整字段见 [docs/CONFIG.md](docs/CONFIG.md)。直接改仓库里的 `cordis.patch.yml` 也能生效，但下次 `git pull` 容易冲突。

默认值（仓库自带 patch，仅供对照）：

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
    turnDoneMinDurationMs: 0       # 0 = 每轮完成都提醒；300000 = 只要 5 分钟以上的
    quietHours: ''                 # "23:00-08:00" / "12:00-13:30,18:00-19:00"
    dedupeWindowMs: 5000
    osToast: auto                  # auto | client | host | off
    sound: true
    toastAppId: com.deepseek.dsh
    toastDurationMs: 8000
    historyLimit: 100
```

## 后台 / 最小化 / 托盘下的行为

| 你的窗口状态 | 你会收到 |
|---|---|
| 窗口可见且聚焦 | 应用内浮窗 + 提示音 |
| 窗口可见但被挡住 / 最小化 | 浮窗（切回来能看到）+ 系统通知 + 提示音 |
| 窗口隐藏到托盘（点了 ✕） | 系统通知 + 提示音；**点通知直接把窗口拉回来**并跳到会话；未读数在打开后补显 |
| 页面崩溃 / 通知权限被拒 | Host 兜底直接弹系统通知（`osToast: auto` 时） |
| DSH 完全退出 | 不会通知 —— 此时任务也已停止 |

> DSH 桌面端关窗口 = **隐藏到托盘，任务继续运行**（官方提示原文：“正在运行的任务不会中断，可在系统托盘中重新打开窗口”）。所以关掉窗口并不会让通知失效。

## 已读 / 未读

| 情形 | 结果 |
|---|---|
| 通知到达，你**不在**那个会话 | 未读：浮窗 + 声音（窗口失焦时系统通知） |
| 通知到达，你**正看着**那个会话（页面可见且聚焦） | 授权/提问：仍然弹浮窗 + 轻提示音提醒（等你操作的事不能被静音），保持未读；完成/出错：直接标已读，不弹窗不出声 |
| 点浮窗 / 点系统通知 / 点铃铛里的条目 | 标为已读 + 跳到会话 |
| 切到某个会话 | 该会话的历史通知自动全部已读 |
| 铃铛角标 | 只显示**未读**数量；面板里未读高亮 + 小圆点，已读变暗 |
| 「全部已读」/「清空历史」 | 分开的两个动作（清空是真的从 Host 内存删掉） |

已读状态由 **Host 持有**，所以刷新页面、重开标签页都不会全部变回未读，多个页面看到的是同一份状态。

## 隐私与安全

- **只搬运通知元数据**：事件类型、会话标题、工具名、授权/提问的原因、运行时长、错误摘要。
  **不读取、不转发对话正文**，不保存任何会话内容。
- **不落盘**：历史只存在 Host 进程内存的环形缓冲里（默认 100 条），重启即清空。
- **不联网**：没有任何外部请求；预留的 webhook 通道默认关闭，当前版本尚未实现。
- **路由安全**：`/dsh-feedback-hub/events` 是只读 SSE；所有 POST 路由要求自定义请求头 `x-dsh-feedback-hub: 1`，这会强制浏览器跨域预检，别的网页无法伪造。
- **仓库守卫**：`.githooks/check-secrets.mjs` 拦截密钥文件、真实形态的密钥串，以及**本机用户名 / 家目录绝对路径**（规则运行时现算，脚本本身不含个人信息）。
- 本仓库不包含任何 `.env`、令牌、cookie 或会话记录。

## 已知限制（v0.2）

- **Host 兜底 toast 不响应点击**：那条通知是 PowerShell 直接调用 WinRT 弹的，没有注册 COM 激活器，点了只会消失（页面通道弹的通知可以点击唤起并跳转）。想让点击始终有效，把 `osToast` 保持默认的 `auto` 即可。
- **Windows 专注助手 / 勿扰**会压掉通知横幅与系统音，这是系统级设置；此时通知静默进入通知中心，应用内浮窗与页面提示音仍然有效。如果一直收不到横幅，先检查「设置 → 系统 → 通知 → 专注助手」。
- **声音由谁发**：窗口失焦/隐藏时由**系统通知**发声（Windows 通知音，音量受系统通知音量控制，比页面合成音更可靠）；窗口聚焦时用应用内合成音（`volume` 可调）。两者默认不叠加，想要双保险可设 `chimeWithOsToast: true`。
- Host 兜底 toast 只在 **Windows** 实现（PowerShell + WinRT）；macOS / Linux 只有页面通道。
- 设置页改完配置后插件会**重载一次**（历史清空、事件流自动重连），这是让新值生效的机制；不想改动界面也能直接编辑配置。

## 开发

```bash
npm test              # node test/smoke.mjs，35 项纯逻辑 + 打包不变量检查
npm run check:syntax  # node --check 三个 JS 文件
npm run check         # 语法 + 密钥守卫 + 测试
```

CI（`.github/workflows/ci.yml`）在每次 push / PR 时于 **ubuntu + windows** 两个平台跑：
语法检查 → 35 项测试 → 密钥与个人信息守卫（`--all` 扫描全部已跟踪文件）→ `npm pack --dry-run`
校验发布文件清单。徽章见页首。

目录结构：

```
dsh-feedback-hub/
├─ index.js            # Host 半：事件订阅 → 过滤节流 → SSE / Windows toast
├─ client.js           # Client 半：SSE → 浮窗 / 铃铛 / 系统通知 / 设置页
├─ core.js             # 纯函数（配置、静音时段、去重、toast XML/脚本、环形缓冲）
├─ cordis.patch.yml    # 安装行 + 默认配置
├─ locale/{en,zh}.json # 插件管理页显示的标题与描述
├─ icon.svg            # 原创图标（铃铛 + 反馈波纹）
├─ test/smoke.mjs
├─ .githooks/          # 密钥 / 个人信息守卫
└─ docs/               # CONFIG.md、ARCHITECTURE.md
```

安装方式是**目录链接**，所以改完代码需要重启 DSH 才会加载新的 JS 模块。

## English

`dsh-feedback-hub` is a DeepSeek Harness plugin that tells you when the agent **needs your authorization**, **asks you a question**, **finishes a task**, or **fails**. It combines a Windows desktop toast, an in-app toast stack, an unread bell, and a short chime — and keeps working while the window is minimized or hidden in the tray.

Zero dependencies, zero build step: clone the repo, install it as a local bundle, open **Settings → Notifications**, and hit a test button. All toggles live in the plugin config (`cordis.patch.yml`) and are documented in [docs/CONFIG.md](docs/CONFIG.md).

## 许可证

[MIT](LICENSE) © 2026 HluckyRing
