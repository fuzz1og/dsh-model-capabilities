# dsh-model-capabilities

> 模型能力 —— 在 **Settings → 模型能力** 独立设置页里为 `llm-pi-ai` 提供方配置：
> 逐模型**思考强度档位**（`reasoningEfforts`）与提供方级**一键「标准档位」**、
> 提供方默认思考强度（`reasoning`）、静态自定义请求头（`headers`，按需手动添加，
> 值原样发送——例如固定的 `x-opencode-session`）、网关兼容开关（`compat`）。
> 全部配置经官方 `settings.mutate` 写入 `cordis.patch.yml`（profile 的 patch
> 文档），**无需手改配置**。

A DeepSeek Harness (DSH) web plugin — Host + Web UI track.

- 挂载点：官方扩展位 `settings.section`（`id: model-capabilities`，`order: 16`），
  即 Settings 侧栏里 Models 之后的一整页。**0.11.0 起不再占用
  `settings.models.provider-card`**。
- 数据属主：`llm-pi-ai` 设置节（pi-ai 适配器）。浏览器面通过官方设置通路
  Host 同源 HTTP 桥（GET/POST `/model-capabilities`）经 `ctx.settings` 读写 —— 与官方
  同一套 revision 防冲突 + pi-ai config schema 校验
  （`assertServiceable`：非法的协议/档位组合会在写入处就被拒绝）。
- Host 面仅提供同源 HTTP 桥；无自有持久数据（`llm-pi-ai` 命名空间属主是 pi-ai 适配器）。

## 0.12.0 变更（面向 0.11.0 用户）

1. **不再编辑支持模态**。`models[].input` 与 `providers.<route>.defaultInput`
   现在由官方 Models 页的「输入类型」（Text / Image 勾选）拥有，插件里那份逐模型
   「模态」与提供方「默认模态」已删除 —— 同一字段两个入口只会互相漂移。
   插件既不读也不写这两个字段，其余模型字段原样保留。
2. **「标准档位」提升到提供方级**。提供方名字右侧现在有一个「标准档位」按钮：
   一次点击把该提供方**全部模型**的思考强度写成标准档位并立即保存
   （未设置 / 禁用 / 自定义都会被覆盖，因为按钮承诺的是"整个提供方"）。
   逐模型仍可选 未设置 / 禁用 / 标准档位 / 自定义。
3. **标准档位定义统一**。自动注入的档位（0.9.0 的 `off/low/high/max`）与
   逐模型「标准档位」预设（`off/low/medium/high/max`）此前不一致：同一个标签
   在两处代表不同的档位集合，且注入过的模型会被显示成「自定义」。
   现在两者是**同一个常量** `STANDARD_REASONING_EFFORTS`，档位为
   `off / low / medium / high / max`（`off` = 支持但不发送参数）。
4. **UI 按 DSH 0.2.0 的设计语言重做**：官方 `Tag` / `SegmentedControl` 原子、
   settings-card 填充/描边令牌、12/18 字段标签 + 32px 控件、11/17 说明文字、
   官方 8/12/16/20/28 圆角与 24px disclosure 行。

## 标准档位（标准档位 = 一个 `reasoningEfforts` 字典）

pi-ai **没有**「档位」这个概念：`reasoningEfforts` 是逐模型的字典，键是"提供的档位"，
值是 dispatch 真正发到线上的写法（缺失的键被钉为 `null`，即"不提供"）。所以「标准档位」
在本插件里就是被展开成这样的一个字典，写入 `cordis.patch.yml`：

```yaml
reasoningEfforts:
  off:          # 支持，但不发送任何参数
  low: low
  medium: medium
  high: high
  max: max
```

刻意**只声明这五档**：键集就是档位集，少写 `minimal`/`xhigh` 就不会把网关可能不认识的
拼写塞进选择器。

两个入口写的是同一个常量：

- **提供方名字旁的「标准档位」按钮（0.12.0）**：把该提供方 `models` 里**每个模型**
  的 `reasoningEfforts` 写成标准档位，并在**同一次点击**里提交（与「应用能力配置」
  同一条 `apply()` 通路，revision 栅栏 + pi-ai 校验一致，编辑器里其他已改字段一并保存，
  不会静默丢弃草稿）。仅对**存有 `models` 清单的路由**提供；内置目录（catalog）路由
  没有可写的清单，按钮不出现，页面会说明原因。
- **逐模型「思考强度」下拉**：未设置 / 禁用 / 标准档位 / 自定义（自定义可逐档填线上
  拼写，例如 `max → ultra`）。

## 思考档位自动注入（0.9.0，无需操作）

**官方缺口**：dsh 给 `contextWindow`、`maxTokens`、`input` 都留了路由级兜底
（`entry.x ?? base?.x ?? request.defaultX`），**唯独 `reasoningEfforts` 没有第三级** ——
省略时走 `base?.reasoning ?? false`。于是官方 Models 页新建的**自定义路由**
（不在内置 catalog 的路由内）只提供 `off` 一档，而官方编辑器又**不渲染**思考强度控件
（0.2.0 的 `ui-settings-models` 明确把 reasoning effort 留给模型本身，不提供
提供方级控件）。结果就是「上下文能改、模态能改、思考强度改不了」。

**本插件补上这一级**：为**缺少 `reasoningEfforts` 的自定义路由**模型自动写入
标准档位（见上）。

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
| 提供方 · 标准档位（一键，全部模型） | `providers.<route>.models[i].reasoningEfforts`（每个模型写标准档位字典） |
| 模型 · 思考强度（未设置 / 禁用 / 标准档位 / 自定义） | `models[i].reasoningEfforts`（`false` / 档位字典；`off` 可留空=不发送） |
| 提供方 · 默认思考强度 | `providers.<route>.reasoning` |
| 提供方 · 请求头（按需手动添加） | `providers.<route>.headers`（名称统一小写，值原样发送；`user-agent` 由 DSH 归属头占用，不可设置） |
| 提供方 · 兼容设置（19 布尔 / 4 枚举 / 1 整数；详见兼容性） | `providers.<route>.compat`（逐键合并） |
| 支持模态（只读提示） | **不在本页编辑**：官方 Models 页「输入类型」写 `models[i].input` / `providers.<route>.defaultInput` |

## 安装

```sh
# GitHub 固定提交（推荐；先到 Releases/Tags 拿 40 位 commit，或直接用 tag）
dsh plugin --profile web add github:fuzz1og/dsh-model-capabilities#<40位commit>
# 例（tag 对应的提交同样可用 40 位 sha）：
#   dsh plugin --profile web add github:fuzz1og/dsh-model-capabilities#$(git ls-remote https://github.com/fuzz1og/dsh-model-capabilities.git refs/tags/v0.12.0 | cut -c1-40)

# 本地开发安装（从仓库根目录；保持目录在位）
dsh plugin --profile web add ./

# 验证组合与行解析
dsh --profile web --dump-config
dsh --profile web
```

安装后**重启 web profile**（Settings → 重启 或 `dsh --profile web`）生效。
桥走软依赖（`ctx.inject(['webServer'], …)`）：装在 headless / tui 等没有 web
服务的 profile 里也不会阻塞启动，只是该 profile 不提供这一设置页。

## 使用

1. Settings → **模型能力**：左列列出全部 llm-pi-ai 提供方（名称、`自定义`/`目录` 标记、
   模型清单、已全为标准档位时的提示，默认只显示**已配置**的路由，右上角
   `已配置 N / 全部 M` 可切换）。官方 Models 页仍用来添加/编辑提供方本身
   （地址、密钥、模型清单、输入类型）。
2. **一键标准档位**：点提供方名字右侧的「标准档位」——该提供方全部模型的思考强度
   立刻写成标准档位并保存；右侧会显示 `标准档位 3/4` 或 `全部 4 个模型已是标准档位`。
3. 需要个别模型不同档位：展开该模型行，选 未设置 / 禁用 / 标准档位 / 自定义
   （自定义可逐档填线上拼写，如 `max → ultra`）。
4. 需要自定义请求头（如 opencode Go 要求的 `x-opencode-session`）：展开「请求头」
   →「添加请求头」，名称与值逐行填写（固定值，原样发送），点「应用能力配置」。
5. 点火失败（网关 400）时，在「兼容设置」里按上游文档修正，例如
   `developer 角色: 不支持（用 system）`、`maxTokensField: max_tokens`。
6. 点「应用能力配置」→ 写入成功显示绿色提示；冲突/校验拒绝会显示原因（冲突后视图自动刷新，可直接重试）。

## opencode Go 的 x-opencode-session（固定头即可）

[opencode 官方文档](https://opencode.ai/docs/go/) 对 Go 套餐的使用方有三条要求：
不产生滥用流量、**正确标识自身（不用泛化 User-Agent）**、**携带 `x-opencode-session` 头**
（网关按会话做亲和路由并优化 prompt caching），否则**账号可能被标记**。

本插件的对应关系：

- **身份要求已由 DSH 满足**：`dsh-llm` 的归属头机制对每个提供方请求发送
  `user-agent: deepseek-harness/<版本> (+https://github.com/deepseek-ai/deepseek-harness)`，
  且 `user-agent` 列为保留头——用户配置不能覆盖它，也不需要伪装 opencode 客户端。
- **会话头用固定值即可**：在本页「请求头」区自建 `x-opencode-session` 行并填一个
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

- **当前适配目标：DSH `0.2.0-rc.2` / `@deepseek-ai/dsh-llm-pi-ai 0.2.0-rc.2`**
  （2026-09 复核，针对**已安装**的 desktop 组合：直接读取 Electron `app.asar` 内
  `dsh/node_modules/@deepseek-ai/*` 的真实产物逐项比对，不是对照源码快照）。
- 复核结论（0.1.7-alpha.1 → 0.2.0-rc.2）：
  - `settings.describe()` / `settings.mutate(ns, ops, revision)` / `settings/document-updated`
    仍在（`@deepseek-ai/dsh-settings` 0.2.0-rc.2 未变），Host 桥的读写与栅栏无需改动。
  - `ctx.llm.listConfigurableProviders()` 仍是目录来源，0.2.0 起条目多带
    `settingsNs` / `settingsPath` / `error`；本插件只读 `provider` / `displayName` /
    `declared`，因此不受影响。
  - `settings.section` 槽位契约未变（`kind: list`、scope root、注册项
    `{ id, order, label }`、owner props `{ close }`）；0.2.0-rc.2 就地占位为
    account(-10) / general(0) / models(10) / plugins(15) / agent-presets(20) /
    xmanrui-dsh-im(21)，本插件 `order: 16` 夹在 plugins 与 agent-presets 之间。
  - **compat 面重审**：`COMPAT_GATES`（0.2.0-rc.2 起在运行时的
    `lib/index.js`，不再随包提供 `lib/types/catalog.d.ts`）仍为 **26 offer / 14 withhold**。
    26 offer 与 0.1.7 完全一致（24 个可编辑控件 + 2 个未渲染字典）；withhold 由 13 变 14：
    新增 `supportsMidConvoSystemMessages` / `supportsMidConvoToolAdditions` /
    `supportsMidConvoToolChanges`，而 `deferredToolsMode` / `supportsToolReferences`
    已从所有 gate 中消失（存储了这两个键的 profile 现在被报为 `unknown`，
    与适配器自己的说法一致）。枚举值（`thinkingFormat` 11 项、`maxTokensField` 2 项、
    `thinkingTokenBudgetField` 3 项、`cacheControlFormat` 1 项）与
    七级 `THINKING_LEVELS` 均未变。
  - **官方已接管支持模态**：0.2.0 的 Models 页有逐模型「输入类型」（Text / Image），
    pi-ai 侧写 `input`，DeepSeek 侧写 `inputModalities`；因此本插件 0.12.0 删除了
    这项编辑（见上）。
- 验证方式与边界：`npm test`（92 项，含 Host 桥 revision 栅栏、客户端渲染/事件/保存、
  KEEP 语义、整数边界、标准档位注入与一键展开、Host↔client 常量一致性）全部通过；
  `DSH_PI_AI_PATH=<installed dsh-llm-pi-ai> npm run test:parity` 对本机已安装的
  0.2.0-rc.2 产物核对 offer/withhold、`compatProfile` 键集、枚举值与思考档位后通过。
  **未做**：本次没有重启 profile、没有对 live settings 写入、没有在浏览器里点过界面，
  因此不声称完成该版本的浏览器实测。
- 客户端原子图标改名（0.1.7-alpha.1）：`IconChevronDownOutline14/16` →
  `…OutlineMedium` / `…OutlineRegular`，`IconThinkOutline16` → `IconThinkOutlineRegular/Medium`。
  `lib/client.js` 按新名优先、旧名兜底解析，因此一个 bundle 在改名前后都能取到图标。
  0.12.0 新增的 `Tag` / `SegmentedControl` 同样先确认安装包里存在，并各自带降级实现
  （缺失时回退到 `Pill`），因为**组件**缺失会直接抛错，不像图标只是渲染成空。

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
| offer 但不渲染 | `chatTemplateArgs`, `chatTemplateKwargs`：上游接受字典，本页无字典编辑器；已有值在合并时保留，并显示字段名 |
| withhold（pi-ai 按厂商目录决定，0.2.0-rc.2 共 14 项） | `allowedFallbackModels`, `openRouterRouting`, `sendSessionAffinityHeaders`, `sessionAffinityFormat`, `supportsAdditionalTools`, `supportsExplicitPromptCacheMode`, `supportsMidConvoEffort`, `supportsMidConvoSystemMessages`, `supportsMidConvoToolAdditions`, `supportsMidConvoToolChanges`, `supportsOpenAIGrammarTools`, `supportsToolSearch`, `vercelGatewayRouting`, `zaiToolStream` |

- **不设置**明确删除该键；**保持原样（KEEP）**不修改该键。Host 保留渲染键的存在性与原始值，客户端不会把未知枚举/错误类型当作缺失而发 `unset`。布尔/枚举选中 KEEP；无法表示的存储整数显示保持提示，可明确清除或输入新值。
- 未渲染字典、withhold、未知键在 Host 合并候选中保留，不因无关开关编辑被插件丢弃。**这不绕过上游校验**：当前 pi-ai 会拒绝 withheld/未知/非法值；保存仍可能整体失败，错误原文显示，不伪报成功。超出本页范围的存储整数本身不阻塞 UI 的无关编辑。
- `supportsThinkingTokenBudget` 是 `thinkingTokenBudgetField: thinking_token_budget` 的别名，显式字段优先。`supportsMaxOutputTokens` 控制 OpenAI Responses 的 `max_output_tokens`；Azure/Codex 虽共用该 compat 类型但忽略此字段。

## 性能设计

- **revision 缓存**：GET 视图的防冲突 revision 不再每请求 `describe()` 计算
  （该调用会克隆每个命名空间并序列化其 schema，Models 页按提供方数量放大）；
  改为激活时 `describe()` 播种一次 + 订阅 `settings/document-updated` 增量更新。
  写冲突（409）时主动失效缓存，下一次读重新播种，不会陷入陈旧围栏循环。
- **写入单次往返**：POST 成功后直接返回提交后的视图，浏览器半边就地更新
  （不再二次 GET，也没有「加载中」闪断）。
- **前端 SWR**：每个提供方的视图在客户端缓存，编辑器重挂载先画缓存再后台
  静默校验（失败才报错），避免来回切设置页时的空白与闪烁。
- **一键标准档位同样只走一次 POST**：展开后的档位随该请求的 `models` 数组一起提交，
  没有额外往返。

## 权限与清理

- 浏览器面只发同源 `fetch` 到 `/model-capabilities`（`credentials: 'same-origin'`）；
  Host 面只经 `ctx.settings` 读写 `llm-pi-ai`，不落任何自有文件或存储。
- 组件卸载时插件移除自己的 `<style data-plugin-css>` 与槽位注册；`ctx.effect` 负责
  解除 `settings/document-updated` 订阅。

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
lib/index.js     Host 面（桥 + 标准档位注入；无构建步骤）
lib/client.js    Web 客户端（window.__ModuleLoader__ 懒加载 CJS factory 产物）
cordis.patch.yml Bundle patch（挂载行）
```

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
- parity 会同时支持两种安装形态：老包里的 `lib/types/catalog.d.ts` 声明文件，以及
  0.2.0+ 只有运行时 `lib/index.js`（`COMPAT_GATES` 表）的形态——已安装的包没有
  `types/` 目录。
- 测试执行实际 Host GET/POST handler、JSON 传输、客户端 snapshot/缓存/patch、组件事件与 KEEP Menu 选中值；外部 React/原子/HTTP/settings 使用内存替身，不是完整浏览器或真实设置服务集成测试。覆盖明确清除、未知/不可表示值、隐藏字段保留、整数边界、conflict 与校验拒绝、标准档位注入与一键展开、以及 Host↔client 的档位常量一致性。
- 发布/激活是独立步骤：同步 Host 与 client 产物后按目标运行时加载方式重启或重载 profile，并验证实际 GUI。不要把本地 Node 通过当作已部署或 HMR 已更新。

## License

MIT
