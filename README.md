# dsh-model-capabilities

> 模型能力 —— 在 **Models 设置页原生卡片内** 为自定义 `llm-pi-ai` 模型配置：
> 思考强度档位（reasoningEfforts）、提供方默认思考强度（reasoning）、
> 支持模态（input / defaultInput）、网关兼容开关（compat）、
> 静态自定义请求头（headers，按需手动添加，值原样发送——例如固定的
> `x-opencode-session`）。全部配置经官方 `settings.mutate` 写入
> `cordis.patch.yml`（profile 的 patch 文档），**无需手改配置**。

A DeepSeek Harness (DSH) web plugin — Host + Web UI track.

- 挂载点：官方扩展位 `settings.models.provider-card`（keyed by `llm-pi-ai`），
  即 Models 设置页每张 pi-ai 提供方卡片内的适配器扩展区。
- 数据属主：`llm-pi-ai` 设置节（pi-ai 适配器）。浏览器面通过官方设置通路
  Host 同源 HTTP 桥（GET/POST `/model-capabilities`）经 `ctx.settings` 读写 —— 与官方
  同一套 revision 防冲突 + pi-ai config schema 校验
  （`assertServiceable`：非法的协议/档位组合会在写入处就被拒绝）。
- Host 面仅提供同源 HTTP 桥；无自有持久数据（`llm-pi-ai` 命名空间属主是 pi-ai 适配器）。

## 思考档位默认注入（0.9.0，无需操作）

**官方缺口**：dsh 0.1.7 给 `contextWindow`、`maxTokens`、`input` 都留了路由级兜底
（`entry.x ?? base?.x ?? request.defaultX`），**唯独 `reasoningEfforts` 没有第三级** ——
省略时走 `base?.reasoning ?? false`。于是官方 Models 页新建的**自定义路由**（不在内置
catalog 的 39 个路由内）只提供 `off` 一档，而官方编辑器又**不渲染**思考强度控件
（`ui-settings-models` 里 `reasoningEfforts` 出现 0 次）。结果就是「上下文能改、模态能改、
思考强度改不了」。

**本插件补上这一级**：为**缺少 `reasoningEfforts` 的自定义路由**模型自动写入

```yaml
reasoningEfforts:
  off: null     # 支持但不发送参数
  low: low
  high: high
  max: max
```

（只声明这四档。pi-ai 把**缺失的 key 钉为 `null`**＝不提供，所以键集就是档位集。
`medium` 刻意不给，需要时在卡片里自行添加。）

写入时机：插件挂载时扫描一次，之后监听 `settings/document-updated`（仅 `llm-pi-ai`）——
所以**在官方页面新建提供方后立即生效，不用重启**。

安全边界（全部有回归测试）：

- **只补缺失项**：已有 `reasoningEfforts` 的模型一律不动。显式 `false`（非推理模型）和
  自定义档位（含 `{}`）都算「已声明」，绝不覆盖。
- **只碰自定义路由**：依据 `ctx.llm.listConfigurableProviders()` 的 `declared === true`。
  catalog 路由已从 `base?.reasoning` 继承厂商精选档位，注入会把它替换成猜测值，因此跳过。
- **revision 防冲突**：用与桥相同的 `settings.mutate` + 读到的 revision；并发编辑时干净
  落败（`SETTINGS_CONFLICT`），由下一次事件重试，绝不覆盖你的改动。
- **失败不影响启动**：任何异常只记 `warn` 日志后放弃（这是便利功能，不是关键路径）。
- 写入走 `configEditor.edit` 的**文档级**编辑（`parseDocument` → `setIn`），保留注释与
  其余条目；原子写，失败回滚。

## 字段对照

| UI 控件 | 写入位置 |
|---|---|
| 模型 · 模态（继承 / 仅文本 / 文本+图像） | `providers.<route>.models[i].input` |
| 模型 · 思考强度（未设置 / 禁用 / 标准档位 / 自定义） | `models[i].reasoningEfforts`（`false` / 档位字典；`off` 可留空=不发送） |
| 提供方 · 默认思考强度 | `providers.<route>.reasoning` |
| 提供方 · 默认模态 | `providers.<route>.defaultInput` |
| 提供方 · 请求头（按需手动添加） | `providers.<route>.headers`（名称统一小写，值原样发送；`user-agent` 由 DSH 归属头占用，不可设置） |
| 提供方 · 兼容设置（19 布尔 / 4 枚举 / 1 整数；详见兼容性） | `providers.<route>.compat`（逐键合并） |

## 安装

```sh
# GitHub 固定提交（推荐；先到 Releases/Tags 拿 40 位 commit，或直接用 tag）
dsh plugin --profile web add github:fuzz1og/dsh-model-capabilities#<40位commit>
# 例（tag 对应的提交同样可用 40 位 sha）：
#   dsh plugin --profile web add github:fuzz1og/dsh-model-capabilities#$(git ls-remote https://github.com/fuzz1og/dsh-model-capabilities.git refs/tags/v0.2.0 | cut -c1-40)

# 本地开发安装（从仓库根目录；保持目录在位）
dsh plugin --profile web add ./

# 验证组合与行解析
dsh --profile web --dump-config
dsh --profile web
```

安装后**重启 web profile**（Settings → 重启 或 `dsh --profile web`）生效。
桥走软依赖（`ctx.inject(['webServer'], …)`）：装在 headless / tui 等没有 web
服务的 profile 里也不会阻塞启动，只是该 profile 不提供这张设置卡片。

## 使用

1. Settings → Models：添加/编辑一个自定义（llm-pi-ai）提供方，保存后卡片内出现「模型能力」卡片。
2. 展开每个模型行：选择模态与思考强度；需要非标准线上拼写时选「自定义」逐档填写（如 `max → ultra`）。
3. 需要自定义请求头（如 opencode Go 要求的 `x-opencode-session`）：展开「请求头」
   →「添加请求头」，名称与值逐行填写（固定值，原样发送），点「应用能力配置」。
4. 点火失败（网关 400）时，在「兼容设置」里按上游文档修正，例如
   `developer 角色: 不支持（用 system）`、`maxTokensField: max_tokens`。
5. 点「应用能力配置」→ 写入成功显示绿色提示；冲突/校验拒绝会显示原因（冲突后视图自动刷新，可直接重试）。

## opencode Go 的 x-opencode-session（固定头即可）

[opencode 官方文档](https://opencode.ai/docs/go/) 对 Go 套餐的使用方有三条要求：
不产生滥用流量、**正确标识自身（不用泛化 User-Agent）**、**携带 `x-opencode-session` 头**
（网关按会话做亲和路由并优化 prompt caching），否则**账号可能被标记**。

本插件的对应关系：

- **身份要求已由 DSH 满足**：`dsh-llm` 的归属头机制对每个提供方请求发送
  `user-agent: deepseek-harness/<版本> (+https://github.com/deepseek-ai/deepseek-harness)`，
  且 `user-agent` 列为保留头——用户配置不能覆盖它，也不需要伪装 opencode 客户端。
- **会话头用固定值即可**：在卡片「请求头」区自建 `x-opencode-session` 行并填一个
  固定值（稳定的不透明标识，如 `dsh-my-install`）——每个请求原样发送。网关用它
  做亲和路由与 prompt-caching 优化，一个安装内一致的稳定值即满足官方要求。
- **历史说明**：0.4.x–0.5.0 曾内置「每 DSH 会话动态注入 / `{{session}}` 占位符」
  的 wire 层机制（waterfall 监听 + fetch 包装 + per-host 台账）；0.6.0 起移除——
  不再需要动态头，固定值即可。若你确实需要每会话轮换，改用 dsh.pub 上的
  wire 层注入类插件（如 `dsh-opencode-session-id`）。

## 配置

无：所有行为取现设置节；在 profile 的 `cordis.patch.yml` 中可按 id
`model-capabilities` 覆盖行 config（默认无配置项）。

## 兼容性

- **当前适配目标：DSH `0.1.7-alpha.1` / `@deepseek-ai/dsh-llm-pi-ai 0.1.7-alpha.1`**。验证含本地源码回归、针对**已安装**包的 parity 静态核对（`npm run test:parity`），以及 Host 桥的 revision 栅栏回归；未部署、未重启 profile、未对 live settings 写入，也不声称完成该版本浏览器实测。
- **0.1.7-alpha.1 适配（v0.8.0）**：`settings.get(ns)` 已从 `@deepseek-ai/dsh-settings` 移除（一个设置命名空间现在是 profile 条目自身的 `Config`）。`lib/index.js` 的读取改经 `settings.describe()`——一次调用同时给出该条目的 `value` 与 `revision`，因此原先按 `settings/document-updated` 事件缓存 revision 的表已删除，栅栏不再可能回放过期值。写入路径 `settings.mutate(ns, ops, revision)` 未变。
- 客户端原子图标改名（同一版本）：`IconChevronDownOutline14/16` → `…OutlineMedium` / `…OutlineRegular`，`IconThinkOutline16` → `IconThinkOutlineRegular/Medium`。`lib/client.js` 现按新名优先、旧名兜底解析，因此一个 bundle 在改名前后都能取到图标，而不是静默渲染成空。
- 历史 `0.1.5-rc.1` 槽位/原子实测仅作历史依据。本次未改槽位注册：仍使用 keyed `settings.models.provider-card`、key `llm-pi-ai`、`provider.provider` 路由 id；客户端仍是 lazy-CJS factory，设置经 Host `settings.mutate` revision 防冲突通路。
- 安装版四个 `*_COMPAT_GATE`、`PiAiCompatProfile`、`compatProfile`（Schemastery，不是 Zod）已逐项对照：**26 个 offer = 24 个可编辑控件 + 2 个未渲染字典；13 个 withhold 不提供编辑**。升级后必须重新跑 parity 并审计。

### compat 提供与保留范围

以下均为提供方级 `providers.<route>.compat` 字段；模型级 compat 只保留，不在此编辑。路由级字段只作用于接受它的协议；“提供控件”不等于每个协议都会发送该字段。

| 分类 | 字段 / 值 |
|---|---|
| 19 个布尔 | `supportsStore`, `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsUsageInStreaming`, `supportsFinishReason`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages`, `supportsThinkingTokenBudget`, `supportsStrictMode`, `supportsLongCacheRetention`, `supportsMaxOutputTokens`, `supportsEagerToolInputStreaming`, `supportsCacheControlOnTools`, `supportsTemperature`, `forceAdaptiveThinking`, `allowEmptySignature`, `supportsStrictTools` |
| 输出上限字段 | `maxTokensField`: `max_completion_tokens` / `max_tokens` |
| 思考格式 | `thinkingFormat`: `openai`, `deepseek`, `openrouter`, `together`, `baseten`, `zai`, `qwen`, `chat-template`, `qwen-chat-template`, `string-thinking`, `ant-ling` |
| 思考预算字段 | `thinkingTokenBudgetField`: `thinking_token_budget` / `thinking_budget` / `thinking_budget_tokens` |
| 缓存格式 | `cacheControlFormat`: `anthropic` |
| 调度优先级 | `vllmPriority`: 可 0 / 负，留空清除；本插件编辑范围 `[-2147483648, 2147483647]`，这是防误输限制，不是上游 schema 上限（上游仅要求整数） |
| offer 但不渲染 | `chatTemplateArgs`, `chatTemplateKwargs`：上游接受字典，本卡片无字典编辑器；已有值在合并时保留，并显示字段名 |
| withhold（pi-ai 按厂商目录决定） | `allowedFallbackModels`, `deferredToolsMode`, `openRouterRouting`, `sendSessionAffinityHeaders`, `sessionAffinityFormat`, `supportsAdditionalTools`, `supportsExplicitPromptCacheMode`, `supportsMidConvoEffort`, `supportsOpenAIGrammarTools`, `supportsToolReferences`, `supportsToolSearch`, `vercelGatewayRouting`, `zaiToolStream` |

- **不设置**明确删除该键；**保持原样（KEEP）**不修改该键。Host 保留渲染键的存在性与原始值，客户端不会把未知枚举/错误类型当作缺失而发 `unset`。布尔/枚举选中 KEEP；无法表示的存储整数显示保持提示，可明确清除或输入新值。
- 未渲染字典、withhold、未知键在 Host 合并候选中保留，不因无关开关编辑被插件丢弃。**这不绕过上游校验**：当前 pi-ai 会拒绝 withheld/未知/非法值；保存仍可能整体失败，错误原文显示，不伪报成功。超出本卡片范围的存储整数本身不阻塞 UI 的无关编辑。
- `supportsThinkingTokenBudget` 是 `thinkingTokenBudgetField: thinking_token_budget` 的别名，显式字段优先。`supportsMaxOutputTokens` 控制 OpenAI Responses 的 `max_output_tokens`；Azure/Codex 虽共用该 compat 类型但忽略此字段。

## 性能设计

- **revision 缓存**：GET 视图的防冲突 revision 不再每请求 `describe()` 计算
  （该调用会克隆每个命名空间并序列化其 schema，Models 页按提供方数量放大）；
  改为激活时 `describe()` 播种一次 + 订阅 `settings/document-updated` 增量更新。
  写冲突（409）时主动失效缓存，下一次读重新播种，不会陷入陈旧围栏循环。
- **写入单次往返**：POST 成功后直接返回提交后的视图，浏览器半边就地更新
  （不再二次 GET，也没有「加载中」闪断）。
- **前端 SWR**：每个提供方的视图在客户端缓存，卡片重挂载先画缓存再后台
  静默校验（失败才报错），避免来回切设置页时的空白与闪烁。

## 卸载 / 停用

```sh
dsh plugin --profile web remove dsh-model-capabilities
# 或仅禁用行：在 profiles/web/cordis.patch.yml 按 id 覆盖
# - id: model-capabilities
#   name: 'dsh-model-capabilities'
#   disabled: true
```

## 开发

```text
lib/index.js     Host 面（最小）
lib/client.js    Web 客户端（window.__ModuleLoader__ 懒加载 CJS factory 产物）
cordis.patch.yml Bundle patch（挂载行）
```

- Host 面无构建步骤（提交即产物）。
- 客户端按 DSH web 客户端模块系统的 factory 契约手写生成：`window.__ModuleLoader__.load({ id, factory })`；`require('react')` / `require('@deepseek-ai/dsh-client-ui-primitives')` 在浏览器端由模块系统解析。
- 本地检查（Node 内置测试，无新增依赖）：

```sh
npm run check
npm test
# 指向待核对的已安装 @deepseek-ai/dsh-llm-pi-ai 包目录：
DSH_PI_AI_PATH=/path/to/dsh-llm-pi-ai npm test
DSH_PI_AI_PATH=/path/to/dsh-llm-pi-ai npm run test:parity
```

- `npm test` 在未找到安装包时显式 skip 上游 parity（Host/client parity 与回归仍运行）；`test:parity` 找不到包会失败，供维护/CI 强制核对。测试只读安装包，不启动适配器或写设置。
- 测试执行实际 Host GET/POST handler、JSON 传输、客户端 snapshot/缓存/patch、组件事件与 KEEP Menu 选中值；外部 React/原子/HTTP/settings 使用内存替身，不是完整浏览器或真实设置服务集成测试。覆盖明确清除、未知/不可表示值、隐藏字段保留、整数边界、conflict 与校验拒绝。
- 发布/激活是独立步骤：同步 Host 与 client 产物后按目标运行时加载方式重启或重载 profile，并验证实际 GUI。不要把本地 Node 通过当作已部署或 HMR 已更新。

## License

MIT
