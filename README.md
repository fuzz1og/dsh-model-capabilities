# dsh-model-capabilities

> 模型能力 —— 在 **Models 设置页原生卡片内** 为自定义 `llm-pi-ai` 模型配置：
> 思考强度档位（reasoningEfforts）、提供方默认思考强度（reasoning）、
> 支持模态（input / defaultInput）、网关兼容开关（compat）、
> 静态自定义请求头（headers，按需手动添加，值原样发送——例如固定的
> `x-opencode-session`）。全部配置经官方 `settings.mutate` 写入
> `settings.yaml`，**无需手改配置**。

A DeepSeek Harness (DSH) web plugin — Host + Web UI track.

- 挂载点：官方扩展位 `settings.models.provider-card`（keyed by `llm-pi-ai`），
  即 Models 设置页每张 pi-ai 提供方卡片内的适配器扩展区。
- 数据属主：`llm-pi-ai` 设置节（pi-ai 适配器）。浏览器面通过官方设置通路
  Host 同源 HTTP 桥（GET/POST `/model-capabilities`）经 `ctx.settings` 读写 —— 与官方
  同一套 revision 防冲突 + pi-ai config schema 校验
  （`assertServiceable`：非法的协议/档位组合会在写入处就被拒绝）。
- Host 面仅提供同源 HTTP 桥；无自有持久数据（`llm-pi-ai` 命名空间属主是 pi-ai 适配器）。

## 字段对照

| UI 控件 | 写入 settings.yaml |
|---|---|
| 模型 · 模态（继承 / 仅文本 / 文本+图像） | `providers.<route>.models[i].input` |
| 模型 · 思考强度（未设置 / 禁用 / 标准档位 / 自定义） | `models[i].reasoningEfforts`（`false` / 档位字典；`off` 可留空=不发送） |
| 提供方 · 默认思考强度 | `providers.<route>.reasoning` |
| 提供方 · 默认模态 | `providers.<route>.defaultInput` |
| 提供方 · 请求头（按需手动添加） | `providers.<route>.headers`（名称统一小写，值原样发送；`user-agent` 由 DSH 归属头占用，不可设置） |
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

- **目标 DSH：`0.1.5-rc.1`**（本机实测运行版本）。经源码与实时 Inspect 核对：
  - `settings.models.provider-card` 槽位仍为 keyed，key = 设置命名空间
    （`llm-pi-ai`）；owner props 为 `{ provider: ProviderDirectoryEntry,
    configured, keyConfigured }`，其中 `provider.provider` 仍是路由 id
    （本插件读法不变）。
  - 官方原子仍全部可用：`Button / Pill / Input / Menu / DisclosureRow /
    StateDot / IconChevronDownOutline14 / IconThinkOutline16`；shell 的模块表
    继续提供 `@deepseek-ai/dsh-client-ui-primitives` 与 `…-ui-slots`
    （它们已不是可安装包，因此不再写进 `dsh.client.inject`）；shell 使用
    React 18.3.1，`peerDependencies.react ^18.2.0` 仍准确。
  - 主题令牌：`--dsw-alias-label-{primary,secondary,tertiary}`、
    `--dsw-alias-border-l2`、`--dsw-alias-state-{error,success}-primary`、
    `--ds-font-family-code` 均存在（tertiary 与官方 muted 文本用法一致）。
  - `llm-pi-ai` 设置节 schema 未变：`providers.<route>.headers`
    （`z.dict(z.string())` + `assertValidHeaders` Fetch 校验）经
    `requestHeaders(profile.headers)` 最后合并；`user-agent` 为保留头。
  - settings 服务通路未变：`get(ns)` / `mutate(ns, ops, expectedRevision)`；
    新增（0.1.5 起）`settings/document-updated(ns, revision)` 事件——本插件
    用它维护 revision 缓存，避免每次请求都调 `describe()`。
- 依赖客户端运行时与官方 `settings.models.provider-card` 槽位（0.1.x 系列）；
  若上游改列槽位协议，需按新契约调整注册。

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
- 修改后只需替换 `lib/client.js` 并重启 profile。

## License

MIT
