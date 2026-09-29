import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import {
  STANDARD_REASONING_EFFORTS,
  STANDARD_REASONING_KEYS,
  declaresReasoningEfforts,
  isStandardTier,
  standardTierOps,
  ensureStandardTiers,
} from '../lib/index.js';
import { bridge } from './harness.js';

/**
 * The gap this feature closes: dsh gives `contextWindow`, `maxTokens` and
 * `input` a route-level fallback but gives `reasoningEfforts` none, so a
 * *declared* route — what the official Models page creates — resolves through
 * `base?.reasoning ?? false` and offers only `off`. These guards pin both
 * halves: the value written, and the decision of WHERE to write it.
 *
 * The written value is also the page's 标准档位: one constant, declared once
 * here and mirrored by `STANDARD_TIER` in lib/client.js (asserted below and in
 * the client regressions), so the one-click rollout cannot drift from the
 * injector.
 */

/** One directory entry shaped like `ctx.llm.listConfigurableProviders()` output. */
const entry = (provider, declared) => ({ provider, displayName: provider, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider], ...(declared === undefined ? {} : { declared }) });

const sectionWith = (providers) => ({ providers });

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The adapter's own resolution, reproduced so the value is checked against the
 * real two-step contract rather than against our assumptions about it.
 * Step 1 (`resolveModelReasoning`): an absent key is pinned to `null`
 * ("not offered"); a declared `off` with no value stays ABSENT, which pi-ai
 * reads as "supported, send nothing".
 */
function resolveMap(efforts) {
  const map = {};
  for (const level of THINKING_LEVELS) {
    const wire = efforts[level];
    if (wire === undefined) map[level] = null;
    else if (wire !== null) map[level] = wire;
  }
  return map;
}

/** Step 2: `getSupportedThinkingLevels`. */
function offeredLevels(map) {
  return THINKING_LEVELS.filter((level) => {
    const mapped = map[level];
    if (mapped === null) return false;
    if (level === 'xhigh' || level === 'max') return mapped !== undefined;
    return true;
  });
}

test('the standard tier declares exactly off/low/medium/high/max, and offers exactly those tiers', async () => {
  // `off` maps to null (supported, send nothing); the others carry their own
  // wire name. An absent key is pinned to null by pi-ai, i.e. NOT offered, so
  // the key set is the offered tier set.
  assert.deepEqual(STANDARD_REASONING_EFFORTS, { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' });
  assert.equal(STANDARD_REASONING_KEYS, 'off,low,medium,high,max');
  assert.deepEqual(Object.keys(STANDARD_REASONING_EFFORTS), ['off', 'low', 'medium', 'high', 'max']);
  // The tiers the picker ends up offering — the whole point of the tier.
  assert.deepEqual(offeredLevels(resolveMap(STANDARD_REASONING_EFFORTS)), ['off', 'low', 'medium', 'high', 'max']);
  // Guard the mechanism, not just the outcome: `minimal`/`xhigh` are withheld by
  // their ABSENCE from the declaration, and `off` is offered even though it never
  // reaches the map.
  const map = resolveMap(STANDARD_REASONING_EFFORTS);
  assert.equal(map.off, undefined);
  assert.equal(map.minimal, null);
  assert.equal(map.xhigh, null);
  // The browser half mirrors this exact dict — spread into this realm, because
  // the client file is evaluated in its own vm context and a cross-realm object
  // fails a strict prototype comparison even when the data matches.
  const { client } = await import('./harness.js');
  const browser = client(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  assert.deepEqual({ ...browser.ui.STANDARD_TIER }, STANDARD_REASONING_EFFORTS);
});

test('isStandardTier recognises exactly the standard declaration, in any key order', () => {
  assert.equal(isStandardTier({ off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' }), true);
  // A hand-written patch may list the levels in another order; the dict is a
  // declaration of offered levels, not a sequence.
  assert.equal(isStandardTier({ max: 'max', high: 'high', medium: 'medium', low: 'low', off: null }), true);
  // Anything else is reported as unset/custom, never as "already standard".
  assert.equal(isStandardTier(undefined), false);
  assert.equal(isStandardTier(false), false);
  assert.equal(isStandardTier(null), false);
  assert.equal(isStandardTier([]), false);
  // The pre-0.12 four-level default also reads as "not the standard tier".
  assert.equal(isStandardTier({ off: null, low: 'low', high: 'high', max: 'max' }), false);
  assert.equal(isStandardTier({ off: null, low: 'low', medium: 'medium', high: 'high', max: 'max', minimal: 'minimal' }), false);
  assert.equal(isStandardTier({ off: null, low: 'low', medium: 'medium', high: 'high', max: 'ultra' }), false);
  assert.equal(isStandardTier({ off: 'skip', low: 'low', medium: 'medium', high: 'high', max: 'max' }), false);
});

test('only an absent reasoningEfforts is back-filled; a declared one is never rewritten', () => {
  assert.equal(declaresReasoningEfforts(undefined), false);
  // A non-reasoning model and an author's own list both count as decided.
  assert.equal(declaresReasoningEfforts(false), true);
  assert.equal(declaresReasoningEfforts({ off: null, low: 'low' }), true);
  // `{}` is a (rejected) empty declaration, not an absent field: re-writing it
  // would silently give a model tiers its author denied.
  assert.equal(declaresReasoningEfforts({}), true);
  assert.equal(declaresReasoningEfforts(null), true);
});

test('only declared (non-catalog) routes are touched; catalog routes keep their inherited levels', () => {
  const ops = standardTierOps(
    [entry('gateway', true), entry('anthropic', false), entry('untagged')],
    sectionWith({
      gateway: { models: [{ id: 'a' }] },
      anthropic: { models: [{ id: 'b' }] },
      untagged: { models: [{ id: 'c' }] },
    }),
  );
  // A catalog route already inherits curated levels via base?.reasoning;
  // injecting there would replace them with a guess.
  assert.deepEqual(ops, [{
    op: 'set',
    path: ['providers', 'gateway', 'models', '0', 'reasoningEfforts'],
    value: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
  }]);
});

test('no configurable-provider directory means no work at all', () => {
  const section = sectionWith({ gateway: { models: [{ id: 'a' }] } });
  assert.deepEqual(standardTierOps([], section), []);
  assert.deepEqual(standardTierOps(undefined, section), []);
  // `declared` absent means "the adapter draws no such distinction": treat as
  // the adapter's own route and leave it alone rather than guess.
  assert.deepEqual(standardTierOps([entry('gateway')], section), []);
});

test('a model that already declares tiers is skipped, and only it', () => {
  const ops = standardTierOps(
    [entry('gateway', true)],
    sectionWith({
      gateway: {
        models: [
          { id: 'decided', reasoningEfforts: { off: null, low: 'low' } },
          { id: 'absent' },
          { id: 'off-only', reasoningEfforts: false },
        ],
      },
    }),
  );
  assert.equal(ops.length, 1);
  assert.equal(ops[0].path.join('.'), 'providers.gateway.models.1.reasoningEfforts');
});

test('the op path names the model by index, so a model without a stored list is untouched', () => {
  const ops = standardTierOps(
    [entry('gateway', true)],
    sectionWith({
      gateway: { models: [{ id: 'first' }, { id: 'second' }] },
      declared: { models: [] },
    }),
  );
  assert.deepEqual(ops.map((op) => op.path.join('.')), [
    'providers.gateway.models.0.reasoningEfforts',
    'providers.gateway.models.1.reasoningEfforts',
  ]);
  // A route with no models array (a catalog route with nothing declared) is
  // skipped rather than creating a models list.
  assert.equal(standardTierOps([entry('declared', true)], sectionWith({ declared: {} })).length, 0);
});

test('a malformed namespace value is refused instead of throwing', () => {
  const dir = [entry('gateway', true)];
  assert.deepEqual(standardTierOps(dir, undefined), []);
  assert.deepEqual(standardTierOps(dir, null), []);
  assert.deepEqual(standardTierOps(dir, 'nonsense'), []);
  assert.deepEqual(standardTierOps(dir, { providers: null }), []);
  assert.deepEqual(standardTierOps(dir, { providers: 'nonsense' }), []);
  // A non-object model entry is skipped, not dereferenced.
  assert.deepEqual(standardTierOps(dir, sectionWith({ gateway: { models: [null, 'x', 7] } })), []);
});

test('ensureStandardTiers writes once and is idempotent on a second pass', async () => {
  const calls = [];
  let value = sectionWith({ gateway: { models: [{ id: 'a', contextWindow: 1000, maxTokens: 100, input: ['text'] }] } });
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', revision: 3, value: structuredClone(value) }],
    async mutate(ns, ops, expected) {
      assert.equal(ns, 'llm-pi-ai');
      assert.equal(expected, 3);
      calls.push(ops);
      const next = structuredClone(value);
      for (const op of ops) {
        const target = op.path.slice(0, -1).reduce((at, key) => at[key], next);
        target[op.path.at(-1)] = structuredClone(op.value);
      }
      value = next;
    },
  };
  const ctx = { get: (name) => (name === 'settings' ? settings : { listConfigurableProviders: () => [entry('gateway', true)] }) };
  assert.equal(await ensureStandardTiers(ctx), 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(value.providers.gateway.models[0].reasoningEfforts, { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' });
  // Second pass finds nothing to do: the marker is the stored value itself.
  assert.equal(await ensureStandardTiers(ctx), 0);
  assert.equal(calls.length, 1);
});

test('ensureStandardTiers does the work when the model already carries a compat block', async () => {
  // Round-tripping a model must not depend on field order or on which other
  // fields are present: only reasoningEfforts decides.
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: sectionWith({ gateway: { models: [{ id: 'a', compat: { supportsStore: true } }] } }) }],
    async mutate() {},
  };
  const ctx = { get: (name) => (name === 'settings' ? settings : { listConfigurableProviders: () => [entry('gateway', true)] }) };
  assert.equal(await ensureStandardTiers(ctx), 1);
});

test('a missing service, a detached namespace and a conflict are all silent no-ops', async () => {
  // No settings service at all.
  assert.equal(await ensureStandardTiers({ get: () => undefined }), 0);
  // llm absent (a composition without the adapter).
  const detached = { get: (name) => (name === 'settings' ? { describe: () => [] } : undefined) };
  assert.equal(await ensureStandardTiers(detached), 0);
  // llm present but its directory call throws: logged, never fatal.
  const throwing = {
    get: (name) => (name === 'settings'
      ? { describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: sectionWith({ g: { models: [{ id: 'a' }] } }) }] }
      : { listConfigurableProviders: () => { throw new Error('registry gone'); } }),
    logger: { warn() {} },
  };
  assert.equal(await ensureStandardTiers(throwing), 0);
  // Conflict: another writer holds the revision. Nothing is retried here; the
  // next settings event re-attempts.
  const conflicted = {
    get: (name) => (name === 'settings'
      ? {
        describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: sectionWith({ g: { models: [{ id: 'a' }] } }) }],
        async mutate() { throw Object.assign(new Error('stale'), { code: 'SETTINGS_CONFLICT' }); },
      }
      : { listConfigurableProviders: () => [entry('g', true)] }),
  };
  assert.equal(await ensureStandardTiers(conflicted), 0);
  // A schema rejection is reported, not swallowed into a crash.
  const rejected = {
    get: (name) => (name === 'settings'
      ? {
        describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: sectionWith({ g: { models: [{ id: 'a' }] } }) }],
        async mutate() { throw new Error('pi-ai refused'); },
      }
      : { listConfigurableProviders: () => [entry('g', true)] }),
    logger: { warn() {} },
  };
  assert.equal(await ensureStandardTiers(rejected), 0);
});

test('the plugin subscribes to settings pushes for its namespace only', async () => {
  // The wiring, not just the pure function: a profile that mounts the plugin
  // must learn about a provider created later through the official page.
  const events = [];
  const disposers = [];
  let value = sectionWith({ gateway: { models: [{ id: 'a' }] } });
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: structuredClone(value) }],
    async mutate(ns, ops) {
      const next = structuredClone(value);
      for (const op of ops) op.path.slice(0, -1).reduce((at, k) => at[k], next)[op.path.at(-1)] = structuredClone(op.value);
      value = next;
    },
  };
  const { apply } = await import('../lib/index.js');
  apply({
    get: (name) => {
      if (name === 'settings') return settings;
      if (name === 'llm') return { listConfigurableProviders: () => [entry('gateway', true)] };
      return undefined;
    },
    effect: (fn) => fn(),
    on: (name, listener) => { events.push(name); disposers.push(listener); return () => {}; },
    inject: () => {},
  });
  assert.deepEqual(events, ['settings/document-updated']);
  // The boot pass already back-filled, so the stashed listener is a no-op now.
  assert.deepEqual(value.providers.gateway.models[0].reasoningEfforts, { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' });
  assert.equal(disposers.length, 1);
  // A push for ANOTHER namespace must not trigger work on this one.
  let mutated = 0;
  const other = { ...settings, mutate: async () => { mutated += 1; } };
  apply({
    get: (name) => (name === 'settings' ? other : (name === 'llm' ? { listConfigurableProviders: () => [entry('gateway', true)] } : undefined)),
    effect: (fn) => fn(),
    on: (name, listener) => { if (name === 'settings/document-updated') listener('ui-theme'); return () => {}; },
    inject: () => {},
  });
  assert.equal(mutated, 0);
});

test('route-level edits work on a catalog route, which stores no models list', async () => {
  // A catalog route declares no models, but still owns headers/compat/reasoning.
  // The standalone settings page edits route-level fields there, so the bridge
  // must not refuse the whole request for want of a models list — and must not
  // materialize one either, which would replace the served catalog.
  const host = bridge({}, { catalogProvider: true });
  // Headers only: previously this was 409 profile-has-no-models-list.
  const saved = await host.request('POST', { provider: 'test', revision: 7, headers: { 'x-probe': 'v' } });
  assert.equal(saved.status, 200);
  assert.deepEqual(host.stored().headers, { 'x-probe': 'v' });
  assert.equal('models' in host.stored(), false);
  // Compat rides the same path.
  const compatSaved = await host.request('POST', { provider: 'test', revision: 8, compatPatch: { supportsStore: true } });
  assert.equal(compatSaved.status, 200);
  assert.deepEqual(host.stored().compat, { supportsStore: true });
  assert.equal('models' in host.stored(), false);
  // A per-model edit still requires the stored list, and says so.
  const refused = await host.request('POST', { provider: 'test', revision: 9, models: [{ id: 'x' }] });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.error, 'profile-has-no-models-list');
});

test('a route-level-only save never rewrites an existing models list', async () => {
  const host = bridge({});
  const before = host.stored().models;
  const saved = await host.request('POST', { provider: 'test', revision: 7, headers: { 'x-only': 'v' } });
  assert.equal(saved.status, 200);
  // The models array is untouched: no op was emitted for it.
  assert.deepEqual(host.stored().models, before);
  assert.deepEqual(host.stored().headers, { 'x-only': 'v' });
});

test('the providers index lists every route with the identity a two-pane page needs', async () => {
  // The standalone settings page renders this in one request. `declared` must
  // come from the adapter (the same signal the tier injector trusts), and a
  // route only the stored document has is still listed.
  const events = [];
  let handler;
  const section = {
    providers: {
      gateway: { models: [{ id: 'a' }, { id: 'b' }], headers: { 'x-one': '1' }, compat: { supportsStore: true } },
      catalog: { api: 'anthropic-messages', baseURL: 'https://api.anthropic.com' },
    },
  };
  const settings = { describe: () => [{ ns: 'llm-pi-ai', revision: 4, value: section }] };
  const { apply } = await import('../lib/index.js');
  apply({
    get: (name) => (name === 'settings'
      ? settings
      : (name === 'llm'
        ? { listConfigurableProviders: () => [{ provider: 'gateway', displayName: 'Gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'gateway'], declared: true }, { provider: 'catalog', displayName: 'Catalog', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'catalog'], declared: false }] }
        : undefined)),
    effect: (fn) => fn(),
    on: (name, listener) => { events.push(name); return () => {}; },
    inject: (services, register) => register({
      effect: (fn) => fn(),
      webServer: { register: (route) => { handler = route.handler; } },
    }),
  });
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = '/model-capabilities/providers';
  let json;
  await handler(req, { writeHead: () => {}, end: (body) => { json = JSON.parse(body); } });
  assert.equal(json.ok, true);
  assert.equal(json.revision, 4);
  assert.deepEqual(json.providers.map((p) => p.provider), ['catalog', 'gateway']);
  const gateway = json.providers.find((p) => p.provider === 'gateway');
  assert.equal(gateway.declared, true);
  assert.equal(gateway.hasModelsList, true);
  assert.deepEqual(gateway.modelIds, ['a', 'b']);
  assert.equal(gateway.headerCount, 1);
  assert.equal(gateway.compatCount, 1);
  // 标准档位 progress: neither stored model declares a tier yet, so the page's
  // left column must not claim the route is already standard.
  assert.equal(gateway.modelCount, 2);
  assert.equal(gateway.standardCount, 0);
  const catalog = json.providers.find((p) => p.provider === 'catalog');
  assert.equal(catalog.declared, false);
  assert.equal(catalog.hasModelsList, false);
  assert.deepEqual(catalog.modelIds, []);
  // A catalog route stores no list, so it has nothing to roll a tier onto.
  assert.equal(catalog.modelCount, 0);
  assert.equal(catalog.standardCount, 0);
});

test('the providers index reports a route already on the standard tier', async () => {
  let handler;
  const section = {
    providers: {
      standard: { models: [{ id: 'a', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' } }, { id: 'b', reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' } }] },
      partial: { models: [{ id: 'c', reasoningEfforts: { off: null, low: 'low' } }, { id: 'd' }] },
    },
  };
  const { apply } = await import('../lib/index.js');
  apply({
    get: (name) => (name === 'settings'
      ? { describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: section }] }
      : (name === 'llm'
        ? { listConfigurableProviders: () => [{ provider: 'standard', declared: true }, { provider: 'partial', declared: true }] }
        : undefined)),
    effect: (fn) => fn(),
    on: () => () => {},
    inject: (services, register) => register({
      effect: (fn) => fn(),
      webServer: { register: (route) => { handler = route.handler; } },
    }),
  });
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = '/model-capabilities/providers';
  let json;
  await handler(req, { writeHead: () => {}, end: (body) => { json = JSON.parse(body); } });
  const byRoute = Object.fromEntries(json.providers.map((p) => [p.provider, p]));
  assert.equal(byRoute.standard.standardCount, 2);
  assert.equal(byRoute.partial.standardCount, 0);
});
