/*!
 * dsh-model-capabilities — client half.
 *
 * Lazy-CJS factory bundle served by the DSH web client module system.
 * Registers one extension cell into the official Models settings card seat
 * (`settings.models.provider-card`, keyed by the `llm-pi-ai` settings
 * namespace), giving every pi-ai provider card:
 *
 *   - per model: accepted modalities (input) and thinking-intensity tiers
 *     (reasoningEfforts: unset / false / standard preset / custom wire values)
 *   - provider level: default reasoning effort, default modalities,
 *     gateway compat switches (supportsDeveloperRole, supportsReasoningEffort,
 *     maxTokensField, thinkingFormat)
 *
 * Data owner: the pi-ai adapter's `llm-pi-ai` settings namespace. Reads go
 * through ctx.remote.settings.describe(); writes through
 * ctx.remote.settings.mutate() with the revision the view reported — the same
 * official path the Models page uses — so conflicts are refused and every
 * write is validated by the pi-ai config schema (assertServiceable) before it
 * reaches settings.yaml.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-capabilities',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const e = React.createElement;

    const CSS = [
      '.mcp-card{--mcp-border:var(--dsw-alias-border-l2,rgba(127,127,127,.45));--mcp-soft:var(--dsw-alias-border-l1,rgba(127,127,127,.28));--mcp-bg:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));--mcp-text:var(--dsw-alias-label-primary,#2b2b2b);--mcp-dim:var(--dsw-alias-label-secondary,#6f6f6f);--mcp-err:var(--dsw-alias-state-error-primary,#c9553d);--mcp-ok:var(--dsw-alias-state-success-primary,#1a7f37);margin:12px 0 0;padding:12px 14px;border:1px solid var(--mcp-soft);border-radius:10px;background:var(--mcp-bg);color:var(--mcp-text);font-size:13px;line-height:1.55}',
      '.mcp-card .mcp-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;font-weight:650}',
      '.mcp-card .mcp-route{font-weight:400;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--mcp-dim)}',
      '.mcp-card .mcp-row{display:flex;align-items:center;gap:10px;margin:7px 0;flex-wrap:wrap}',
      '.mcp-card .mcp-label{min-width:96px;font-size:12px;color:var(--mcp-dim)}',
      '.mcp-card .mcp-select,.mcp-card .mcp-input{font:inherit;padding:3px 8px;border-radius:7px;border:1px solid var(--mcp-border);background:var(--dsw-alias-bg-base,transparent);color:var(--mcp-text)}',
      '.mcp-card .mcp-input{width:110px}',
      '.mcp-card .mcp-grid{display:flex;flex-wrap:wrap;gap:8px 16px;padding:8px 0 2px}',
      '.mcp-card .mcp-effort{display:inline-flex;gap:5px;align-items:center}',
      '.mcp-card .mcp-note{font-size:12px;color:var(--mcp-dim)}',
      '.mcp-card .mcp-err{color:var(--mcp-err)}',
      '.mcp-card .mcp-ok{color:var(--mcp-ok)}',
      '.mcp-card .mcp-actions{display:flex;align-items:center;gap:10px;margin-top:10px}',
      '.mcp-card .mcp-mrow{padding:4px 0}',
      '.mcp-card .mcp-mrow-title{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:650}',
      '.mcp-card .mcp-mrow-summary{color:var(--mcp-dim);font-size:12px}',
    ].join('\n');

    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const LEVEL_LABEL = { off: '关', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
    const FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling'];
    const PRESET = { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' };

    function effortsOf(m) {
      const efforts = {};
      for (const level of LEVELS) efforts[level] = { on: false, value: '' };
      if (m.reasoningEfforts === false) return { efforts, kind: 'false' };
      if (m.reasoningEfforts && typeof m.reasoningEfforts === 'object') {
        let preset = true;
        for (const level of LEVELS) {
          const value = m.reasoningEfforts[level];
          if (value === undefined) continue;
          efforts[level] = { on: true, value: value === null ? '' : String(value) };
          if (!(level in PRESET) || String(PRESET[level] ?? '') !== String(value ?? '')) preset = false;
        }
        return { efforts, kind: preset ? 'preset' : 'custom' };
      }
      return { efforts, kind: 'unset' };
    }
    function normalizeModel(m) {
      const { efforts, kind } = effortsOf(m);
      return { id: String(m.id ?? ''), input: Array.isArray(m.input) ? m.input.slice() : [], efforts, kind };
    }
    function loadView(revision, profile) {
      const compat = profile.compat ?? {};
      return {
        revision,
        hasModelsList: Array.isArray(profile.models),
        reasoning: typeof profile.reasoning === 'string' ? profile.reasoning : 'unset',
        defaultInput: Array.isArray(profile.defaultInput) ? profile.defaultInput.slice() : [],
        compat: {
          supportsDeveloperRole: typeof compat.supportsDeveloperRole === 'boolean' ? compat.supportsDeveloperRole : 'unset',
          supportsReasoningEffort: typeof compat.supportsReasoningEffort === 'boolean' ? compat.supportsReasoningEffort : 'unset',
          maxTokensField: typeof compat.maxTokensField === 'string' ? compat.maxTokensField : 'unset',
          thinkingFormat: typeof compat.thinkingFormat === 'string' ? compat.thinkingFormat : 'unset',
        },
        models: (Array.isArray(profile.models) ? profile.models : []).map((m) => normalizeModel(m)),
      };
    }
    function effortValid(snapModel) {
      return LEVELS.filter((level) => snapModel.efforts[level].on && level !== 'off').every((level) => snapModel.efforts[level].value.trim() !== '');
    }
    function effortPayload(snapModel) {
      if (snapModel.kind === 'unset') return null;
      if (snapModel.kind === 'false') return false;
      if (snapModel.kind === 'preset') {
        const out = {};
        for (const [level, value] of Object.entries(PRESET)) out[level] = value;
        return out;
      }
      const dict = {};
      for (const level of LEVELS) {
        if (!snapModel.efforts[level].on) continue;
        const value = snapModel.efforts[level].value.trim();
        dict[level] = level === 'off' ? (value === '' ? null : value) : value;
      }
      return dict;
    }
    function effortSummary(model) {
      if (model.kind === 'unset') return '思考: 未设置';
      if (model.kind === 'false') return '思考: 禁用';
      if (model.kind === 'preset') return '思考: 标准档位';
      return '思考: 自定义';
    }
    function modalitySummary(model) {
      if (model.input.includes('image')) return '模态: 文本+图像';
      if (model.input.includes('text')) return '模态: 仅文本';
      return '模态: 继承';
    }

    function ModelCapabilities(props, ctx) {
      const providerId = props?.provider?.provider;
      const [snap, setSnap] = React.useState(undefined);
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState(undefined);
      const [openModels, setOpenModels] = React.useState(() => new Set());
      const [openCompat, setOpenCompat] = React.useState(false);

      const load = async () => {
        if (providerId === undefined) return;
        setSnap(undefined);
        setMessage(undefined);
        try {
          const response = await ctx.remote.settings.describe();
          if (!response || response.ok !== true || !response.value) {
            setMessage(String((response && response.error && response.error.message) || 'load-failed'));
            return;
          }
          const describe = response.value;
          const view = (describe.namespaces || []).find((item) => item.ns === 'llm-pi-ai');
          if (view === undefined) {
            setMessage('llm-pi-ai 设置节不可用');
            return;
          }
          const section = view.value ?? {};
          const profile = (section.providers ?? {})[providerId];
          if (typeof profile !== 'object' || profile === null) {
            setMessage('provider-not-found');
            return;
          }
          setSnap(loadView(Number(view.revision) || 0, profile));
        } catch (error) {
          setMessage(String(error));
        }
      };
      React.useEffect(() => { void load(); }, [providerId]);

      const patchModel = (index, fn) => setSnap((current) => current === undefined ? current : ({ ...current, models: current.models.map((model, at) => at === index ? fn(model) : model) }));
      const setEffortValue = (index, level, value) => patchModel(index, (model) => ({ ...model, efforts: { ...model.efforts, [level]: { ...model.efforts[level], value } } }));
      const toggleEffort = (index, level) => patchModel(index, (model) => ({ ...model, efforts: { ...model.efforts, [level]: { ...model.efforts[level], on: !model.efforts[level].on, value: !model.efforts[level].on && level !== 'off' && model.efforts[level].value === '' ? level : model.efforts[level].value } } }));
      const toggleModel = (index) => setOpenModels((current) => {
        const next = new Set(current);
        if (!next.delete(index)) next.add(index);
        return next;
      });

      const apply = async () => {
        if (snap === undefined) return;
        setBusy(true);
        setMessage(undefined);
        try {
          const byId = new Map(snap.models.map((model) => [model.id, model]));
          const route = ['providers', providerId];
          const nextModels = snap.models.map((model) => {
            const next = { id: model.id };
            if (typeof model.name === 'string') next.name = model.name;
            if (typeof model.contextWindow === 'number') next.contextWindow = model.contextWindow;
            if (typeof model.maxTokens === 'number') next.maxTokens = model.maxTokens;
            const input = model.input.length === 0 ? null : model.input;
            if (input !== null) next.input = input;
            const efforts = effortPayload(model);
            if (efforts !== null) next.reasoningEfforts = efforts;
            return next;
          });
          const ops = [{ op: 'set', path: [...route, 'models'], value: nextModels }];
          if (snap.reasoning === 'unset') ops.push({ op: 'unset', path: [...route, 'reasoning'] });
          else ops.push({ op: 'set', path: [...route, 'reasoning'], value: snap.reasoning });
          if (snap.defaultInput.length === 0) ops.push({ op: 'unset', path: [...route, 'defaultInput'] });
          else ops.push({ op: 'set', path: [...route, 'defaultInput'], value: snap.defaultInput });
          const compat = snap.compat;
          const currentCompat = {};
          for (const key of ['supportsDeveloperRole', 'supportsReasoningEffort']) {
            if (compat[key] === true || compat[key] === false) currentCompat[key] = compat[key];
            else if (compat[key] === 'unset') delete currentCompat[key];
          }
          for (const key of ['maxTokensField', 'thinkingFormat']) {
            if (typeof compat[key] === 'string' && compat[key] !== 'unset') currentCompat[key] = compat[key];
            else if (compat[key] === 'unset') delete currentCompat[key];
          }
          if (Object.keys(currentCompat).length === 0) ops.push({ op: 'unset', path: [...route, 'compat'] });
          else ops.push({ op: 'set', path: [...route, 'compat'], value: currentCompat });
          const response = await ctx.remote.settings.mutate('llm-pi-ai', ops, snap.revision);
          if (response && response.ok === true) {
            setMessage('saved');
            void load();
          } else {
            const code = response && response.error && response.error.code;
            const text = response && response.error ? String(response.error.message ?? '') : '';
            setMessage(code === 'settings/conflict' ? 'conflict' : (text || 'write-failed'));
          }
        } catch (error) {
          setMessage(String(error));
        } finally {
          setBusy(false);
        }
      };

      const Button = primitives.Button;
      const DisclosureRow = primitives.DisclosureRow;
      const IconData = primitives.IconDataOutline16 ?? primitives.IconSettingsOutline16;

      const rows = [];
      if (snap === undefined) {
        rows.push(e('p', { key: 'loading', className: 'mcp-note' }, message === undefined ? '加载中…' : message));
        rows.push(e('div', { key: 'retry', className: 'mcp-actions' }, e(Button, { variant: 'outline', size: 'sm', onClick: () => { void load(); } }, '重试')));
        return e('div', { className: 'mcp-card' }, e('div', { className: 'mcp-head' }, '模型能力'), ...rows);
      }
      const compat = snap.compat;
      rows.push(e('div', { key: 'head', className: 'mcp-head' }, '模型能力', e('span', { className: 'mcp-route' }, providerId)));
      if (!snap.hasModelsList) {
        rows.push(e('p', { key: 'no-models', className: 'mcp-note' }, '该提供方使用内置目录模型，无模型清单可配置。先在官方编辑器中自定义模型目录，再回到这里设置能力。'));
        return e('div', { className: 'mcp-card' }, ...rows);
      }

      rows.push(e('div', { key: 'route-reasoning', className: 'mcp-row' },
        e('span', { className: 'mcp-label' }, '默认思考强度'),
        e('select', { className: 'mcp-select', value: snap.reasoning, onChange: (event) => setSnap((current) => current === undefined ? current : ({ ...current, reasoning: event.target.value })) },
          e('option', { value: 'unset' }, '（未设置）'),
          LEVELS.map((level) => e('option', { value: level, key: level }, `${LEVEL_LABEL[level]} (${level})`)),
        ),
      ));
      rows.push(e('div', { key: 'route-input', className: 'mcp-row' },
        e('span', { className: 'mcp-label' }, '默认模态'),
        e('select', { className: 'mcp-select', value: snap.defaultInput.includes('image') ? 'both' : snap.defaultInput.includes('text') ? 'text' : 'none', onChange: (event) => setSnap((current) => current === undefined ? current : ({ ...current, defaultInput: event.target.value === 'both' ? ['text', 'image'] : event.target.value === 'text' ? ['text'] : [] })) },
          e('option', { value: 'none' }, '（未设置 = 默认文本）'),
          e('option', { value: 'text' }, '仅文本'),
          e('option', { value: 'both' }, '文本 + 图像'),
        ),
      ));
      rows.push(e('div', { key: 'route-compat' },
        e(DisclosureRow, {
          rowClassName: 'mcp-mrow',
          titleClassName: 'mcp-mrow-title',
          chevronClassName: 'mcp-mrow-chev',
          title: '兼容设置 · 网关 400 修复',
          open: openCompat,
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          onToggle: () => setOpenCompat((value) => !value),
          collapsedContent: e('span', { className: 'mcp-mrow-summary' }, 'developer 角色 / reasoning_effort / 输出上限 / 思考格式'),
          children: e('div', null,
            e('div', { className: 'mcp-row' },
              e('span', { className: 'mcp-label' }, 'developer 角色'),
              e('select', { className: 'mcp-select', value: String(compat.supportsDeveloperRole), onChange: (event) => setSnap((current) => current === undefined ? current : ({ ...current, compat: { ...current.compat, supportsDeveloperRole: event.target.value === 'unset' ? 'unset' : event.target.value === 'true' } })) },
                e('option', { value: 'unset' }, '未设置'),
                e('option', { value: 'true' }, '支持'),
                e('option', { value: 'false' }, '不支持（用 system）'),
              ),
              e('span', { className: 'mcp-label' }, 'reasoning_effort'),
              e('select', { className: 'mcp-select', value: String(compat.supportsReasoningEffort), onChange: (event) => setSnap((current) => current === undefined ? current : ({ ...current, compat: { ...current.compat, supportsReasoningEffort: event.target.value === 'unset' ? 'unset' : event.target.value === 'true' } })) },
                e('option', { value: 'unset' }, '未设置'),
                e('option', { value: 'true' }, '支持'),
                e('option', { value: 'false' }, '不支持'),
              ),
            ),
            e('div', { className: 'mcp-row' },
              e('span', { className: 'mcp-label' }, '输出上限字段'),
              e('select', { className: 'mcp-select', value: compat.maxTokensField, onChange: (event) => setSnap((current) => current === undefined ? current : ({ ...current, compat: { ...current.compat, maxTokensField: event.target.value } })) },
                e('option', { value: 'unset' }, '未设置'),
                e('option', { value: 'max_completion_tokens' }, 'max_completion_tokens'),
                e('option', { value: 'max_tokens' }, 'max_tokens'),
              ),
              e('span', { className: 'mcp-label' }, '思考格式'),
              e('select', { className: 'mcp-select', value: compat.thinkingFormat, onChange: (event) => setSnap((current) => current === undefined ? current : ({ ...current, compat: { ...current.compat, thinkingFormat: event.target.value } })) },
                e('option', { value: 'unset' }, '未设置'),
                FORMATS.map((format) => e('option', { value: format, key: format }, format)),
              ),
            ),
          ),
        }),
      ));

      const invalid = snap.models.some((model) => model.kind === 'custom' && !effortValid(model));
      snap.models.forEach((model, index) => {
        rows.push(e('div', { key: `model-${index}` },
          e(DisclosureRow, {
            rowClassName: 'mcp-mrow',
            titleClassName: 'mcp-mrow-title',
            chevronClassName: 'mcp-mrow-chev',
            icon: e(IconData, { size: 14 }),
            title: model.id,
            open: openModels.has(index),
            expandable: true,
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: () => toggleModel(index),
            collapsedContent: e('span', { className: 'mcp-mrow-summary' }, `${modalitySummary(model)} · ${effortSummary(model)}`),
            children: e('div', null,
              e('div', { className: 'mcp-row' },
                e('span', { className: 'mcp-label' }, '模态'),
                e('select', { className: 'mcp-select', value: model.input.includes('image') ? 'both' : model.input.includes('text') ? 'text' : 'inherit', onChange: (event) => patchModel(index, (m) => ({ ...m, input: event.target.value === 'both' ? ['text', 'image'] : event.target.value === 'text' ? ['text'] : [] })) },
                  e('option', { value: 'inherit' }, '继承'),
                  e('option', { value: 'text' }, '仅文本'),
                  e('option', { value: 'both' }, '文本 + 图像'),
                ),
                e('span', { className: 'mcp-label' }, '思考强度'),
                e('select', { className: 'mcp-select', value: model.kind, onChange: (event) => patchModel(index, (m) => ({ ...m, kind: event.target.value })) },
                  e('option', { value: 'unset' }, '未设置'),
                  e('option', { value: 'false' }, '禁用 (false)'),
                  e('option', { value: 'preset' }, '标准档位'),
                  e('option', { value: 'custom' }, '自定义'),
                ),
              ),
              model.kind === 'custom' ? e('div', { className: 'mcp-grid' },
                LEVELS.map((level) => e('span', { className: 'mcp-effort', key: level },
                  e('label', null, e('input', { type: 'checkbox', checked: model.efforts[level].on, onChange: () => toggleEffort(index, level) }), ` ${LEVEL_LABEL[level]}`),
                  e('input', { className: 'mcp-input', type: 'text', value: model.efforts[level].value, placeholder: level === 'off' ? '留空=不发送' : '线上值, 如 ultra', onChange: (event) => setEffortValue(index, level, event.target.value) }),
                )),
              ) : null,
            ),
          }),
        ));
      });

      rows.push(e('div', { key: 'actions', className: 'mcp-actions' },
        e(Button, { variant: 'primary', size: 'sm', disabled: busy || invalid || snap.models.length === 0 || snap.models.some((model) => model.id.trim() === ''), onClick: () => { void apply(); } }, busy ? '保存中…' : '应用能力配置'),
        invalid ? e('span', { key: 'v', className: 'mcp-err' }, '自定义档位有勾选但线上值为空') : null,
        message === 'saved' ? e('span', { key: 'm', className: 'mcp-ok' }, '已写入 llm-pi-ai · settings.yaml') : null,
        message === 'conflict' ? e('span', { key: 'm', className: 'mcp-err' }, '设置已被他人修改，请关闭页面重开后再试') : null,
        message !== undefined && message !== 'saved' && message !== 'conflict' ? e('span', { key: 'm', className: 'mcp-err' }, String(message)) : null,
      ));
      return e('div', { className: 'mcp-card' }, ...rows);
    }

    const inject = ['slots', 'remote', 'remote.settings'];

    function apply(ctx) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      ctx.effect(() => {
        return () => style.remove();
      });
      ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register(
        { name: 'settings.models.provider-card', key: 'llm-pi-ai' },
        (props) => e(ModelCapabilities, props, ctx),
      ));
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
