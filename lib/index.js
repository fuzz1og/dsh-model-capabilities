/**
 * dsh-model-capabilities — host half.
 *
 * Same-origin HTTP bridge for the browser half (the pattern the
 * dsh-font-settings bundle uses): a third-party bundle cannot rely on the
 * generated `ctx.remote.settings` wire, so this Host face owns
 * read-modify-write against the `llm-pi-ai` settings namespace and exposes two
 * small JSON routes:
 *
 *   GET  /model-capabilities?provider=<route>  → view of one provider's models,
 *        thinking tiers, request headers and baseURL, with the namespace
 *        revision for fencing.
 *   POST /model-capabilities                   → merge thinking-tier edits into
 *        the provider's models plus route-level reasoning / compat / headers,
 *        and persist through settings.mutate (revision-fenced, pi-ai
 *        schema-validated).
 *
 * Accepted modalities (`models[].input`, `defaultInput`) are NOT part of this
 * surface: dsh 0.2.0's own Models page edits input types per model
 * ("Input types" → pi-ai `input`), so a second editor here could only drift
 * from the owner. This bridge neither reads nor writes them.
 *
 * Request headers are static per provider (the pi-ai schema's
 * `providers.<route>.headers`, Fetch-validated, merged last by
 * `requestHeaders(profile.headers)`). The harness attribution User-Agent
 * (`deepseek-harness/…`) satisfies opencode's "properly identifies itself"
 * requirement and stays reserved — user-set headers may not override it. A
 * fixed `x-opencode-session` value can be set like any other header; the
 * per-session dynamic injection this plugin once carried was removed in
 * 0.6.0 (opencode Go no longer in use).
 *
 * Data owner remains the pi-ai adapter's `llm-pi-ai` namespace; nothing is
 * owned here. Both handlers run in the Host realm, so ordinary plain objects
 * pass the settings service's prototype checks.
 *
 * Compatibility target: dsh 0.1.7-alpha.1. `settings.get(ns)` was removed in
 * that release — a namespace is the profile entry's own Config now — so reads
 * go through `describe()` (see readNamespace). `settings.mutate(ns, ops,
 * revision)` survives unchanged and stays the only write path.
 */
/**
 * No hard service dependencies. The HTTP bridge runs in a child fiber started
 * with `ctx.inject(['webServer'], …)`, so a headless/tui profile that never
 * provides a web server still loads this entry instead of failing the whole
 * profile boot on a pending `webServer` requirement.
 */
export const inject = [];

const NS = 'llm-pi-ai';
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/**
 * 标准档位 — the one thinking-tier declaration this plugin writes by itself.
 *
 * pi-ai has no notion of a named tier: `reasoningEfforts` is a per-model dict
 * whose keys are the offered levels and whose values are the wire spellings
 * dispatch sends. So "标准档位" is expanded here into exactly this dict, by the
 * auto-injector below for a model that declares nothing, and by the settings
 * page's provider-level 标准档位 button for every model of a route.
 *
 * Two properties matter:
 *
 * - `off` maps to `null` (level offered, nothing sent on the wire) and every
 *   other level to its own name, the literal effort spelling every
 *   OpenAI-compatible gateway understands. Only five of pi-ai's seven levels
 *   are declared: an absent key is pinned to `null` by `resolveModelReasoning`
 *   ("not offered"), so the key set IS the offered set and a gateway is never
 *   handed a `minimal`/`xhigh` spelling it may not know.
 * - The key order is fixed (`off,low,medium,high,max`) and is what the whole
 *   tier is compared against, so "already standard" is decidable by value — the
 *   page uses that to show which providers are already on the standard tier.
 *
 * dsh 0.1.7 gives `contextWindow`, `maxTokens` and `input` a route-level
 * fallback (`entry.x ?? base?.x ?? request.defaultX` in the pi-ai adapter) but
 * gives `reasoningEfforts` NO third level: an omitted value resolves through
 * `base?.reasoning ?? false`, so a *declared* route — a gateway the installed
 * catalog does not describe, which is exactly what the official Models page
 * creates — ends up offering only `off`, and the route-level `reasoning` has
 * nothing to select from (`describableReasoningLevel` drops an unsupported
 * effort). The capability the official editor cannot set is therefore also the
 * one it cannot inherit, which is why the injector below writes it.
 */
const STANDARD_REASONING_EFFORTS = { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' };
/** Idempotence marker: the exact key order this bridge writes. */
const STANDARD_REASONING_KEYS = Object.keys(STANDARD_REASONING_EFFORTS).join(',');
const THINKING_FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling'];
const MAX_TOKEN_FIELDS = ['max_completion_tokens', 'max_tokens'];
/** pi-ai `CACHE_CONTROL_FORMATS` (unchanged through 0.2.0-rc.2) — the only value upstream declares. */
const CACHE_CONTROL_FORMATS = ['anthropic'];
/** pi-ai `THINKING_TOKEN_BUDGET_FIELDS` (unchanged through 0.2.0-rc.2). */
const THINKING_TOKEN_BUDGET_FIELDS = ['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens'];
/**
 * vLLM's scheduler `priority` is an engine-side native int and pi-ai's own
 * schema only demands an integer (`z.number().step(1)`), so these bounds are
 * this bridge's guard against a typo'd magnitude rather than an upstream
 * limit. 0 and negatives are legitimate ("lower runs earlier").
 */
const VLLM_PRIORITY_MIN = -2147483648;
const VLLM_PRIORITY_MAX = 2147483647;

/**
 * The compat surface this bridge validates and the page renders — one row per
 * field, deliberately data rather than a hand-maintained name list so the
 * three consumers (cleanCompat, the POST merge, the client's mirror) cannot
 * drift from one another.
 *
 * Mirrors the union of the five `*_COMPAT_GATE` tables in
 * `@deepseek-ai/dsh-llm-pi-ai` (0.2.0-rc.2: `COMPAT_GATES` in its
 * `lib/index.js` — the runtime home of what earlier releases shipped as
 * `lib/types/catalog.d.ts`): every field they mark `offer` (together with the
 * two offered dictionaries in COMPAT_UNDISPLAYED_KEYS), which is exactly the
 * key set of the adapter's `compatProfile` Schemastery schema. A field the
 * gates `withhold` is in neither, and writing one is refused by
 * `assertOfferedCompatFields` ("not configurable here: pi-ai's installed
 * catalog sets it for the vendors that need it"), so offering it in this UI
 * could only produce failed saves.
 *
 * `kind` selects the control and the validator: `bool` a tri-state switch
 * (true / false / clear), `enum` a closed dropdown, `int` a bounded integer.
 */
const COMPAT_FIELDS = [
  { key: 'supportsStore', kind: 'bool' },
  { key: 'supportsDeveloperRole', kind: 'bool' },
  { key: 'supportsReasoningEffort', kind: 'bool' },
  { key: 'supportsUsageInStreaming', kind: 'bool' },
  { key: 'supportsFinishReason', kind: 'bool' },
  { key: 'requiresToolResultName', kind: 'bool' },
  { key: 'requiresAssistantAfterToolResult', kind: 'bool' },
  { key: 'requiresThinkingAsText', kind: 'bool' },
  { key: 'requiresReasoningContentOnAssistantMessages', kind: 'bool' },
  { key: 'supportsThinkingTokenBudget', kind: 'bool' },
  { key: 'supportsStrictMode', kind: 'bool' },
  { key: 'supportsLongCacheRetention', kind: 'bool' },
  { key: 'supportsMaxOutputTokens', kind: 'bool' },
  { key: 'supportsEagerToolInputStreaming', kind: 'bool' },
  { key: 'supportsCacheControlOnTools', kind: 'bool' },
  { key: 'supportsTemperature', kind: 'bool' },
  { key: 'forceAdaptiveThinking', kind: 'bool' },
  { key: 'allowEmptySignature', kind: 'bool' },
  { key: 'supportsStrictTools', kind: 'bool' },
  { key: 'maxTokensField', kind: 'enum', values: MAX_TOKEN_FIELDS },
  { key: 'thinkingFormat', kind: 'enum', values: THINKING_FORMATS },
  { key: 'thinkingTokenBudgetField', kind: 'enum', values: THINKING_TOKEN_BUDGET_FIELDS },
  { key: 'cacheControlFormat', kind: 'enum', values: CACHE_CONTROL_FORMATS },
  { key: 'vllmPriority', kind: 'int' },
];
const COMPAT_BOOL_KEYS = COMPAT_FIELDS.filter((field) => field.kind === 'bool').map((field) => field.key);
const COMPAT_ENUM_FIELDS = COMPAT_FIELDS.filter((field) => field.kind === 'enum');
const COMPAT_INT_KEYS = COMPAT_FIELDS.filter((field) => field.kind === 'int').map((field) => field.key);
/**
 * Offered by the gates but not rendered by this card: both are
 * `Record<string, ChatTemplateKwargValue>` dictionaries, so they need a
 * key/value editor this card does not carry. They are preserved verbatim and
 * reported through `compatHidden`, never treated as absent.
 */
const COMPAT_UNDISPLAYED_KEYS = ['chatTemplateArgs', 'chatTemplateKwargs'];
/**
 * Every field some gate marks `withhold`. Listed only so a hand-edited
 * cordis.patch.yml carrying one is recognised as "present, not configurable
 * here" instead of looking like an unknown key.
 *
 * Re-audited against @deepseek-ai/dsh-llm-pi-ai 0.2.0-rc.2 (`COMPAT_GATES` in
 * its `lib/index.js`, the runtime home of what used to be `catalog.d.ts`): the
 * union of withheld fields is now fourteen names. `deferredToolsMode` and
 * `supportsToolReferences` no longer appear in any gate, and three
 * mid-conversation switches are new — a stored one of either kind is reported
 * as `unknown`, not as withheld, which is what the installed adapter would say
 * about it too.
 */
const COMPAT_WITHHELD_KEYS = ['allowedFallbackModels', 'openRouterRouting', 'sendSessionAffinityHeaders', 'sessionAffinityFormat', 'supportsAdditionalTools', 'supportsExplicitPromptCacheMode', 'supportsMidConvoEffort', 'supportsMidConvoSystemMessages', 'supportsMidConvoToolAdditions', 'supportsMidConvoToolChanges', 'supportsOpenAIGrammarTools', 'supportsToolSearch', 'vercelGatewayRouting', 'zaiToolStream'];
const COMPAT_UNDISPLAYED = new Set(COMPAT_UNDISPLAYED_KEYS);
const COMPAT_WITHHELD = new Set(COMPAT_WITHHELD_KEYS);
/** Headers the harness attribution owns; the pi-ai adapter drops them from profile headers. */
const RESERVED_HEADERS = new Set(['user-agent']);
/** RFC 9110 field-name token characters (lowercased before the test). */
const HEADER_NAME_RE = /^[a-z0-9!#$%&'*+\-.^_`|~]+$/;
const MAX_HEADER_VALUE_CHARS = 512;
const MAX_BODY_BYTES = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(error);
    };
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) fail(new Error('request body too large'));
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(data);
    });
    req.on('error', (error) => fail(error));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);}

function cleanEfforts(value) {
  if (value === false) return false;
  if (typeof value !== 'object' || value === null) return null;
  const next = {};
  for (const level of LEVELS) if (value[level] !== undefined) next[level] = value[level];
  return Object.keys(next).length === 0 ? null : next;
}

/**
 * Project rendered keys, not their accepted values. Presence must survive the
 * JSON bridge even when a stored value is unrepresentable: the client then
 * selects KEEP rather than mistaking a filtered key for an explicit unset.
 * Non-rendered keys stay on the Host and are named by hiddenCompatKeys.
 */
function cleanCompat(value) {
  if (typeof value !== 'object' || value === null) return null;
  const next = {};
  for (const { key } of COMPAT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) next[key] = value[key] ?? null;
  }
  return Object.keys(next).length === 0 ? null : next;
}

/**
 * Compat keys stored on the profile that this card does not render, with the
 * reason — so the browser half can say "present but not shown" instead of
 * optimistically assuming the stored dict holds nothing else.
 */
function hiddenCompatKeys(value) {
  if (typeof value !== 'object' || value === null) return [];
  const displayed = new Set(COMPAT_FIELDS.map((field) => field.key));
  return Object.keys(value).filter((key) => !displayed.has(key)).sort().map((key) => ({
    key,
    reason: COMPAT_WITHHELD.has(key) ? 'withheld' : COMPAT_UNDISPLAYED.has(key) ? 'not-rendered' : 'unknown',
  }));
}

/**
 * A bounded integer from a JSON number or a trimmed decimal string, else null.
 * `NaN`/`Infinity` fail the finite test, and `null` (where `JSON.stringify`
 * puts a `NaN`) matches no branch — so an invalid value is refused rather than
 * written into settings.
 */
function compatIntOf(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= VLLM_PRIORITY_MIN && value <= VLLM_PRIORITY_MAX ? value : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^-?\d+$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed >= VLLM_PRIORITY_MIN && parsed <= VLLM_PRIORITY_MAX ? parsed : null;
  }
  return null;
}

/**
 * Merge one client `compatPatch` onto a copy of the stored compat dict,
 * returning `{ ok: true, compat }` or `{ ok: false, error }`.
 *
 * Never a whitelist filter: the copy is what gets written back, so keys this
 * card does not render survive untouched. An entry missing from the patch, or
 * the explicit `'keep'` the client sends for a stored value its controls
 * cannot represent, is a no-op — which is what makes "toggle one unrelated
 * switch" unable to clear any other field. `'unset'` (or an empty string on
 * an integer field) is the only way to clear a key.
 */
function applyCompatPatch(stored, patch) {
  const compat = typeof stored === 'object' && stored !== null ? { ...stored } : {};
  const edits = typeof patch === 'object' && patch !== null ? patch : {};
  for (const key of COMPAT_BOOL_KEYS) {
    const incoming = edits[key];
    if (incoming === true || incoming === false) compat[key] = incoming;
    else if (incoming === 'unset') delete compat[key];
    else if (incoming !== undefined && incoming !== 'keep') {
      return { ok: false, error: `invalid ${key}: expected true, false or "unset"` };
    }
  }
  for (const field of COMPAT_ENUM_FIELDS) {
    const incoming = edits[field.key];
    if (field.values.includes(incoming)) compat[field.key] = incoming;
    else if (incoming === 'unset') delete compat[field.key];
    else if (incoming !== undefined && incoming !== 'keep') {
      return { ok: false, error: `invalid ${field.key}: expected one of ${field.values.join(', ')} or "unset"` };
    }
  }
  for (const key of COMPAT_INT_KEYS) {
    const incoming = edits[key];
    if (incoming === undefined || incoming === 'keep') continue;
    if (incoming === 'unset' || (typeof incoming === 'string' && incoming.trim() === '')) {
      delete compat[key];
      continue;
    }
    const parsed = compatIntOf(incoming);
    if (parsed === null) {
      return { ok: false, error: `invalid ${key}: expected an integer within [${VLLM_PRIORITY_MIN}, ${VLLM_PRIORITY_MAX}], or "" / "unset" to clear it` };
    }
    compat[key] = parsed;
  }
  return { ok: true, compat };
}

/** The profile's request-header dict, names lowercased for case-insensitive views. */
function cleanHeaders(value) {
  if (typeof value !== 'object' || value === null) return null;
  const next = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== 'string') continue;
    next[name.toLowerCase()] = headerValue;
  }
  return Object.keys(next).length === 0 ? null : next;
}


/**
 * One provider's thinking-tier view + the namespace revision it was read at.
 *
 * Modalities are deliberately absent (see the file header): dsh 0.2.0's Models
 * page owns `input`/`defaultInput`, so this view carries only what that page
 * cannot edit — the per-model thinking tiers, the route's default thinking
 * level, the request headers and the compat switches.
 */
function viewOf(profile, revision) {
  const out = {
    ok: true,
    revision,
    hasModelsList: Array.isArray(profile.models),
    reasoning: typeof profile.reasoning === 'string' && LEVELS.includes(profile.reasoning) ? profile.reasoning : null,
    compat: cleanCompat(profile.compat),
    compatHidden: hiddenCompatKeys(profile.compat),
    baseURL: typeof profile.baseURL === 'string' ? profile.baseURL : null,
    headers: cleanHeaders(profile.headers),
    models: [],
  };
  if (Array.isArray(profile.models)) {
    out.models = profile.models.map((model) => ({
      id: String(model?.id ?? ''),
      name: typeof model?.name === 'string' ? model.name : null,
      contextWindow: typeof model?.contextWindow === 'number' ? model.contextWindow : null,
      maxTokens: typeof model?.maxTokens === 'number' ? model.maxTokens : null,
      reasoningEfforts: cleanEfforts(model?.reasoningEfforts),
      compat: model?.compat && typeof model.compat === 'object' ? model.compat : null,
    }));
  }
  return out;
}

/**
 * Read one settings namespace's live value and revision.
 *
 * `settings.get(ns)` was removed in dsh 0.1.7-alpha.1: a settings namespace is
 * no longer a separate document a plugin can address, it is the profile
 * entry's own Config. `describe()` is the surviving in-process read — it
 * projects each active entry's live Config references (volatile `providers`
 * included) into `{ ns, value, revision }` descriptors, unredacted when called
 * without options.
 *
 * One call yields both the value and the fence. That also removes the stale
 * fence the previous event-cached revision map could replay: the revision now
 * always comes from the same read that produced the value it describes. The
 * cost is one `describe()` per bridge request (the Models page opens one card
 * per provider), which is forced by the removed API rather than chosen.
 *
 * @param settings - the mounted settings service.
 * @returns the namespace's live value and revision; `value` is undefined when
 *   the entry is not active (a composition without `llm-pi-ai`).
 */
function readNamespace(settings) {
  const descriptor = settings.describe().find((row) => String(row.ns) === NS);
  return {
    value: descriptor === undefined ? undefined : descriptor.value,
    revision: descriptor === undefined ? 0 : Number(descriptor.revision) || 0,
  };
}

/**
 * Whether a stored `reasoningEfforts` value already decides the tiers.
 *
 * Anything the pi-ai schema accepts as a declaration counts as decided, and is
 * never overwritten: `false` means "not a reasoning model" and an object —
 * including `{}`, which pi-ai rejects as an empty declaration rather than
 * reading as absent — is an author's own level list. Only a genuinely absent
 * field is back-filled, so this is additive and never rewrites a choice.
 */
function declaresReasoningEfforts(value) {
  return value !== undefined;
}

/**
 * Whether a stored `reasoningEfforts` value IS the standard tier.
 *
 * Compared by declaration, not by key order: pi-ai treats the dict as a set of
 * offered levels, and a hand-written `cordis.patch.yml` may list them in any
 * order. `false`, an absent field and any other level set are not the standard
 * tier — the page reports those as "custom" or "unset" instead of claiming a
 * tier that would be rewritten on the next click.
 */
function isStandardTier(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length !== STANDARD_REASONING_KEYS.split(',').length) return false;
  return entries.every(([level, wire]) => Object.prototype.hasOwnProperty.call(STANDARD_REASONING_EFFORTS, level)
    && String(wire ?? '') === String(STANDARD_REASONING_EFFORTS[level] ?? ''));
}

/**
 * Which models of one route need the standard tier, and what to write.
 *
 * A route whose installed catalog describes the model already inherits a
 * capability (`base?.reasoning`), so injecting there would replace curated
 * per-vendor levels with a guess — the adapter's own error text for a declared
 * route says the catalog "spells every model out", and the converse holds too.
 * `listConfigurableProviders()` is where the adapter publishes that
 * distinction: it sets `declared: true` exactly for a route "the owning adapter
 * knows only because configuration declared it". Absent/false means the route
 * is the adapter's own, and is left alone.
 *
 * @param providers - `ctx.llm.listConfigurableProviders()` output.
 * @param section - the live `llm-pi-ai` namespace value.
 * @returns one op per model still needing the standard tier, in stable route
 *   order.
 */
function standardTierOps(providers, section) {
  const declared = new Set();
  for (const entry of Array.isArray(providers) ? providers : []) {
    if (entry?.declared === true && typeof entry.provider === 'string') declared.add(entry.provider);
  }
  if (declared.size === 0) return [];
  const routes = section !== null && typeof section === 'object' ? section.providers : undefined;
  if (routes === null || typeof routes !== 'object') return [];
  const ops = [];
  for (const route of Object.keys(routes).sort()) {
    if (!declared.has(route)) continue;
    const models = routes[route]?.models;
    if (!Array.isArray(models)) continue;
    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      if (model === null || typeof model !== 'object') continue;
      if (declaresReasoningEfforts(model.reasoningEfforts)) continue;
      ops.push({
        op: 'set',
        path: ['providers', route, 'models', String(index), 'reasoningEfforts'],
        value: { ...STANDARD_REASONING_EFFORTS },
      });
    }
  }
  return ops;
}

/**
 * Back-fill the standard thinking tier, once per settings revision.
 *
 * Runs on the `settings/document-updated` push for `llm-pi-ai` and once at
 * boot, so a route created through the official Models page acquires the tiers
 * without the user reopening any card. Writes go through the same
 * `settings.mutate` with the revision the read returned, so a concurrent edit
 * loses the race cleanly (SETTINGS_CONFLICT) and is retried on the next event
 * instead of overwriting the user's work.
 *
 * Silent by design when there is nothing to do — the common case. A failure is
 * logged and dropped: this is a convenience, and must never block or crash the
 * profile boot.
 *
 * @param ctx - plugin context, for the settings and llm services.
 * @returns a promise resolving to the number of models back-filled.
 */
async function ensureStandardTiers(ctx) {
  const settings = ctx.get('settings');
  const llm = ctx.get('llm');
  if (settings === undefined || llm === undefined) return 0;
  const { value: section, revision } = readNamespace(settings);
  if (section === undefined) return 0;
  let providers;
  try {
    providers = llm.listConfigurableProviders();
  } catch (error) {
    ctx.logger?.warn?.(`model-capabilities: cannot list configurable providers: ${String(error?.message ?? error)}`);
    return 0;
  }
  const ops = standardTierOps(providers, section);
  if (ops.length === 0) return 0;
  try {
    await settings.mutate(NS, ops, revision);
    return ops.length;
  } catch (error) {
    if (error?.code === 'SETTINGS_CONFLICT') return 0;
    ctx.logger?.warn?.(`model-capabilities: thinking-tier default failed: ${String(error?.message ?? error)}`);
    return 0;
  }
}

export function apply(ctx) {
  // Back-fill the standard thinking tier for declared routes, which the
  // official Models page cannot set and pi-ai cannot inherit (see
  // STANDARD_REASONING_EFFORTS). Wired on the settings push so it lands as soon
  // as a provider is created, and once now to cover routes that already exist.
  ctx.effect(() => {
    const refresh = () => {
      void ensureStandardTiers(ctx);
    };
    const dispose = ctx.on('settings/document-updated', (ns) => {
      if (String(ns) === NS) refresh();
    });
    refresh();
    return () => dispose();
  }, 'dsh-model-capabilities: thinking-tier defaults');

  const registerRoutes = (web) => web.effect(() => web.webServer.register({
    kind: 'prefix',
    path: '/model-capabilities',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const settings = ctx.get('settings');
      if (settings === undefined) {
        return sendJson(res, 503, { ok: false, error: 'settings service unavailable' });
      }
      try {
        // Directory for the standalone settings page: every provider route with
        // the identity a two-pane view needs, in one request instead of one GET
        // per route. `declared` comes from the adapter's own directory (the same
        // signal the thinking-tier injector trusts), so the page can say which
        // routes are gateways rather than re-deriving it from catalog membership.
        if (req.method === 'GET' && url.pathname === '/model-capabilities/providers') {
          const { value: section, revision } = readNamespace(settings);
          const llm = ctx.get('llm');
          let directory = [];
          try {
            directory = typeof llm?.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : [];
          } catch {
            directory = [];
          }
          const stored = section !== null && typeof section === 'object' && section.providers !== null && typeof section.providers === 'object'
            ? section.providers
            : {};
          const byRoute = new Map();
          for (const entry of Array.isArray(directory) ? directory : []) {
            if (typeof entry?.provider !== 'string' || entry.provider === '') continue;
            byRoute.set(entry.provider, { declared: entry.declared === true, displayName: typeof entry.displayName === 'string' ? entry.displayName : entry.provider });
          }
          // The union: routes the adapter declares plus routes only the stored
          // document has (a hand-edited profile row the adapter did not register).
          for (const route of Object.keys(stored)) if (!byRoute.has(route)) byRoute.set(route, { declared: true, displayName: route });
          const providers = [...byRoute.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([route, meta]) => {
            const profile = stored[route];
            const models = profile !== null && typeof profile === 'object' && Array.isArray(profile.models) ? profile.models : null;
            return {
              provider: route,
              displayName: meta.displayName,
              declared: meta.declared,
              // Mirrors the official row's own gate so the page shows the same
              // "configured" posture the Models page does.
              configured: profile !== null && typeof profile === 'object',
              hasModelsList: models !== null,
              modelIds: models === null ? [] : models.map((model) => String(model?.id ?? '')),
              // 标准档位 progress, so the left column can say at a glance which
              // routes still need the one-click action. Both counts are 0 for a
              // catalog route, which stores no model list to apply a tier to.
              modelCount: models === null ? 0 : models.length,
              standardCount: models === null ? 0 : models.filter((model) => isStandardTier(model?.reasoningEfforts)).length,
              headerCount: profile !== null && typeof profile === 'object' && profile.headers && typeof profile.headers === 'object' ? Object.keys(profile.headers).length : 0,
              compatCount: profile !== null && typeof profile === 'object' && profile.compat && typeof profile.compat === 'object' ? Object.keys(profile.compat).length : 0,
            };
          });
          return sendJson(res, 200, { ok: true, revision, providers });
        }
        if (req.method === 'GET' && url.pathname === '/model-capabilities') {
          const provider = url.searchParams.get('provider') ?? '';
          if (provider === '') return sendJson(res, 400, { ok: false, error: 'missing provider' });
          const { value: section, revision } = readNamespace(settings);
          const profile = typeof section === 'object' && section !== null ? section.providers?.[provider] : undefined;
          if (typeof profile !== 'object' || profile === null) return sendJson(res, 404, { ok: false, error: 'provider-not-found' });
          return sendJson(res, 200, viewOf(profile, revision));
        }
        if (req.method === 'POST' && url.pathname === '/model-capabilities') {
          let payload;
          try {
            payload = JSON.parse(await readBody(req));
          } catch {
            return sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
          }
          const provider = typeof payload?.provider === 'string' ? payload.provider : '';
          if (provider === '') return sendJson(res, 400, { ok: false, error: 'missing provider' });
          const expectedRevision = typeof payload?.revision === 'number' ? payload.revision : undefined;
          const { value: section } = readNamespace(settings);
          const profile = typeof section === 'object' && section !== null ? section.providers?.[provider] : undefined;
          if (typeof profile !== 'object' || profile === null) return sendJson(res, 404, { ok: false, error: 'provider-not-found' });

          // Per-model edits need a stored models list. The route-level fields
          // (headers, compat, reasoning) do NOT: a catalog route declares no
          // models but still owns all three, and the standalone settings page
          // edits them there. So the models list is required only when the
          // payload actually carries per-model edits — previously this refused
          // the whole request, which made a catalog route's headers uneditable.
          const editsModels = Array.isArray(payload.models) && payload.models.length > 0;
          if (editsModels && !Array.isArray(profile.models)) {
            return sendJson(res, 409, { ok: false, error: 'profile-has-no-models-list' });
          }

          const edits = Array.isArray(payload.models) ? payload.models : [];
          const ops = [];
          // Per-model thinking tiers are written as ONE PATH OP PER MODEL, never
          // as a whole-list replacement.
          //
          // `describe()` projects the live Config, i.e. the schemastery-PARSED
          // section: an absent `input` comes back as `[]`, and absent dicts come
          // back as `{}`. Writing that array back would materialize every one of
          // those defaults into the user's cordis.patch.yml — which is how an
          // earlier revision ended up rewriting accepted modalities it does not
          // own (the official Models page's field). A path op can only touch the
          // key it names.
          const models = Array.isArray(profile.models) ? profile.models : [];
          const indexById = new Map(models.map((model, index) => [String(model?.id ?? ''), index]));
          for (const edit of edits) {
            if (edit === null || typeof edit !== 'object') continue;
            const index = indexById.get(String(edit.id ?? ''));
            if (index === undefined) continue;
            const path = ['providers', provider, 'models', String(index), 'reasoningEfforts'];
            const incoming = edit.reasoningEfforts;
            if (incoming === null || incoming === undefined) ops.push({ op: 'unset', path });
            else if (incoming === false) ops.push({ op: 'set', path, value: false });
            else if (typeof incoming === 'object') {
              const efforts = cleanEfforts(incoming);
              // An empty declaration is a clear, not an unsupported value: pi-ai
              // refuses `{}` outright, so unsetting restores inheritance.
              if (efforts === null) ops.push({ op: 'unset', path });
              else ops.push({ op: 'set', path, value: efforts });
            }
          }
          const route = ['providers', provider];
          if (payload.reasoning === null || payload.reasoning === undefined) ops.push({ op: 'unset', path: [...route, 'reasoning'] });
          else if (LEVELS.includes(payload.reasoning)) ops.push({ op: 'set', path: [...route, 'reasoning'], value: payload.reasoning });

          // Headers use full-replace semantics: the client sends the desired
          // final dict (`headers: {}` clears every header); with the key absent
          // the stored dict is left untouched. Names merge case-insensitively
          // (lowercased). pi-ai's namespace validator (assertValidHeaders)
          // stays the final authority — its rejection surfaces verbatim
          // through the mutate-failure path.
          if (Object.prototype.hasOwnProperty.call(payload, 'headers')) {
            const incomingHeaders = payload.headers;
            if (incomingHeaders !== null && typeof incomingHeaders !== 'object') {
              return sendJson(res, 400, { ok: false, error: 'headers must be an object of name → value ({} or null clears all)' });
            }
            const mergedHeaders = {};
            for (const [rawName, rawValue] of Object.entries(incomingHeaders ?? {})) {
              const name = String(rawName).trim().toLowerCase();
              const value = typeof rawValue === 'string' ? rawValue.trim() : '';
              if (name === '') return sendJson(res, 400, { ok: false, error: 'header name is empty' });
              if (!HEADER_NAME_RE.test(name)) return sendJson(res, 400, { ok: false, error: `invalid header name: ${name}` });
              if (RESERVED_HEADERS.has(name)) return sendJson(res, 400, { ok: false, error: `header "${name}" is owned by the harness attribution User-Agent and cannot be set` });
              if (value === '' || value.length > MAX_HEADER_VALUE_CHARS || /[\r\n\u0000]/.test(value)) {
                return sendJson(res, 400, { ok: false, error: `invalid value for header "${name}" (empty, over ${MAX_HEADER_VALUE_CHARS} chars, or contains control characters)` });
              }
              mergedHeaders[name] = value;
            }
            if (Object.keys(mergedHeaders).length === 0) ops.push({ op: 'unset', path: [...route, 'headers'] });
            else ops.push({ op: 'set', path: [...route, 'headers'], value: mergedHeaders });
          }

          // Compat: merged onto a copy of the stored dict (see
          // applyCompatPatch) so keys this card does not render — the two
          // offered dict fields and every withheld one — ride along untouched.
          const patch = typeof payload.compatPatch === 'object' && payload.compatPatch !== null ? payload.compatPatch : {};
          const merged = applyCompatPatch(profile.compat, patch);
          if (!merged.ok) return sendJson(res, 400, { ok: false, error: merged.error });
          const currentCompat = merged.compat;
          if (Object.keys(currentCompat).length === 0) ops.push({ op: 'unset', path: [...route, 'compat'] });
          else ops.push({ op: 'set', path: [...route, 'compat'], value: currentCompat });

          try {
            await settings.mutate(NS, ops, expectedRevision);
            // Return the committed view so the browser half can update in place
            // instead of issuing a second GET (and flashing a loading state).
            // The re-read also supplies the post-write revision, so the client
            // can chain a second edit without a stale fence.
            const { value: committedSection, revision: committedRevision } = readNamespace(settings);
            const committed = typeof committedSection === 'object' && committedSection !== null ? committedSection.providers?.[provider] : undefined;
            if (typeof committed !== 'object' || committed === null) return sendJson(res, 200, { ok: true });
            return sendJson(res, 200, { ok: true, view: viewOf(committed, committedRevision) });
          } catch (error) {
            if (error?.code === 'SETTINGS_CONFLICT') {
              // No cached revision to drop any more: the client's retry reads a
              // fresh fence from the next GET, which always describes live.
              return sendJson(res, 409, { ok: false, error: 'conflict' });
            }
            return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
          }
        }
        return sendJson(res, 404, { ok: false, error: 'not found' });
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
      }
    },
  }), 'dsh-model-capabilities: routes');
  // Starts a child fiber that waits for webServer when the profile provides one
  // (web) and stays pending without blocking this entry elsewhere.
  ctx.inject(['webServer'], registerRoutes);
}

/**
 * Pure helpers, the standard tier and the compat surface, exported for
 * persistent Node regressions and drift checks against the installed adapter
 * (the runtime `COMPAT_GATES` tables plus `compatProfile`), which is what keeps
 * `COMPAT_FIELDS` honest across a pi-ai upgrade. Cordis reads only
 * `inject`/`apply` from a plugin entry, so these extra named exports are inert
 * at runtime.
 */
export {
  cleanCompat,
  hiddenCompatKeys,
  compatIntOf,
  applyCompatPatch,
  viewOf,
  readNamespace,
  declaresReasoningEfforts,
  isStandardTier,
  standardTierOps,
  ensureStandardTiers,
  STANDARD_REASONING_EFFORTS,
  STANDARD_REASONING_KEYS,
  COMPAT_FIELDS,
  COMPAT_BOOL_KEYS,
  COMPAT_ENUM_FIELDS,
  COMPAT_INT_KEYS,
  COMPAT_UNDISPLAYED_KEYS,
  COMPAT_WITHHELD_KEYS,
  CACHE_CONTROL_FORMATS,
  THINKING_TOKEN_BUDGET_FIELDS,
  VLLM_PRIORITY_MIN,
  VLLM_PRIORITY_MAX,
};
