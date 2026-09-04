# dsh-model-capabilities

> 模型能力 —— 在 **Models 设置页原生卡片内** 为自定义 `llm-pi-ai` 模型配置：
> 思考强度档位（reasoningEfforts）、提供方默认思考强度（reasoning）、
> 支持模态（input / defaultInput）、网关兼容开关（compat）、
> 通用请求头（headers，按需手动添加）。
> 另在 wire 层**自动按 DSH 会话注入 `x-opencode-session`**（opencode Go 会话亲和：
> 一个 DSH 会话一个稳定标识，跨轮次不变）。全部配置经官方 `settings.mutate`
> 写入 `settings.yaml`，**无需手改配置**。

A DeepSeek Harness (DSH) web plugin — Host + Web UI track.

- 挂载点：官方扩展位 `settings.models.provider-card`（keyed by `llm-pi-ai`），
  即 Models 设置页每张 pi-ai 提供方卡片内的适配器扩展区。
- 数据属主：`llm-pi-ai` 设置节（pi-ai 适配器）。浏览器面通过官方设置通路
  Host 同源 HTTP 桥（GET/POST `/model-capabilities`）经 `ctx.settings` 读写 —— 与官方
  同一套 revision 防冲突 + pi-ai config schema 校验
  （`assertServiceable`：非法的协议/档位组合会在写入处就被拒绝）。
- Host 面另有 wire 层会话注入（`llm/stream` waterfall + fetch 包装），
  不写入任何持久数据（`llm-pi-ai` 命名空间属主是 pi-ai 适配器）。

## 字段对照

| UI 控件 | 写入 settings.yaml |
|---|---|
| 模型 · 模态（继承 / 仅文本 / 文本+图像） | `providers.<route>.models[i].input` |
| 模型 · 思考强度（未设置 / 禁用 / 标准档位 / 自定义） | `models[i].reasoningEfforts`（`false` / 档位字典；`off` 可留空=不发送） |
| 提供方 · 默认思考强度 | `providers.<route>.reasoning` |
| 提供方 · 默认模态 | `providers.<route>.defaultInput` |
| 提供方 · 请求头（按需手动添加） | `providers.<route>.headers`（名称统一小写；`user-agent` 由 DSH 归属头占用，不可设置） |
| 兼容设置：developer 角色 / reasoning_effort / 输出上限字段 / 思考格式 | `providers.<route>.compat.{supportsDeveloperRole,supportsReasoningEffort,maxTokensField,thinkingFormat}` |

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

## 使用

1. Settings → Models：添加/编辑一个自定义（llm-pi-ai）提供方，保存后卡片内出现「模型能力」卡片。
2. 展开每个模型行：选择模态与思考强度；需要非标准线上拼写时选「自定义」逐档填写（如 `max → ultra`）。
3. 需要自定义请求头时，展开「请求头」→「添加请求头」逐行填写（如网关要求的鉴权/路由头），
   点「应用能力配置」。opencode Go 的 `x-opencode-session` **无需手动添加**——见下节的自动按会话注入。
4. 点火失败（网关 400）时，在「兼容设置」里按上游文档修正，例如
   `developer 角色: 不支持（用 system）`、`maxTokensField: max_tokens`。
5. 点「应用能力配置」→ 写入成功显示绿色提示；冲突/校验拒绝会显示原因（冲突后视图自动刷新，可直接重试）。

## opencode Go 会话亲和（x-opencode-session，每 DSH 会话一个）

[opencode 官方文档](https://opencode.ai/docs/go/) 对 Go 套餐的使用方有三条要求：
不产生滥用流量、**正确标识自身（不用泛化 User-Agent）**、**携带 `x-opencode-session` 头**
（网关按会话做亲和路由并优化 prompt caching），否则**账号可能被标记**。

本插件的对应关系：

- **身份要求已由 DSH 满足**：`dsh-llm` 的归属头机制对每个提供方请求发送
  `user-agent: deepseek-harness/<版本> (+https://github.com/deepseek-ai/deepseek-harness)`，
  且 `user-agent` 列为保留头——用户配置不能覆盖它，也不需要伪装 opencode 客户端。
- **会话亲和自动完成，且粒度是「一个 DSH 会话一个标识」**：
  - Host 面监听 `llm/stream` waterfall，读取每流请求自带的 `sessionId`
    （dsh-agent-loop 注入的 DSH 会话 id）；
  - 提供方 `baseURL` 的 host 命中亲和名单（默认 `opencode.ai`，含子域）时，
    一个 `globalThis.fetch` 包装把 `x-opencode-session: dsh-<12位摘要>` 盖到
    该流出站请求上——令牌为会话 id 的 SHA-256 域分隔摘要，**同一会话跨轮次稳定、
    不同会话互不相同、不可逆推**；
  - 三条协议路线（openai-completions / openai-responses / anthropic-messages）都走
    同一 wire，全部生效；仅会话内流式调用被标记，网页检索等其它出站请求不受影响。
- **与手动请求头的关系**：卡片「请求头」区是通用编辑器，按需手动添加任意头
  （含 `x-opencode-session` 固定值——pi-ai schema 原生 `providers.<route>.headers`，
  Fetch 合法性校验）。手动同名头在**非会话流**（如模型目录拉取）仍然发出；
  会话流中会被 wire 层的会话注入覆盖（会话注入总是更优）。
- **与同类插件的关系**：与 dsh.pub 上 `dsh-opencode-session-id` 类 wire 层注入插件
  功能重叠；同时安装时后安装的 fetch 包装在外层生效（会互相覆盖同名头）。

## 配置

默认零配置。在 profile 的 `cordis.patch.yml` 中可按 id `model-capabilities`
覆盖行 config（覆盖为**整值替换**，非深合并）：

```yaml
- id: model-capabilities
  name: 'dsh-model-capabilities'
  config:
    hosts: ['opencode.ai', 'my-mirror.example']   # 追加会话注入的 host 后缀（默认已含 opencode.ai）
    disableSessionAffinity: true                   # 关闭 wire 层会话注入（仅保留手动请求头）
```

## 兼容性

- 目标 DSH：`0.1.2-rc.1`（实测运行中）；`0.1.3-alpha.1` 经源码级核对：
  `settings.models.provider-card` 槽位契约、`llm-pi-ai` 设置节 schema、
  settings 服务通路均无变更（仅 discovery 增强，与本插件互补不重叠）。
- `providers.<route>.headers` 字段在 `0.1.2-rc.1` 的 pi-ai schema 中源码级核实
  （`z.dict(z.string())` + `assertValidHeaders` Fetch 合法性校验；经
  `requestHeaders(profile.headers)` 最后合并，`user-agent` 为保留头）。
- 会话注入链路在 `0.1.2-rc.1` 源码级核实：agent loop 请求带 `sessionId` →
  `LlmRuntime.stream` 经 `llm/stream` waterfall（入参冻结只读）→ pi-ai 适配器
  以 `requestHeaders(profile.headers)` 自建头（waterfall 无法注入头，故取
  fetch 包装方案）；已用本地 mock 网关（`hosts` 配置指向 127.0.0.1）实测：
  不同会话令牌不同、同会话跨轮次相同。
- 依赖客户端运行时与官方 `settings.models.provider-card` 槽位（0.1.x 系列）；
  若上游改列槽位协议，需按新契约调整注册。
- UI 基于官方 `@deepseek-ai/dsh-client-ui-primitives`（Button / Pill / Input /
  Menu / DisclosureRow / StateDot）与 `--dsw-*` 令牌，浅色/深色自动跟随应用主题。

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
- 修改后只需替换 `lib/client.js` 并重启 profile。

## License

MIT
