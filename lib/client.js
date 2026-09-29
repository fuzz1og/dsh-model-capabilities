/*!
 * dsh-model-capabilities — client half.
 *
 * Lazy-CJS factory bundle served by the DSH web client module system.
 * Registers one settings page (`settings.section`, id `model-capabilities`,
 * order 16) that edits what the official Models page cannot reach:
 *
 *   - thinking tiers (reasoningEfforts): per model 未设置 / 禁用 / 标准档位 /
 *     自定义 wire values, plus the provider-level 标准档位 action described
 *     below
 *   - provider level: the default thinking effort (`reasoning`) the picker
 *     starts from
 *   - gateway compat switches (`providers.<route>.compat`)
 *   - provider request headers (`providers.<route>.headers`; names lowercased,
 *     `user-agent` reserved by the harness attribution header)
 *
 * Accepted modalities are NOT edited here any more: dsh 0.2.0's own Models page
 * carries per-model "Input types" (pi-ai `input`) and the provider default, so
 * a second editor in this bundle could only drift from the owner.
 *
 * 标准档位 is pi-ai-agnostic sugar owned by this bundle: pi-ai has no named
 * tier, only a per-model `reasoningEfforts` dict, so the page expands the tier
 * into `{ off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' }`
 * (mirroring STANDARD_REASONING_EFFORTS in lib/index.js) and writes it through
 * the ordinary revision-fenced bridge. The header action next to the provider
 * name applies it to every model of that route in one click, and commits
 * through the same `apply()` path as the save button, so nothing staged in the
 * editor is silently discarded.
 *
 * UI: built on the official @deepseek-ai/dsh-client-ui-primitives atoms
 * (Button / Pill / Tag / Input / Menu / DisclosureRow / SegmentedControl /
 * StateDot) and official `--dsw-*` tokens only — no hardcoded colors, so
 * light/dark themes follow the app. Custom CSS is a single dedupe-guarded sheet
 * (data-plugin-css).
 *
 * Data owner: the pi-ai adapter's `llm-pi-ai` settings namespace. This browser
 * half talks to the same-origin Host bridge of this bundle — GET
 * /model-capabilities[/providers], POST /model-capabilities — which reads
 * through ctx.settings and writes through settings.mutate() with the view
 * revision, so conflicts are refused and every write is validated by the pi-ai
 * config schema (assertServiceable) before it reaches the profile's
 * cordis.patch.yml. Conflicts and schema rejections surface verbatim.
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
    // `Tag` and `SegmentedControl` are both present in the installed
    // 0.2.0-rc.2 atom table. They degrade instead of disappearing on a bundle
    // that predates them: a missing component would throw on render, while a
    // Pill keeps the same capsule (and the same selection behavior).
    const Tag = primitives.Tag ?? Pill;
    const SegmentedControl = primitives.SegmentedControl ?? function FallbackSegmented({ value, options, onChange, label }) {
      return e('span', { className: 'mc-seg', role: 'tablist', 'aria-label': label },
        options.map((option) => e(Pill, {
          key: String(option.value),
          active: option.value === value,
          onClick: () => { if (option.value !== value) onChange(option.value); },
        }, option.label)));
    };
    // dsh 0.1.7-alpha.1 renamed every icon export to a thickness-suffixed pair:
    // IconChevronDownOutline14/16 became …OutlineMedium / …OutlineRegular. The
    // old spellings stay as fallbacks so one bundle runs against both the
    // pre-0.1.7 and 0.1.7+ atom tables instead of silently rendering no icon.
    // Every name below was re-verified against the installed 0.2.0-rc.2
    // primitives bundle.
    const IconChevronDown = primitives.IconChevronDownOutlineRegular
      ?? primitives.IconChevronDownOutlineMedium
      ?? primitives.IconChevronDownOutline16
      ?? primitives.IconChevronDownOutline14;
    const IconThink = primitives.IconThinkOutlineRegular
      ?? primitives.IconThinkOutlineMedium
      ?? primitives.IconThinkOutline16
      ?? primitives.IconSettingsOutline16;
    // 标准档位 reads as a level/measure, so the gauge glyph carries the action;
    // the thinking glyph stays on the rows themselves.
    const IconTier = primitives.IconGaugeOutlineRegular
      ?? primitives.IconGaugeOutlineMedium
      ?? IconThink;
    // DisclosureRow's `icon` is REQUIRED by its contract (a 16px leading box).
    // Passing none left an empty 16px gap where an affordance belongs, and the
    // hover chevron then swapped in from nothing. Both resolve with fallbacks so
    // a rename degrades to a working icon rather than to `undefined`.
    const IconCompat = primitives.IconSlidersTwoOutlineRegular
      ?? primitives.IconSlidersTwoOutlineMedium
      ?? primitives.IconSlidersTwoOutline
      ?? primitives.IconSettingsOutlineRegular
      ?? primitives.IconSettingsOutlineMedium;
    const IconHeaders = primitives.IconLinkOutlineRegular
      ?? primitives.IconLinkOutlineMedium
      ?? primitives.IconLinkOutline
      ?? IconCompat;
    const IconRefresh = primitives.IconRefreshOutlineRegular ?? primitives.IconRefreshOutlineMedium;

    /* ── styles ──────────────────────────────────────────────────────────────
     * Official `--dsw-*` tokens only, following the settings surface's own
     * rhythm: cards draw `stroke`/`fill` with the settings-card pair at
     * `--dsw-radius-xl`, field labels are 12/18 secondary above a 32px control,
     * body copy is 13/20, captions are 11/17, and every interactive row keeps
     * the 8px/12px control radius. Injected once per tag id — the guard keeps
     * HMR/reloads from stacking. */
    const CSS_TAG = 'dsh-model-capabilities/client.css';
    const CSS = [
      /* editor (right pane) */
      '.mc{display:flex;flex-direction:column;gap:12px;min-width:0}',
      '.mc-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
      '.mc-headName{font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mc-route{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mc-headActions{margin-left:auto;display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mc-card{border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl);padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.mc-cardTitle{margin:0;font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.mc-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(188px,1fr));gap:12px 14px}',
      '.mc-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.mc-fieldLabel{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.mc-fieldControl{display:inline-flex;align-items:center;gap:8px;min-width:0}',
      '.mc-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.mc-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.mc-statusError{color:var(--dsw-alias-state-error-primary)}',
      '.mc-statusDone{color:var(--dsw-alias-state-success-primary)}',
      '.mc-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.mc-input{width:100%;min-width:0}',
      '.mc-input input{width:100%;min-width:0;box-sizing:border-box}',
      '.mc-selectLabel{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mc-seg{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}',
      /* A disclosure row is a FIXED 24px flex line whose children are
         `flex: none`. Its collapsed content therefore has to be told to shrink,
         or a long summary wraps to several lines inside a 24px box and
         `overflow: hidden` slices it into overlapping text (measured: a 54px
         summary in a 24px row). Shrink, then ellipsize on one line. */
      '.mc-collapsed{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:right}',
      '.mc-modelTitle{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12px;color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto}',
      '.mc-modelSummary{display:inline-flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow:hidden;min-width:0;justify-content:flex-end}',
      '.mc-modelBody{display:flex;flex-direction:column;gap:10px;padding:6px 0 2px}',
      '.mc-effortGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(188px,1fr));gap:8px 14px}',
      '.mc-effortRow{display:flex;align-items:center;gap:8px;min-width:0}',
      '.mc-effortInput{flex:1 1 auto;min-width:0}',
      '.mc-effortInput input{width:100%;min-width:0;box-sizing:border-box}',
      '.mc-headerRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
      '.mc-headerName{flex:1 1 34%;min-width:96px}',
      '.mc-headerValue{flex:2 1 50%;min-width:110px}',
      '.mc-headerName input,.mc-headerValue input{width:100%;min-width:0;box-sizing:border-box}',
      /* settings page (settings.section): provider list on the left, the editor
         above on the right. The shell already owns the settings navigation and
         the scroll container, so this page adds no second chrome — only the
         column split, and every row keeps the official nav radius/height. */
      '.mcp{display:flex;flex-direction:column;gap:12px;min-width:0}',
      '.mcp-head{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;min-width:0}',
      '.mcp-title{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.mcp-intro{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);max-width:56ch}',
      '.mcp-tools{margin-left:auto;display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mcp-grid{display:grid;grid-template-columns:minmax(150px,180px) minmax(0,1fr);align-items:start;gap:0;min-width:0}',
      '.mcp-nav{display:flex;flex-direction:column;gap:2px;padding-right:10px;border-right:.5px solid var(--dsw-alias-border-l2);max-height:64vh;overflow:auto;min-width:0}',
      '.mcp-navRow{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;font-family:inherit;background:0 0;border:none;border-radius:var(--dsw-radius-md);padding:7px 10px;cursor:pointer;color:var(--dsw-alias-label-primary);min-width:0}',
      '.mcp-navRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.mcp-navRow.is-active{background:var(--dsw-alias-interactive-bg-active)}',
      '.mcp-navHead{display:flex;align-items:center;gap:6px;min-width:0}',
      '.mcp-dot{flex:none;width:7px;height:7px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-state-success-primary)}',
      '.mcp-dot.is-off{background:var(--dsw-alias-state-idle-primary)}',
      '.mcp-navName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px}',
      '.mcp-navModels{font-size:11px;line-height:17px;color:var(--dsw-alias-label-caption);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mcp-pane{padding-left:16px;min-width:0;max-height:64vh;overflow:auto}',
      '.mcp-empty{display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
      '.mcp-empty p{margin:0}',
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

    /* ── domain data (bridge contract) ── */
    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const LEVEL_LABEL = { off: '关', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
    const FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling'];
    const MAX_TOKEN_FIELDS = ['max_completion_tokens', 'max_tokens'];
    const CACHE_CONTROL_FORMATS = ['anthropic'];
    const THINKING_TOKEN_BUDGET_FIELDS = ['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens'];
    const VLLM_PRIORITY_MIN = -2147483648;
    const VLLM_PRIORITY_MAX = 2147483647;
    const INT_TEXT_RE = /^-?\d+$/;
    /**
     * 标准档位 — mirrors STANDARD_REASONING_EFFORTS in lib/index.js (asserted by
     * the Node regressions, which load both files). pi-ai has no named tier, so
     * this dict IS the tier: `off` offered with nothing sent on the wire, and
     * four literal effort spellings. Only these five of pi-ai's seven levels are
     * declared, because an absent key is pinned to "not offered" — a shorter
     * list is what keeps `minimal`/`xhigh` out of the picker for gateways that
     * do not know them.
     */
    const STANDARD_TIER = { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' };
    /* ── compat surface ──────────────────────────────────────────────────────
     * Mirrors the Host's COMPAT_FIELDS, which mirrors the `offer` half of
     * @deepseek-ai/dsh-llm-pi-ai 0.2.0-rc.2's `COMPAT_GATES` tables (the
     * runtime home of what earlier releases shipped as `catalog.d.ts`).
     * Fields the gates `withhold` are absent from both the compat schema and
     * this card, so they are deliberately not offered: selecting one could only
     * produce a write the adapter refuses. */
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
          if (!(level in STANDARD_TIER) || String(STANDARD_TIER[level] ?? '') !== String(value ?? '')) preset = false;
        }
        return { efforts, kind: preset ? 'preset' : 'custom' };
      }
      return { efforts, kind: 'unset' };
    }
    function normalizeModel(m) {
      const { efforts, kind } = effortsOf(m);
      return { id: String(m.id ?? ''), efforts, kind };
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
        // The Host's flag is authoritative when present: a catalog route sends
        // `hasModelsList: false` together with an EMPTY `models` array (the view
        // always carries the key), so falling back to `Array.isArray` would
        // report a list the route does not own — re-enabling the per-model
        // section and disabling the save on a route-level-only edit. The array
        // check remains only for a Host that omits the flag.
        hasModelsList: typeof profile.hasModelsList === 'boolean' ? profile.hasModelsList : Array.isArray(profile.models),
        reasoning: typeof profile.reasoning === 'string' ? profile.reasoning : 'unset',
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
        for (const [level, value] of Object.entries(STANDARD_TIER)) out[level] = value;
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
    const KIND_LABEL = { unset: '未设置', false: '禁用', preset: '标准档位', custom: '自定义' };
    /** Tag palettes per thinking-tier kind, so the summary reads without a legend. */
    const KIND_TONE = { unset: 'outline', false: 'neutral', preset: 'success', custom: 'info' };
    const TIER_MODE_OPTIONS = [
      { value: 'unset', label: '未设置' },
      { value: 'false', label: '禁用' },
      { value: 'preset', label: '标准档位' },
      { value: 'custom', label: '自定义' },
    ];

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

    /** One status line: official StateDot + text. */
    function Status({ state, text, error }) {
      const tone = error ? ' mc-statusError' : state === 'done' ? ' mc-statusDone' : '';
      return e('span', { className: 'mc-status' + tone },
        e(StateDot, { state, size: 10 }),
        text);
    }

    /** One official read-only capsule for a value the row is not editing. */
    function Badge({ tone, children }) {
      return e(Tag, { tone }, children);
    }

    /* ── main editor ── */

    function ModelCapabilities(props) {
      const providerId = props?.provider?.provider;
      const displayName = typeof props?.provider?.displayName === 'string' ? props.provider.displayName : providerId;
      const declared = props?.provider?.declared;
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

      /**
       * Commit the editor's current state. `override` lets one action (the
       * provider-level 标准档位 rollout) state the next snapshot and save it in
       * the same click, instead of staging it and asking for a second one. Every
       * other staged field rides along, so the click never silently drops a
       * draft; the ordinary save button calls it with no argument.
       */
      const apply = async (override) => {
        const current = override ?? snap;
        if (current === undefined) return;
        setBusy(true);
        setStatus({ state: 'ongoing', text: '保存中…' });
        try {
          // 'unset' clears, 'keep' leaves the stored value alone (see
          // buildCompatPatch): toggling one switch here can never drop a compat
          // field this build cannot represent.
          const compatPatch = buildCompatPatch(current.compat, current.compatKeep);
          const response = await fetch('/model-capabilities', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              provider: providerId,
              revision: current.revision,
              reasoning: current.reasoning === 'unset' ? null : current.reasoning,
              // Full-replace semantics on the Host; undefined (dropped by
              // JSON.stringify) leaves the stored dict untouched.
              headers: current.headersTouched ? headersPayload(current.headerRows) : undefined,
              compatPatch,
              // Modalities are owned by the official Models page: this payload
              // carries thinking tiers only, and the Host merges them per model.
              models: current.models.map((model) => ({
                id: model.id,
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

      /**
       * 标准档位 for the whole route: state the tier on every model, then commit
       * it in the same click. This is the one action the user asked to reach
       * "right of the provider name"; it deliberately covers models that are
       * currently 禁用 or 自定义 too, because "all of this provider" is the
       * promise the button makes.
       */
      const applyStandardTier = () => {
        if (snap === undefined || !snap.hasModelsList) return;
        void apply({
          ...snap,
          models: snap.models.map((model) => ({ ...model, kind: 'preset' })),
        });
      };

      /* ── render ── */
      // `...extra` is what the header's action area renders: the 标准档位
      // action, its progress note, and the reload control. Passing them as one
      // props object silently dropped all but the first.
      const head = (...extra) => e('div', { className: 'mc-head' },
        e('span', { className: 'mc-headName', title: providerId ?? '' }, displayName ?? ''),
        declared === true ? e(Badge, { key: 'declared', tone: 'outline' }, '自定义') : null,
        declared === false ? e(Badge, { key: 'declared', tone: 'outline' }, '目录') : null,
        displayName !== providerId ? e('span', { className: 'mc-route', title: providerId ?? '' }, providerId ?? '') : null,
        configured ? null : e(Pill, { key: 'draft' }, '草稿 — 官方卡片保存后生效'),
        e('span', { className: 'mc-headActions' }, extra));

      if (snap === undefined) {
        return e('div', { className: 'mc' },
          head(null),
          e('div', { className: 'mc-actions' },
            e(Status, { state: 'ongoing', text: status === undefined ? '加载中…' : '' }),
            status !== undefined && status.text !== '' ? e('span', { key: 'e', className: 'mc-status mc-statusError' }, status.text) : null,
            e(Button, { key: 'r', variant: 'outline', size: 'sm', onClick: () => { void load(); } }, '重新加载')));
      }
      // A catalog route stores no models list, but it still owns the route-level
      // fields (default reasoning, headers, compat). Only the per-model section
      // is unavailable there — previously the whole editor gave up, which made a
      // catalog route's headers uneditable.
      const perModel = snap.hasModelsList;
      const standardCount = snap.models.filter((model) => model.kind === 'preset').length;
      const modelCount = snap.models.length;
      const allStandard = perModel && modelCount > 0 && standardCount === modelCount;

      /* header rows + derived state */
      const opencodeDetected = isOpencodeRoute(providerId, snap.baseURL);
      const headerError = headerRowsError(snap.headerRows);

      const parts = [];
      parts.push(e('div', { key: 'head' }, head(
        perModel
          ? e(Button, {
            key: 'tier',
            variant: 'outline',
            size: 'sm',
            disabled: busy,
            title: '把该提供方全部模型的思考强度设为标准档位（未设置 / 禁用 / 自定义都会被覆盖），并立即应用',
            onClick: applyStandardTier,
          },
            IconTier === undefined ? null : e(IconTier, { size: 14 }),
            '标准档位')
          : null,
        perModel ? e('span', { key: 'tierState', className: 'mc-note' }, allStandard ? `全部 ${modelCount} 个模型已是标准档位` : `已是标准档位 ${standardCount}/${modelCount}`) : null,
        e(Button, { key: 'reload', variant: 'outline', size: 'sm', disabled: busy, onClick: () => { void load({ silent: true }); } },
          IconRefresh === undefined ? null : e(IconRefresh, { size: 14 }), '刷新'))));

      /* provider-level: the default thinking effort the model picker starts from */
      parts.push(e('section', { key: 'provider', className: 'mc-card' },
        e('h3', { className: 'mc-cardTitle' }, '提供方默认值'),
        e('div', { className: 'mc-fields' },
          e('label', { className: 'mc-field' },
            e('span', { className: 'mc-fieldLabel' }, '默认思考强度'),
            e('span', { className: 'mc-fieldControl' },
              e(Select, {
                value: snap.reasoning,
                options: [{ value: 'unset', label: '未设置' }].concat(LEVELS.map((level) => ({ value: level, label: `${LEVEL_LABEL[level]} (${level})` }))),
                onChange: (value) => setSnap((current) => current === undefined ? current : ({ ...current, reasoning: value })),
              }))),
          e('div', { className: 'mc-field' },
            e('span', { className: 'mc-fieldLabel' }, '支持模态'),
            e('span', { className: 'mc-fieldControl' },
              e('span', { className: 'mc-note' }, '由官方 Models 页的「输入类型」维护，本页不再重复编辑'))))));

      /* models — only a route that stores its own list has per-model rows */
      if (perModel) {
        parts.push(e('section', { key: 'models', className: 'mc-card' },
          e('h3', { className: 'mc-cardTitle' }, `模型思考档位（${modelCount}）`),
          modelCount === 0 ? e('div', { className: 'mc-note' }, '该提供方还没有模型，先在官方 Models 页添加。') : null,
          snap.models.map((model, index) => e(DisclosureRow, {
            key: `model-${index}`,
            title: model.id,
            open: openModels.has(index),
            expandable: true,
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: () => toggleModel(index),
            titleClassName: 'mc-modelTitle',
            icon: IconThink === undefined ? null : e(IconThink, { size: 16 }),
            collapsedContent: e('span', { className: 'mc-modelSummary' },
              e(Badge, { tone: KIND_TONE[model.kind] ?? 'outline' }, KIND_LABEL[model.kind] ?? model.kind)),
            children: e('div', { className: 'mc-modelBody' },
              e('div', { className: 'mc-field' },
                e('span', { className: 'mc-fieldLabel' }, '思考强度'),
                e('span', { className: 'mc-fieldControl' },
                  e(Select, {
                    value: model.kind,
                    options: TIER_MODE_OPTIONS,
                    onChange: (value) => patchModel(index, (m) => ({ ...m, kind: value })),
                  }),
                  model.kind === 'preset' ? e('span', { className: 'mc-note' }, 'off / low / medium / high / max') : null)),
              model.kind === 'custom' ? e('div', { className: 'mc-effortGrid' },
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
      }

      /* compat (collapsed by default) — scalar offer fields; the two offered
         dictionaries remain unrendered and are preserved by the Host. */
      const compat = snap.compat;
      const compatKeep = new Set(snap.compatKeep ?? []);
      const compatHidden = snap.compatHidden ?? [];
      const keepOption = (key, options) => compatKeep.has(key) ? [{ value: KEEP, label: KEEP_LABEL }].concat(options) : options;
      const boolField = (field) => e('label', { className: 'mc-field', key: `compat-${field.key}` },
        e('span', { className: 'mc-fieldLabel' }, field.label),
        e('span', { className: 'mc-fieldControl' },
          e(Select, {
            value: String(compat[field.key]),
            options: keepOption(field.key, [{ value: 'unset', label: '不设置' }, { value: 'true', label: field.on ?? '支持' }, { value: 'false', label: field.off ?? '不支持' }]),
            onChange: (value) => setCompat(field.key, value === 'true' ? true : value === 'false' ? false : value),
          })));
      const enumField = (field) => e('label', { className: 'mc-field', key: `compat-${field.key}` },
        e('span', { className: 'mc-fieldLabel' }, field.label),
        e('span', { className: 'mc-fieldControl' },
          e(Select, {
            value: compat[field.key],
            options: keepOption(field.key, [{ value: 'unset', label: '不设置' }].concat(field.values.map((value) => ({ value, label: value })))),
            onChange: (value) => setCompat(field.key, value),
          })));
      const intField = (field) => {
        const problem = intTextError(compat[field.key]);
        return e('label', { className: 'mc-field', key: `compat-${field.key}` },
          e('span', { className: 'mc-fieldLabel' }, field.label),
          e('span', { className: 'mc-fieldControl' },
            e(Input, {
              className: 'mc-effortInput',
              value: compat[field.key],
              placeholder: compatKeep.has(field.key) ? KEEP_LABEL : '留空=不设置，可 0 / 负',
              'aria-label': `${field.label}（整数，留空表示不设置）`,
              onChange: (event) => setCompat(field.key, event.target.value),
            }),
            compatKeep.has(field.key) ? e('span', { className: 'mc-note' }, KEEP_LABEL) : null,
            compatKeep.has(field.key) ? e(Button, { variant: 'outline', size: 'sm', onClick: () => setCompat(field.key, '') }, '清除') : null),
          problem === null ? null : e('span', { className: 'mc-status mc-statusError' }, problem));
      };
      const compatSetCount = COMPAT_BOOL_KEYS.concat(COMPAT_ENUMS.map((field) => field.key), COMPAT_INT_KEYS)
        .filter((key) => compatKeep.has(key) || (compat[key] !== undefined && compat[key] !== 'unset' && compat[key] !== '')).length;
      parts.push(e('div', { key: 'compat' },
        e(DisclosureRow, {
          icon: IconCompat === undefined ? null : e(IconCompat, { size: 16 }),
          title: '兼容设置 · 网关 400 修复',
          open: openCompat,
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          onToggle: () => setOpenCompat((value) => !value),
          collapsedContent: e('span', { className: 'mc-note mc-collapsed' },
            `pi-ai 可配置开关 ${COMPAT_BOOL_KEYS.length + COMPAT_ENUMS.length + COMPAT_INT_KEYS.length} 项${compatSetCount === 0 ? '' : ` · 已设置 ${compatSetCount}`}`),
          children: e('div', { className: 'mc-modelBody' },
            e('div', { className: 'mc-fields' },
              COMPAT_BOOL_FIELDS.map(boolField).concat(COMPAT_ENUMS.map(enumField), COMPAT_INT_FIELDS.map(intField))),
            e('div', { className: 'mc-note' },
              '“不设置”清除该键；“保持原样”不修改。未渲染字典、withhold 与未知字段在合并时保留；保存仍受 pi-ai 校验，非法现有值可能导致拒绝。'),
            compatHidden.length === 0 ? null : e('div', { className: 'mc-note' },
              `另有 ${compatHidden.length} 个字段已配置但本卡片不展示（保存时原样保留）：${compatHidden.map((entry) => entry.key).join('、')}`)),
        })));

      /* request headers (collapsed by default) — static custom headers */
      parts.push(e('div', { key: 'headers' },
        e(DisclosureRow, {
          icon: IconHeaders === undefined ? null : e(IconHeaders, { size: 16 }),
          title: '请求头',
          open: openHeaders,
          expandable: true,
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          onToggle: () => setOpenHeaders((value) => !value),
          collapsedContent: e('span', { className: 'mc-note mc-collapsed' },
            snap.headerRows.length === 0 ? '未设置' : `已设置 ${snap.headerRows.length} 个（${snap.headerRows.map((row) => row.name || '?').join(', ')}）`),
          children: e('div', { className: 'mc-modelBody' },
            opencodeDetected ? e('div', { className: 'mc-note' },
              'opencode 官方要求（opencode.ai/docs/go）：Go 套餐请求应携带 x-opencode-session（会话亲和、优化 prompt caching），否则账号可能被标记。在下方自建 x-opencode-session 行并填一个固定值即可（稳定的不透明标识，同安装内一致）。DSH 已发送真实归属 User-Agent，无需伪装 opencode 客户端。')
              : null,
            snap.headerRows.map((row, index) => e('div', { className: 'mc-headerRow', key: `hdr-${index}` },
              e(Input, { className: 'mc-headerName', value: row.name, placeholder: 'x-custom-header', 'aria-label': `请求头第 ${index + 1} 行名称`, onChange: (event) => editHeaderRow(index, { name: event.target.value }) }),
              e(Input, { className: 'mc-headerValue', value: row.value, placeholder: '值', 'aria-label': `请求头第 ${index + 1} 行值`, onChange: (event) => editHeaderRow(index, { value: event.target.value }) }),
              e(Button, { variant: 'outline', size: 'sm', onClick: () => removeHeaderRow(index) }, '删除'))),
            e('div', { className: 'mc-headerRow' },
              e(Button, { variant: 'outline', size: 'sm', onClick: addHeaderRow }, '添加请求头'),
              e('span', { className: 'mc-note' }, '按需手动添加，值原样发送；名称写入时统一为小写；user-agent 不可设置（DSH 归属头占用）'))),
        })));

      if (!perModel) {
        parts.push(e('p', { key: 'no-models', className: 'mc-note' },
          '该提供方使用内置目录模型，没有可写的 models 清单，因此不提供逐模型档位。上面的默认思考强度、请求头与兼容设置同样适用于它的所有模型；需要逐模型档位时，在官方编辑器里自定义模型目录。'));
      }

      const compatIntError = intTextError(compat.vllmPriority);
      // A route without a stored list has no per-model rows to validate, and its
      // save must not be disabled by model-count gates.
      const invalid = (perModel && (snap.models.some((model) => model.kind === 'custom' && !effortValid(model))
        || modelCount === 0
        || snap.models.some((model) => model.id.trim() === ''))) || headerError !== null || compatIntError !== null;
      parts.push(e('div', { key: 'actions', className: 'mc-actions' },
        e(Button, {
          variant: 'primary',
          size: 'sm',
          disabled: busy || invalid,
          onClick: () => { void apply(); },
        }, busy ? '保存中…' : '应用能力配置'),
        invalid ? e('span', { className: 'mc-status mc-statusError' }, headerError !== null ? headerError : compatIntError !== null ? `vllmPriority ${compatIntError}` : perModel && modelCount === 0 ? '该提供方没有模型' : '自定义档位有勾选但线上值为空') : null,
        status !== undefined ? e(Status, { state: status.state, text: status.text, error: status.error }) : null));

      return e('div', { className: 'mc' }, ...parts);
    }

    /* ── settings page ───────────────────────────────────────────────────────
     * The official Models page owns provider/model creation AND the accepted
     * modalities. Two gaps remain that this page serves: a CATALOG route stores
     * no models list, so the official editor never reaches the route-level
     * fields it still owns, and the thinking tiers have no editor anywhere
     * (0.2.0's Models page deliberately leaves reasoning effort to the model).
     *
     * Left column: every pi-ai route with its identity and 标准档位 progress;
     * right pane: the editor above, so one implementation serves both. The
     * shell already owns the settings navigation, so the column split stays
     * narrow and the editor keeps the rest of the width. */

    function ModelCapabilitiesPage() {
      const [index, setIndex] = React.useState(undefined);
      const [selected, setSelected] = React.useState(undefined);
      const [showAll, setShowAll] = React.useState(false);
      const [status, setStatus] = React.useState(undefined);

      const loadIndex = async () => {
        try {
          const response = await fetch('/model-capabilities/providers', { credentials: 'same-origin' });
          const json = await response.json().catch(() => null);
          if (!json || json.ok !== true) {
            setStatus({ state: 'error', text: String((json && json.error) || 'load-failed'), error: true });
            setIndex([]);
            return;
          }
          setStatus(undefined);
          const rows = Array.isArray(json.providers) ? json.providers : [];
          setIndex(rows);
          // Keep the current selection when it still exists; otherwise open on
          // something worth showing. The list is alphabetical, so its first row
          // is almost always an unconfigured catalog route — which the editor
          // answers with `provider-not-found`, a bad first impression. Prefer a
          // configured custom route, then any configured route, then the first
          // row so the pane is never empty when routes exist.
          const firstConfigured = (pick) => rows.find((row) => row.configured && pick(row));
          const preferred = firstConfigured((row) => row.declared)
            ?? firstConfigured(() => true)
            ?? rows[0];
          setSelected((current) => (rows.some((row) => row.provider === current) ? current : preferred?.provider));
        } catch (error) {
          setStatus({ state: 'error', text: String(error), error: true });
          setIndex([]);
        }
      };
      React.useEffect(() => { void loadIndex(); }, []);

      if (index === undefined) {
        return e('div', { className: 'mcp' },
          e('h2', { className: 'mcp-title' }, '模型能力'),
          e(Status, { state: 'ongoing', text: '加载中…' }));
      }

      const rows = index;
      const active = rows.find((row) => row.provider === selected);
      const configuredCount = rows.filter((row) => row.configured).length;
      // An unconfigured route has no stored profile, so the editor would answer
      // the GET with `provider-not-found`. Hide those by default: the shipped
      // catalog contributes ~40 of them, which buries the routes a user actually
      // owns. The toggle keeps them reachable for inspection.
      const visibleRows = showAll ? rows : rows.filter((row) => row.configured);

      const nav = e('nav', { className: 'mcp-nav' },
        visibleRows.length === 0 && rows.length > 0 ? e('div', { className: 'mcp-empty' }, '没有已配置的提供方，切到「全部」查看可选路由。') : null,
        visibleRows.map((row) => {
          const modelCount = Number(row.modelCount) || 0;
          const standardCount = Number(row.standardCount) || 0;
          return e('button', {
            key: row.provider,
            type: 'button',
            className: 'mcp-navRow' + (row.provider === selected ? ' is-active' : ''),
            'aria-current': row.provider === selected ? 'true' : undefined,
            onClick: () => setSelected(row.provider),
          },
            e('span', { className: 'mcp-navHead' },
              e('span', { className: 'mcp-dot' + (row.configured ? '' : ' is-off') }),
              e('span', { className: 'mcp-navName' }, row.displayName || row.provider),
              row.declared ? e(Tag, { tone: 'outline' }, '自定义') : e(Tag, { tone: 'outline' }, '目录'),
              modelCount > 0 && standardCount === modelCount ? e(Tag, { tone: 'success' }, '标准档位') : null),
            // A second line names the models so the pane is useful before a click.
            e('span', { className: 'mcp-navModels' },
              row.hasModelsList
                ? ((Array.isArray(row.modelIds) ? row.modelIds : []).length === 0 ? '无模型' : row.modelIds.join('、'))
                : '内置目录模型'));
        }));

      return e('div', { className: 'mcp' },
        e('div', { className: 'mcp-head' },
          e('div', {},
            e('h2', { className: 'mcp-title' }, '模型能力'),
            e('p', { className: 'mcp-intro' },
              '为每个 llm-pi-ai 提供方设置思考档位、请求头与网关兼容开关。支持模态由官方 Models 页的「输入类型」维护；点提供方名字右侧的「标准档位」可一键把该提供方全部模型设为标准档位。')),
          e('div', { className: 'mcp-tools' },
            e(SegmentedControl, {
              id: 'mcp-filter',
              value: showAll ? 'all' : 'configured',
              options: [
                { value: 'configured', label: `已配置 ${configuredCount}` },
                { value: 'all', label: `全部 ${rows.length}` },
              ],
              onChange: (value) => setShowAll(value === 'all'),
              label: '提供方筛选',
            }),
            e(Button, { variant: 'outline', size: 'sm', onClick: () => { void loadIndex(); } }, '刷新列表'),
            status !== undefined ? e(Status, { state: status.state, text: status.text, error: status.error }) : null)),
        rows.length === 0
          ? e('div', { className: 'mcp-empty' }, e('p', {}, '没有可配置的提供方。'))
          : e('div', { className: 'mcp-grid' },
            nav,
            e('div', { className: 'mcp-pane' },
              active === undefined
                ? e('div', { className: 'mcp-empty' }, e('p', {}, '从左侧选择一个提供方。'))
                // An unconfigured catalog route has no stored profile, so the
                // editor has nothing to read. Say that plainly instead of letting
                // its GET fail into a `provider-not-found` error, and point at the
                // official page where such a route gets configured.
                : active.configured !== true
                  ? e('div', { className: 'mcp-empty' },
                    e('p', { key: 'a' }, `「${active.displayName || active.provider}」尚未配置，没有可编辑的设置。`),
                    e('p', { key: 'b' }, '在官方 Models 页添加或配置这个提供方后，回到这里即可编辑它的思考档位、请求头与兼容开关。'))
                  // The editor is the single implementation: give it the provider
                  // identity the page already has. `key` forces a fresh mount per
                  // route so a cached view never bleeds across providers.
                  : e(ModelCapabilities, {
                    key: active.provider,
                    provider: {
                      provider: active.provider,
                      displayName: active.displayName,
                      declared: active.declared,
                    },
                    configured: active.configured,
                  }))));
    }

    const inject = ['slots'];

    function apply(ctx) {
      const style = mountStyles();
      ctx.effect(() => {
        return () => {
          if (style !== null && style.parentNode !== null) style.remove();
        };
      });
      // One surface only: the settings page below. The inline
      // `settings.models.provider-card` cell was removed once the page could
      // reach every route — two places editing the same fields invited drift,
      // and the card could never render during a custom provider's creation
      // anyway (the official custom branch mounts no such slot).
      //
      // Registration contract re-checked against the live 0.2.0-rc.2 slot tree
      // (kind list, scope root, `{ id, order, label }` registrant options; owner
      // props are `{ close }`, unused here): a fresh id adds a section beside
      // account(-10) / general(0) / models(10) / plugins(15) / agent-presets(20).
      // The label is a plain string, matching this bundle's other copy — a
      // locale dependency would have to be a hard `inject` and would break a
      // profile without it.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'model-capabilities',
        order: 16,
        label: '模型能力',
      }, ModelCapabilitiesPage));
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
      ModelCapabilitiesPage,
      Select,
      KEEP_LABEL,
      buildCompatPatch,
      intTextError,
      KEEP,
      STANDARD_TIER,
      KIND_LABEL,
      KIND_TONE,
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
