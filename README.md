# dsh-model-capabilities

> 模型能力 —— 在 **Models 设置页原生卡片内** 为自定义 `llm-pi-ai` 模型配置：
> 思考强度档位（reasoningEfforts）、提供方默认思考强度（reasoning）、
> 支持模态（input / defaultInput）、网关兼容开关（compat）。
> 全部经官方 `settings.mutate` 写入 `settings.yaml`，**无需手改配置**。

A DeepSeek Harness (DSH) web plugin — Host + Web UI track.

- 挂载点：官方扩展位 `settings.models.provider-card`（keyed by `llm-pi-ai`），
  即 Models 设置页每张 pi-ai 提供方卡片内的适配器扩展区。
- 数据属主：`llm-pi-ai` 设置节（pi-ai 适配器）。浏览器面通过官方设置通路
  `ctx.remote.settings.describe() / mutate()` 读写 —— 与官方 Models 页同一套 API，
  带 revision 防冲突，且每次写入都经 pi-ai config schema 校验
  （`assertServiceable`：非法的协议/档位组合会在写入处就被拒绝）。
- Host 面有意保持最小（仅挂载行；无自有持久数据）。

## 字段对照

| UI 控件 | 写入 settings.yaml |
|---|---|
| 模型 · 模态（继承 / 仅文本 / 文本+图像） | `providers.<route>.models[i].input` |
| 模型 · 思考强度（未设置 / 禁用 / 标准档位 / 自定义） | `models[i].reasoningEfforts`（`false` / 档位字典；`off` 可留空=不发送） |
| 提供方 · 默认思考强度 | `providers.<route>.reasoning` |
| 提供方 · 默认模态 | `providers.<route>.defaultInput` |
| 兼容设置：developer 角色 / reasoning_effort / 输出上限字段 / 思考格式 | `providers.<route>.compat.{supportsDeveloperRole,supportsReasoningEffort,maxTokensField,thinkingFormat}` |

## 安装

```sh
# 本地开发安装（从仓库根目录；保持目录在位）
dsh plugin --profile web add ./

# 或安装 GitHub 固定提交
dsh plugin --profile web add github:<owner>/dsh-model-capabilities#<40位commit>

# 验证组合与行解析
dsh --profile web --dump-config
dsh --profile web
```

安装后**重启 web profile**（Settings → 重启 或 `dsh --profile web`）生效。

## 使用

1. Settings → Models：添加/编辑一个自定义（llm-pi-ai）提供方，保存后卡片内出现「模型能力」卡片。
2. 展开每个模型行：选择模态与思考强度；需要非标准线上拼写时选「自定义」逐档填写（如 `max → ultra`）。
3. 点火失败（网关 400）时，在「兼容设置」里按上游文档修正，例如
   `developer 角色: 不支持（用 system）`、`maxTokensField: max_tokens`。
4. 点「应用能力配置」→ 写入成功显示绿色提示；冲突/校验拒绝会显示原因。

## 配置

无：所有行为取现设置节；在 profile 的 `cordis.patch.yml` 中可按 id
`model-capabilities` 覆盖行 config（默认无配置项）。

## 兼容性

- 目标 DSH：`0.1.2-alpha.4`（web profile，`@deepseek-ai/dsh` npm 部署）。
- 依赖客户端运行时与官方 `settings.models.provider-card` 槽位（0.1.x 系列）；
  若上游改列槽位协议，需按新契约调整注册。

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
