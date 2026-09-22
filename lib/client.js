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
 *   - provider request headers: a generic editor writing `providers.<route>.headers`
 *     (names lowercased; user-agent reserved). Values are static per provider —
 *     a fixed `x-opencode-session` can be set like any other header
 *
 * UI: built on the official @deepseek-ai/dsh-client-ui-primitives atoms
 * (Button / Pill / Input / Menu / DisclosureRow / StateDot) and official
 * `--dsw-*` tokens only — no hardcoded colors, so light/dark themes follow
 * the app. Custom CSS is a single dedupe-guarded sheet (data-plugin-css).
 *
 * Data owner: the pi-ai adapter's `llm-pi-ai` settings namespace. This browser
 * half talks to the same-origin Host bridge of this bundle — GET/POST
 * /model-capabilities — which reads through ctx.settings and writes through
 * settings.mutate() with the view revision, so conflicts are refused and every
 * write is validated by the pi-ai config schema (assertServiceable) before it
 * reaches the profile's cordis.patch.yml. Conflicts and schema rejections
 * surface verbatim.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-capabilities',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const e = React.createElement;
    const { Button, Pill, Input, Menu, DisclosureRow, StateDot } = primitives;
    // dsh 0.1.7-alpha.1 renamed every icon export to a thickness-suffixed pair:
    // IconChevronDownOutline14/16 became …OutlineMedium / …OutlineRegular. The
    // old spellings stay as fallbacks so one bundle runs against both the
    // pre-0.1.7 and 0.1.7 atom tables instead of silently rendering no icon.
    const IconChevronDown = primitives.IconChevronDownOutlineRegular
      ?? primitives.IconChevronDownOutlineMedium
      ?? primitives.IconChevronDownOutline16
      ?? primitives.IconChevronDownOutline14;
    const IconThink = primitives.IconThinkOutlineRegular
      ?? primitives.IconThinkOutlineMedium
      ?? primitives.IconThinkOutline16
      ?? primitives.IconSettingsOutline16;

    /* ── styles ──────────────────────────────────────────────────────────────
     * Official `--dsw-*` tokens only; density follows the settings panel
     * (14px titles, 12px tertiary labels, 13px controls, hairline sections).
     * Injected once per tag id — the guard keeps HMR/reloads from stacking. */
    const CSS_TAG = 'dsh-model-capabilities/client.css';
    const CSS = [
      '.mc{display:flex;flex-direction:column;gap:12px;margin-top:12px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2)}',
      '.mc-title{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.mc-route{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.mc-section{display:flex;flex-direction:column;gap:8px}',
      '.mc-sectionTitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.mc-row{display:flex;align-items:center;gap:10px;min-height:28px;flex-wrap:wrap}',
      '.mc-label{flex:none;width:96px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.mc-seg{display:inline-flex;gap:6px;flex-wrap:wrap}',
      '.mc-selectLabel{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mc-effortRow{display:flex;align-items:center;gap:6px}',
      '.mc-effortInput{width:150px}',
      '.mc-effortInput input{width:100%;min-width:0;box-sizing:border-box}',
      '.mc-headerName{width:190px}',
      '.mc-headerValue{flex:1;min-width:140px}',
      '.mc-headerName input,.mc-headerValue input{width:100%;min-width:0;box-sizing:border-box}',
      '.mc-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.mc-statusError{color:var(--dsw-alias-state-error-primary)}',
      '.mc-statusDone{color:var(--dsw-alias-state-success-primary)}',
      '.mc-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.mc-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.mc-modelTitle{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.mc-modelSummary{display:inline-flex;gap:6px;flex-wrap:wrap}',
      '.mc-modelBody{display:flex;flex-direction:column;gap:10px;padding:2px 0 4px}',
      '.mc-grid{display:flex;flex-wrap:wrap;gap:8px 14px}',
      '.mc-compatGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:6px 14px}',
      '.mc-compatGrid .mc-label{width:158px}',
    ].join('\n');

    function mountStyles() {
      if (typeof document === 'undefined') return null;
      const selector = 'style[data-plugin-css="' + CSS_TAG + '"]';
      const existing = document.querySelector(selector);
      if (existing !== null) return existing;
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-model-capabilities';
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return tag;
    }

    /* ── domain data (bridge contract unchanged) ── */
    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const LEVEL_LABEL = { off: '关', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
    const FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling'];
    const MAX_TOKEN_FIELDS = ['max_completion_tokens', 'max_tokens'];
    const CACHE_CONTROL_FORMATS = ['anthropic'];
    const THINKING_TOKEN_BUDGET_FIELDS = ['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens'];
    const VLLM_PRIORITY_MIN = -2147483648;
    const VLLM_PRIORITY_MAX = 2147483647;
    const INT_TEXT_RE = /^-?\d+$/;
    /* ── compat surface ──────────────────────────────────────────────────────
     * Mirrors the Host's COMPAT_FIELDS, which mirrors the `offer` half of
     * pi-ai 0.1.6-alpha.2's `PiAiCompatProfile` (the four `*_COMPAT_GATE`
     * tables in dsh-llm-pi-ai/lib/types/catalog.d.ts). Fields the gates
     * `withhold` are absent from both the profile type and the adapter's
     * schema, so they are deliberately not offered here: selecting one could
     * only produce a write the adapter refuses. */
    /** A patch value meaning "the stored field is not representable here — leave it alone". */
    const KEEP = 'keep';
    const KEEP_LABEL = '保持原样（当前值本卡片无法表示）';
    /** Every offered boolean switch the card renders. */
    const COMPAT_BOOL_FIELDS = [
      { key: 'supportsDeveloperRole', label: 'developer 角色', on: '支持', off: '不支持（用 system）' },
      { key: 'supportsReasoningEffort', label: 'reasoning_effort', on: '支持', off: '不支持' },
      { key: 'supportsStore', label: 'store 字段' },
      { key: 'supportsUsageInStreaming', label: '流式用量统计' },
      { key: 'supportsFinishReason', label: 'finish_reason', on: '携带', off: '不携带（自动推断）' },
      { key: 'requiresToolResultName', label: '工具结果需 name', on: '需要', off: '不需要' },
      { key: 'requiresAssistantAfterToolResult', label: '工具结果后需 assistant', on: '需要', off: '不需要' },
      { key: 'requiresThinkingAsText', label: '思考转文本', on: '是', off: '否' },
      { key: 'requiresReasoningContentOnAssistantMessages', label: '回放需 reasoning_content', on: '需要', off: '不需要' },
      { key: 'supportsThinkingTokenBudget', label: '思考预算别名' },
      { key: 'supportsStrictMode', label: 'strict 工具模式' },
      { key: 'supportsLongCacheRetention', label: '长缓存保留' },
      { key: 'supportsMaxOutputTokens', label: 'max_output_tokens', on: '支持', off: '不支持（省略）' },
      { key: 'supportsEagerToolInputStreaming', label: '工具入参急切流式' },
      { key: 'supportsCacheControlOnTools', label: '工具定义 cache_control' },
      { key: 'supportsTemperature', label: 'temperature 字段' },
      { key: 'forceAdaptiveThinking', label: '强制自适应思考', on: '强制', off: '不强制' },
      { key: 'allowEmptySignature', label: '允许空签名', on: '允许', off: '不允许' },
      { key: 'supportsStrictTools', label: 'Anthropic strict 工具' },
    ];
    /** Every offered closed-value switch the card renders. */
    const COMPAT_ENUMS = [
      { key: 'maxTokensField', label: '输出上限字段', values: MAX_TOKEN_FIELDS },
      { key: 'thinkingFormat', label: '思考格式', values: FORMATS },
      { key: 'thinkingTokenBudgetField', label: '思考预算字段', values: THINKING_TOKEN_BUDGET_FIELDS },
      { key: 'cacheControlFormat', label: '缓存标记格式', values: CACHE_CONTROL_FORMATS },
    ];
    /** Every offered bounded-integer field the card renders. */
    const COMPAT_INT_FIELDS = [{ key: 'vllmPriority', label: 'vLLM 调度优先级' }];
    const COMPAT_BOOL_KEYS = COMPAT_BOOL_FIELDS.map((field) => field.key);
    const COMPAT_INT_KEYS = COMPAT_INT_FIELDS.map((field) => field.key);
    const PRESET = { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' };
    const HEADER_NAME_RE = /^[a-z0-9!#$%&'*+\-.^_`|~]+$/;

    function isOpencodeRoute(providerId, baseURL) {
      return /opencode/i.test(providerId ?? '') || /opencode\.ai/i.test(baseURL ?? '');
    }
    function headerRowsOf(dict) {
      const rows = Object.entries(dict ?? {}).map(([name, value]) => ({ name, value: typeof value === 'string' ? value : '' }));
      rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return rows;
    }
    /** First validation error across the header rows, or null. Fully empty rows are ignored. */
    function headerRowsError(rows) {
      const seen = new Set();
      for (const row of rows) {
        const name = row.name.trim().toLowerCase();
        const value = row.value.trim();
        if (name === '' && value === '') continue;
        if (name === '') return '存在缺少名称的请求头';
        if (!HEADER_NAME_RE.test(name)) return `请求头名不合法：${name}`;
        if (name === 'user-agent') return 'user-agent 由 DSH 归属头占用，写入会被忽略';
        if (value === '') return `请求头 ${name} 缺少值`;
        if (value.length > 512) return `请求头 ${name} 的值超过 512 字符`;
        if (seen.has(name)) return `请求头重复：${name}`;
        seen.add(name);
      }
      return null;
    }
    /** The desired final header dict; fully empty rows are dropped. */
    function headersPayload(rows) {
      const dict = {};
      for (const row of rows) {
        const name = row.name.trim().toLowerCase();
        if (name === '') continue;
        dict[name] = row.value.trim();
      }
      return dict;
    }

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
    /** A bounded-integer problem with the vllmPriority field text, or null when empty/valid. */
    function intTextError(text) {
      const trimmed = String(text ?? '').trim();
      if (trimmed === '') return null;
      if (!INT_TEXT_RE.test(trimmed)) return '必须是整数（可 0 / 负）';
      const value = Number(trimmed);
      if (!Number.isSafeInteger(value) || value < VLLM_PRIORITY_MIN || value > VLLM_PRIORITY_MAX) {
        return `超出范围（${VLLM_PRIORITY_MIN} … ${VLLM_PRIORITY_MAX}）`;
      }
      return null;
    }

    /**
     * One stored compat dict → the card's editable snapshot, plus the keys it
     * cannot represent. `hasOwnProperty` is what separates "stored, but no
     * control here can show it" (KEEP → left alone on save) from "not stored"
     * (`unset` → an explicit clear that is a harmless no-op).
     */
    function loadCompat(raw, keep) {
      const source = raw !== null && typeof raw === 'object' ? raw : {};
      const compat = {};
      for (const key of COMPAT_BOOL_KEYS) {
        if (typeof source[key] === 'boolean') compat[key] = source[key];
        else if (Object.prototype.hasOwnProperty.call(source, key)) { compat[key] = KEEP; keep.add(key); }
        else compat[key] = 'unset';
      }
      for (const field of COMPAT_ENUMS) {
        if (field.values.includes(source[field.key])) compat[field.key] = source[field.key];
        else if (Object.prototype.hasOwnProperty.call(source, field.key)) { compat[field.key] = KEEP; keep.add(field.key); }
        else compat[field.key] = 'unset';
      }
      for (const field of COMPAT_INT_FIELDS) {
        if (typeof source[field.key] === 'number' && intTextError(String(source[field.key])) === null) compat[field.key] = String(source[field.key]);
        else if (Object.prototype.hasOwnProperty.call(source, field.key)) { compat[field.key] = ''; keep.add(field.key); }
        else compat[field.key] = '';
      }
      return compat;
    }

    /**
     * The `compatPatch` the Host merges. `'unset'` clears the stored key,
     * `'keep'` leaves it alone. Every rendered key is present, and a key whose
     * stored value this build cannot represent is always `'keep'` — never
     * `'unset'` — so a save driven by an unrelated switch cannot drop a field
     * a newer pi-ai (or a hand-edited cordis.patch.yml) put there.
     */
    function buildCompatPatch(compat, keepKeys) {
      const keep = new Set(keepKeys ?? []);
      const patch = {};
      for (const key of COMPAT_BOOL_KEYS) {
        if (keep.has(key)) patch[key] = KEEP;
        else if (compat[key] === true || compat[key] === false) patch[key] = compat[key];
        else patch[key] = 'unset';
      }
      for (const field of COMPAT_ENUMS) {
        if (keep.has(field.key)) patch[field.key] = KEEP;
        else if (field.values.includes(compat[field.key])) patch[field.key] = compat[field.key];
        else patch[field.key] = 'unset';
      }
      for (const key of COMPAT_INT_KEYS) {
        const text = String(compat[key] ?? '').trim();
        if (keep.has(key)) patch[key] = KEEP;
        else if (text === '') patch[key] = 'unset';
        else if (INT_TEXT_RE.test(text) && intTextError(text) === null) patch[key] = Number(text);
        else patch[key] = KEEP;
      }
      return patch;
    }

    function loadView(revision, profile) {
      const compatKeep = new Set();
      return {
        revision,
        hasModelsList: profile.hasModelsList === true || Array.isArray(profile.models),
        reasoning: typeof profile.reasoning === 'string' ? profile.reasoning : 'unset',
        defaultInput: Array.isArray(profile.defaultInput) ? profile.defaultInput.slice() : [],
        compat: loadCompat(profile.compat, compatKeep),
        compatKeep: Array.from(compatKeep),
        // Keys the Host reports as stored but not rendered: shown as a note,
        // never assumed away (the Host preserves them across a save).
        compatHidden: Array.isArray(profile.compatHidden)
          ? profile.compatHidden.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.key === 'string')
          : [],
        baseURL: typeof profile.baseURL === 'string' ? profile.baseURL : null,
        headersTouched: false,
        headerRows: headerRowsOf(profile.headers),
        models: (Array.isArray(profile.models) ? profile.models : []).map((m) => normalizeModel(m)),
      };
    }
    /** Stale-while-revalidate cache: providerId → { revision, profile }. */
    const viewCache = new Map();
    /** Narrow a bridge payload (GET response or POST `view`) to the profile shape loadView reads. */
    function viewFromJson(json) {
      return {
        hasModelsList: json.hasModelsList === true,
        reasoning: json.reasoning,
        defaultInput: json.defaultInput,
        compat: json.compat,
        compatHidden: json.compatHidden,
        baseURL: json.baseURL,
        headers: json.headers,
        models: json.models,
      };
    }
    function rememberView(providerId, json) {
      const profile = viewFromJson(json);
      const next = loadView(Number(json.revision) || 0, profile);
      if (providerId !== undefined) viewCache.set(providerId, { revision: next.revision, profile });
      return next;
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
    function modalityOf(model) {
      return model.input.includes('image') ? 'both' : model.input.includes('text') ? 'text' : 'inherit';
    }
    const MODALITY_LABEL = { inherit: '继承', text: '仅文本', both: '文本+图像' };
    const KIND_LABEL = { unset: '未设置', false: '禁用', preset: '标准档位', custom: '自定义' };

    /* ── official atoms ── */

    /** Dropdown select built on the official Menu (portal escapes card overflow). */
    function Select({ value, options, disabled, onChange }) {
      const [open, setOpen] = React.useState(false);
      const current = options.find((option) => option.value === value) ?? options[0];
      return e(Menu, {
        open,
        onClose: () => setOpen(false),
        portal: true,
        compact: true,
        dense: true,
        selectedId: String(value),
        items: options.map((option) => ({ id: String(option.value), label: option.label })),
        onSelect: (id) => {
          setOpen(false);
          const next = options.find((option) => String(option.value) === id);
          if (next !== undefined) onChange(next.value);
        },
        anchor: e(Button, { variant: 'outline', size: 'sm', disabled, onClick: () => setOpen((v) => !v) },
          e('span', { className: 'mc-selectLabel' }, current === undefined ? '' : current.label),
          IconChevronDown === undefined ? null : e(IconChevronDown, { size: 14 })),
      });
    }

    /** Segmented choice rendered as official Pills. */
    function Segmented({ value, options, onChange }) {
      return e('span', { className: 'mc-seg' },
        options.map((option) => e(Pill, {
          key: String(option.value),
          active: option.value === value,
          onClick: () => onChange(option.value),
        }, option.label)));
    }

    /** One status line: official StateDot + text. */
    function Status({ state, text, error }) {
      const tone = error ? ' mc-statusError' : state === 'done' ? ' mc-statusDone' : '';
      return e('span', { className: 'mc-status' + tone },
        e(StateDot, { state, size: 10 }),
        text);
    }

    /* ── main cell ── */

    function ModelCapabilities(props) {
      const providerId = props?.provider?.provider;
      const configured = props?.configured !== false;
      const [snap, setSnap] = React.useState(undefined);
      const [busy, setBusy] = React.useState(false);
      const [status, setStatus] = React.useState(undefined); // { state, text, error }
      const [openModels, setOpenModels] = React.useState(() => new Set());
      const [openCompat, setOpenCompat] = React.useState(false);
      const [openHeaders, setOpenHeaders] = React.useState(false);

      const load = async (options) => {
        if (providerId === undefined) return;
        // Silent loads revalidate in place: no loading flash, no status wipe.
        const silent = options?.silent === true;
        if (!silent) {
          setSnap(undefined);
          setStatus(undefined);
        }
        try {
          const response = await fetch(`/model-capabilities?provider=${encodeURIComponent(providerId)}`, { credentials: 'same-origin' });
          const json = await response.json().catch(() => null);
          if (!json || json.ok !== true) {
            setStatus({ state: 'error', text: String((json && json.error) || 'load-failed'), error: true });
            return;
          }
          setSnap(rememberView(providerId, json));
          if (silent) setStatus(undefined);
        } catch (error) {
          setStatus({ state: 'error', text: String(error), error: true });
        }
      };
      // Paint the cached view first (instant, no flash), then revalidate in the
      // background so the revision and fields stay current.
      React.useEffect(() => {
        const cached = providerId === undefined ? undefined : viewCache.get(providerId);
        if (cached !== undefined) setSnap(loadView(cached.revision, cached.profile));
        void load({ silent: cached !== undefined });
      }, [providerId]);

      const patchModel = (index, fn) => setSnap((current) => current === undefined ? current : ({ ...current, models: current.models.map((model, at) => at === index ? fn(model) : model) }));
      const setEffortValue = (index, level, value) => patchModel(index, (model) => ({ ...model, efforts: { ...model.efforts, [level]: { ...model.efforts[level], value } } }));
      const toggleEffort = (index, level) => patchModel(index, (model) => ({ ...model, efforts: { ...model.efforts, [level]: { ...model.efforts[level], on: !model.efforts[level].on, value: !model.efforts[level].on && level !== 'off' && model.efforts[level].value === '' ? level : model.efforts[level].value } } }));
      const toggleModel = (index) => setOpenModels((current) => {
        const next = new Set(current);
        if (!next.delete(index)) next.add(index);
        return next;
      });

      /** One compat edit: the key leaves the "keep" set as soon as the user states a value for it. */
      const setCompat = (key, value) => setSnap((current) => current === undefined ? current : ({
        ...current,
        compat: { ...current.compat, [key]: value },
        compatKeep: value === KEEP ? Array.from(new Set([...(current.compatKeep ?? []), key])) : (current.compatKeep ?? []).filter((kept) => kept !== key),
      }));

      /* header edits — every touch marks the dict dirty so apply sends it */
      const patchHeaders = (fn) => setSnap((current) => current === undefined ? current : ({ ...current, headersTouched: true, headerRows: fn(current.headerRows) }));
      const editHeaderRow = (index, patch) => patchHeaders((rows) => rows.map((row, at) => at === index ? { ...row, ...patch } : row));
      const removeHeaderRow = (index) => patchHeaders((rows) => rows.filter((row, at) => at !== index));
      const addHeaderRow = () => patchHeaders((rows) => [...rows, { name: '', value: '' }]);

      const apply = async () => {
        if (snap === undefined) return;
        setBusy(true);
        setStatus({ state: 'ongoing', text: '保存中…' });
        try {
          // 'unset' clears, 'keep' leaves the stored value alone (see
          // buildCompatPatch): toggling one switch here can never drop a compat
          // field this build cannot represent.
          const compatPatch = buildCompatPatch(snap.compat, snap.compatKeep);
          const response = await fetch('/model-capabilities', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              provider: providerId,
              revision: snap.revision,
              reasoning: snap.reasoning === 'unset' ? null : snap.reasoning,
              defaultInput: snap.defaultInput.length === 0 ? null : snap.defaultInput,
              // Full-replace semantics on the Host; undefined (dropped by
              // JSON.stringify) leaves the stored dict untouched.
              headers: snap.headersTouched ? headersPayload(snap.headerRows) : undefined,
              compatPatch,
              models: snap.models.map((model) => ({
                id: model.id,
                input: model.input.length === 0 ? null : model.input,
                reasoningEfforts: effortPayload(model),
              })),
            }),
          });
          const json = await response.json().catch(() => null);
          if (json && json.ok === true) {
            // The Host returns the committed view, so update in place: no second
            // round trip and no loading flash. Older hosts return `ok` only —
            // fall back to a silent revalidate.
            if (json.view !== undefined) setSnap(rememberView(providerId, json.view));
            else await load({ silent: true });
            setStatus({ state: 'done', text: '已写入 llm-pi-ai · cordis.patch.yml' });
          } else if (json && json.error === 'conflict') {
            // Refresh the view revision so a plain retry can succeed; keep the
            // conflict copy visible.
            await load({ silent: true });
            setStatus({ state: 'error', text: 'conflict — 设置已被其他编辑修改（revision 过期），视图已刷新，可直接重试', error: true });
          } else {
            setStatus({ state: 'error', text: String((json && json.error) || 'write-failed'), error: true });
          }
        } catch (error) {
          setStatus({ state: 'error', text: String(error), error: true });
        } finally {
          setBusy(false);
        }
      };

      /* ── render ── */
      const parts = [];
      parts.push(e('div', { key: 'head', className: 'mc-title' },
        IconThink === undefined ? null : e(IconThink, { size: 16 }),
        '模型能力',
        e('span', { className: 'mc-route' }, providerId ?? ''),
        configured ? null : e(Pill, null, '草稿 — 官方卡片保存后生效')));

      if (snap === undefined) {
        parts.push(e('div', { key: 'loading', className: 'mc-actions' },
          e(Status, { state: 'ongoing', text: status === undefined ? '加载中…' : '' }),
          status !== undefined && status.text !== '' ? e('span', { key: 'e', className: 'mc-status mc-statusError' }, status.text) : null,
          e(Button, { key: 'r', variant: 'outline', size: 'sm', onClick: () => { void load(); } }, '重试')));
        return e('div', { className: 'mc' }, ...parts);
      }
      if (!snap.hasModelsList) {
        parts.push(e('p', { key: 'no-models', className: 'mc-note' },
          '该提供方使用内置目录模型，无模型清单可配置。先在官方编辑器中自定义模型目录，再回到这里设置能力。'));
        return e('div', { className: 'mc' }, ...parts);
      }

      /* header rows + derived state */
      const opencodeDetected = isOpencodeRoute(providerId, snap.baseURL);
      const headerError = headerRowsError(snap.headerRows);

      /* provider-level */
      parts.push(e('div', { key: 'provider', className: 'mc-section' },
        e('div', { className: 'mc-sectionTitle' }, '提供方默认值'),
        e('div', { className: 'mc-row' },
          e('span', { className: 'mc-label' }, '默认思考强度'),
          e(Select, {
            value: snap.reasoning,
            options: [{ value: 'unset', label: '未设置' }].concat(LEVELS.map((level) => ({ value: level, label: `${LEVEL_LABEL[level]} (${level})` }))),
            onChange: (value) => setSnap((current) => current === undefined ? current : ({ ...current, reasoning: value })),
          })),
        e('div', { className: 'mc-row' },
          e('span', { className: 'mc-label' }, '默认模态'),
          e(Segmented, {
            value: snap.defaultInput.includes('image') ? 'both' : snap.defaultInput.includes('text') ? 'text' : 'none',
            options: [{ value: 'none', label: '未设置（默认文本）' }, { value: 'text', label: '仅文本' }, { value: 'both', label: '文本+图像' }],
            onChange: (value) => setSnap((current) => current === undefined ? current : ({ ...current, defaultInput: value === 'both' ? ['text', 'image'] : value === 'text' ? ['text'] : [] })),
          }))));

      /* compat (collapsed by default) — scalar offer fields; the two offered
         dictionaries remain unrendered and are preserved by the Host. */
      const compat = snap.compat;
      const compatKeep = new Set(snap.compatKeep ?? []);
      const compatHidden = snap.compatHidden ?? [];
      const keepOption = (key, options) => compatKeep.has(key) ? [{ value: KEEP, label: KEEP_LABEL }].concat(options) : options;
      const boolRow = (field) => e('div', { className: 'mc-row', key: `compat-${field.key}` },
        e('span', { className: 'mc-label' }, field.label),
        e(Select, {
          value: String(compat[field.key]),
          options: keepOption(field.key, [{ value: 'unset', label: '不设置' }, { value: 'true', label: field.on ?? '支持' }, { value: 'false', label: field.off ?? '不支持' }]),
          onChange: (value) => setCompat(field.key, value === 'true' ? true : value === 'false' ? false : value),
        }));
      const enumRow = (field) => e('div', { className: 'mc-row', key: `compat-${field.key}` },
        e('span', { className: 'mc-label' }, field.label),
        e(Select, {
          value: compat[field.key],
          options: keepOption(field.key, [{ value: 'unset', label: '不设置' }].concat(field.values.map((value) => ({ value, label: value })))),
          onChange: (value) => setCompat(field.key, value),
        }));
      const intRow = (field) => {
        const problem = intTextError(compat[field.key]);
        return e('div', { className: 'mc-row', key: `compat-${field.key}` },
          e('span', { className: 'mc-label' }, field.label),
          e(Input, {
            className: 'mc-effortInput',
            value: compat[field.key],
            placeholder: compatKeep.has(field.key) ? KEEP_LABEL : '留空=不设置，可 0 / 负',
            'aria-label': `${field.label}（整数，留空表示不设置）`,
            onChange: (event) => setCompat(field.key, event.target.value),
          }),
          compatKeep.has(field.key) ? e('span', { className: 'mc-note' }, KEEP_LABEL) : null,
          compatKeep.has(field.key) ? e(Button, { variant: 'outline', size: 'sm', onClick: () => setCompat(field.key, '') }, '清除') : null,
          problem === null ? null : e('span', { className: 'mc-status mc-statusError' }, problem));
      };
      const compatSetCount = COMPAT_BOOL_KEYS.concat(COMPAT_ENUMS.map((field) => field.key), COMPAT_INT_KEYS)
        .filter((key) => compatKeep.has(key) || (compat[key] !== undefined && compat[key] !== 'unset' && compat[key] !== '')).length;
      parts.push(e('div', { key: 'compat' },
        e(DisclosureRow, {
          title: '兼容设置 · 网关 400 修复',
          open: openCompat,
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          onToggle: () => setOpenCompat((value) => !value),
          collapsedContent: e('span', { className: 'mc-note' },
            `pi-ai 可配置开关 ${COMPAT_BOOL_KEYS.length + COMPAT_ENUMS.length + COMPAT_INT_KEYS.length} 项${compatSetCount === 0 ? '' : ` · 已设置 ${compatSetCount}`}`),
          children: e('div', { className: 'mc-modelBody' },
            e('div', { className: 'mc-compatGrid' },
              COMPAT_BOOL_FIELDS.map(boolRow).concat(COMPAT_ENUMS.map(enumRow), COMPAT_INT_FIELDS.map(intRow))),
            e('div', { className: 'mc-note' },
              '“不设置”清除该键；“保持原样”不修改。未渲染字典、withhold 与未知字段在合并时保留；保存仍受 pi-ai 校验，非法现有值可能导致拒绝。'),
            compatHidden.length === 0 ? null : e('div', { className: 'mc-note' },
              `另有 ${compatHidden.length} 个字段已配置但本卡片不展示（保存时原样保留）：${compatHidden.map((entry) => entry.key).join('、')}`)),
        })));

      /* request headers (collapsed by default) — static custom headers */
      parts.push(e('div', { key: 'headers' },
        e(DisclosureRow, {
          title: '请求头',
          open: openHeaders,
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          onToggle: () => setOpenHeaders((value) => !value),
          collapsedContent: e('span', { className: 'mc-note' },
            snap.headerRows.length === 0 ? '未设置' : `已设置 ${snap.headerRows.length} 个（${snap.headerRows.map((row) => row.name || '?').join(', ')}）`),
          children: e('div', { className: 'mc-modelBody' },
            opencodeDetected ? e('div', { className: 'mc-note' },
              'opencode 官方要求（opencode.ai/docs/go）：Go 套餐请求应携带 x-opencode-session（会话亲和、优化 prompt caching），否则账号可能被标记。在下方自建 x-opencode-session 行并填一个固定值即可（稳定的不透明标识，同安装内一致）。DSH 已发送真实归属 User-Agent，无需伪装 opencode 客户端。')
              : null,
            snap.headerRows.map((row, index) => e('div', { className: 'mc-row', key: `hdr-${index}` },
              e(Input, { className: 'mc-headerName', value: row.name, placeholder: 'x-custom-header', 'aria-label': `请求头第 ${index + 1} 行名称`, onChange: (event) => editHeaderRow(index, { name: event.target.value }) }),
              e(Input, { className: 'mc-headerValue', value: row.value, placeholder: '值', 'aria-label': `请求头第 ${index + 1} 行值`, onChange: (event) => editHeaderRow(index, { value: event.target.value }) }),
              e(Button, { variant: 'outline', size: 'sm', onClick: () => removeHeaderRow(index) }, '删除'))),
            e('div', { className: 'mc-row' },
              e(Button, { variant: 'outline', size: 'sm', onClick: addHeaderRow }, '添加请求头'),
              e('span', { className: 'mc-note' }, '按需手动添加，值原样发送；名称写入时统一为小写；user-agent 不可设置（DSH 归属头占用）'))),
        })));

      /* models */
      parts.push(e('div', { key: 'models', className: 'mc-section' },
        e('div', { className: 'mc-sectionTitle' }, `模型（${snap.models.length}）— 逐行覆盖提供方默认值`),
        snap.models.map((model, index) => e(DisclosureRow, {
          key: `model-${index}`,
          title: model.id,
          open: openModels.has(index),
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          onToggle: () => toggleModel(index),
          titleClassName: 'mc-modelTitle',
          collapsedContent: e('span', { className: 'mc-modelSummary' },
            e(Pill, null, MODALITY_LABEL[modalityOf(model)]),
            e(Pill, null, KIND_LABEL[model.kind] ?? model.kind)),
          children: e('div', { className: 'mc-modelBody' },
            e('div', { className: 'mc-row' },
              e('span', { className: 'mc-label' }, '模态'),
              e(Segmented, {
                value: modalityOf(model),
                options: [{ value: 'inherit', label: '继承' }, { value: 'text', label: '仅文本' }, { value: 'both', label: '文本+图像' }],
                onChange: (value) => patchModel(index, (m) => ({ ...m, input: value === 'both' ? ['text', 'image'] : value === 'text' ? ['text'] : [] })),
              })),
            e('div', { className: 'mc-row' },
              e('span', { className: 'mc-label' }, '思考强度'),
              e(Segmented, {
                value: model.kind,
                options: [{ value: 'unset', label: '未设置' }, { value: 'false', label: '禁用' }, { value: 'preset', label: '标准档位' }, { value: 'custom', label: '自定义' }],
                onChange: (value) => patchModel(index, (m) => ({ ...m, kind: value })),
              })),
            model.kind === 'custom' ? e('div', { className: 'mc-grid' },
              LEVELS.map((level) => e('span', { className: 'mc-effortRow', key: level },
                e(Pill, {
                  active: model.efforts[level].on,
                  onClick: () => toggleEffort(index, level),
                }, LEVEL_LABEL[level]),
                e(Input, {
                  className: 'mc-effortInput',
                  value: model.efforts[level].value,
                  placeholder: level === 'off' ? '留空=不发送' : '线上值, 如 ultra',
                  'aria-label': `${model.id} 的 ${level} 档位线上值`,
                  disabled: !model.efforts[level].on,
                  onChange: (event) => setEffortValue(index, level, event.target.value),
                })),
              )) : null),
        }))));

      const compatIntError = intTextError(compat.vllmPriority);
      const invalid = snap.models.some((model) => model.kind === 'custom' && !effortValid(model)) || headerError !== null || compatIntError !== null;
      parts.push(e('div', { key: 'actions', className: 'mc-actions' },
        e(Button, {
          variant: 'primary',
          size: 'sm',
          disabled: busy || invalid || snap.models.length === 0 || snap.models.some((model) => model.id.trim() === ''),
          onClick: () => { void apply(); },
        }, busy ? '保存中…' : '应用能力配置'),
        invalid ? e('span', { className: 'mc-status mc-statusError' }, headerError !== null ? headerError : compatIntError !== null ? `vllmPriority ${compatIntError}` : '自定义档位有勾选但线上值为空') : null,
        status !== undefined ? e(Status, { state: status.state, text: status.text, error: status.error }) : null));

      return e('div', { className: 'mc' }, ...parts);
    }

    const inject = ['slots'];

    function apply(ctx) {
      const style = mountStyles();
      ctx.effect(() => {
        return () => {
          if (style !== null && style.parentNode !== null) style.remove();
        };
      });
      ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register(
        { name: 'settings.models.provider-card', key: 'llm-pi-ai' },
        (props) => e(ModelCapabilities, props),
      ));
    }

    exports.inject = inject;
    exports.apply = apply;
    /**
     * Pure helpers plus the rendered compat surface, exposed for a maintainer's
     * persistent Node tests (the DSH client loader reads only `inject`/`apply`, so
     * this is inert in the browser). Keeping them reachable is what lets the
     * regression proof exercise this file instead of a copy of its logic.
     */
    exports.__internals = {
      loadCompat,
      loadView,
      rememberView,
      ModelCapabilities,
      Select,
      KEEP_LABEL,
      buildCompatPatch,
      intTextError,
      KEEP,
      COMPAT_BOOL_FIELDS,
      COMPAT_BOOL_KEYS,
      COMPAT_ENUMS,
      COMPAT_INT_FIELDS,
      COMPAT_INT_KEYS,
      VLLM_PRIORITY_MIN,
      VLLM_PRIORITY_MAX,
    };
    return module.exports;
  },
});
