import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import vm from 'node:vm';
import { apply } from '../lib/index.js';

export const wire = (value) => JSON.parse(JSON.stringify(value));

// Only external boundaries are doubled: React/atoms, HTTP transport, settings.
// The real factory, component event handlers, snapshots and Host routes execute.
export function client(fetch) {
  let factory;
  // Hook state is per COMPONENT, as React has it. A single shared array would
  // collide the page's (index, selected, status) with the editor's (snap, busy,
  // …) as soon as one composes the other, which the settings page does.
  const hooks = new Map();
  // A direct call like `ui.Select(props)` (used to inspect a sub-component's
  // output) has no owning slot; it gets one scratch slot instead of crashing.
  const scratch = { states: [], cursor: 0 };
  let current = null;
  // Effects collected rather than run: a test decides when to flush them, so the
  // page's index load is observable instead of racing the assertion.
  const effects = [];
  const React = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, ...(children.length ? { children: children.flat(Infinity) } : {}) } };
    },
    useState(initial) {
      const slot = current ?? scratch;
      const index = slot.cursor++;
      if (!(index in slot.states)) slot.states[index] = typeof initial === 'function' ? initial() : initial;
      return [slot.states[index], (next) => { slot.states[index] = typeof next === 'function' ? next(slot.states[index]) : next; }];
    },
    useEffect(fn) { effects.push(fn); },
  };
  // Atoms the bundle resolves at runtime. The icon names are the ones the
  // installed 0.1.7-alpha.1 primitives actually export (verified in the package
  // bundle), so an icon fallback chain resolves here exactly as it does in the
  // browser instead of collapsing to `undefined` and hiding a missing icon.
  const atoms = Object.fromEntries([
    'Button', 'Pill', 'Input', 'Menu', 'DisclosureRow', 'StateDot',
    'IconChevronDownOutlineRegular',
    'IconThinkOutlineRegular',
    'IconSlidersTwoOutlineRegular',
    'IconLinkOutlineRegular',
  ].map((name) => [name, name]));
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    fetch,
    window: { __ModuleLoader__: { load: (entry) => {
      assert.equal(entry.id, 'dsh-model-capabilities');
      factory = entry.factory;
    } } },
  });
  const mod = factory((name) => name === 'react' ? React : atoms);

  /** Invoke one component with its own hook slot and a fresh cursor. */
  function run(component, props) {
    if (!hooks.has(component)) hooks.set(component, { states: [], cursor: 0 });
    const slot = hooks.get(component);
    slot.cursor = 0;
    const previous = current;
    current = slot;
    try {
      return component(props);
    } finally {
      current = previous;
    }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  return {
    ui: mod.__internals,
    snapshot: () => hooks.get(mod.__internals.ModelCapabilities)?.states[0],
    /** Slot for the inline editor, created on demand so a test may seed before the first render. */
    editorSlot() {
      if (!hooks.has(mod.__internals.ModelCapabilities)) hooks.set(mod.__internals.ModelCapabilities, { states: [], cursor: 0 });
      return hooks.get(mod.__internals.ModelCapabilities);
    },
    render(snapshot) {
      if (snapshot !== undefined) this.editorSlot().states[0] = snapshot;
      return run(mod.__internals.ModelCapabilities, { provider: { provider: 'test' }, configured: true });
    },
    /**
     * Mount the inline editor for a route and settle its own load, so the tree
     * reflects a fetched view rather than the loading state. `snapshot` seeds the
     * first paint exactly as a cached view would.
     */
    async renderEditor(props = { provider: { provider: 'test' }, configured: true }, snapshot) {
      if (snapshot !== undefined) this.editorSlot().states[0] = snapshot;
      effects.length = 0;
      run(mod.__internals.ModelCapabilities, props);
      for (const fn of effects) fn();
      await settle();
      await settle();
      effects.length = 0;
      return run(mod.__internals.ModelCapabilities, props);
    },
    /** Render the standalone settings page and settle its index load. */
    async renderPage() {
      effects.length = 0;
      run(mod.__internals.ModelCapabilitiesPage, {});
      // The effect kicks off an async load and returns undefined (as a real
      // effect does), so its promise is not awaitable: run the effects, then
      // let the fetch/JSON microtasks settle before re-rendering.
      for (const fn of effects) fn();
      await settle();
      await settle();
      effects.length = 0;
      return run(mod.__internals.ModelCapabilitiesPage, {});
    },
    /** Re-render the page with the state it already holds (no load flush). */
    rerenderPage() {
      return run(mod.__internals.ModelCapabilitiesPage, {});
    },
    /**
     * Run the real `apply` against a capturing ctx and return every slot
     * registration it made, so the surface a build contributes is assertable.
     */
    applySlots() {
      const registrations = [];
      mod.apply({
        effect: (fn) => { fn(); },
        slots: {
          inject: (slot, contribute) => { contribute(); },
          register: (options) => { registrations.push(options); },
        },
      });
      return registrations;
    },
  };
}

export function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

/**
 * Settings double matching the dsh 0.1.7-alpha.1 surface: `describe()` +
 * `mutate()` only. `get(ns)` deliberately does NOT exist here — the real
 * service removed it in 0.1.7, so a regression that reintroduces a call to it
 * must fail loudly instead of passing against a friendlier stub.
 *
 * `describe()` returns the descriptor list the real service projects: value and
 * revision together, one row per active settings entry.
 */
export function bridge(compat = {}, options = {}) {
  // `options.catalogProvider` mounts a route the way a catalog route looks from
  // the settings document: no stored `models` list at all, but it still owns
  // route-level fields (headers, compat). Route-level edits must work there.
  let section = options.catalogProvider === true
    ? { providers: { test: { api: 'openai-completions', baseURL: 'https://catalog.invalid/v1', headers: { 'x-existing': 'keep' } } } }
    : { providers: { test: { models: [{ id: 'test', name: 'Test', compat: { modelOnly: true } }], compat, headers: { 'x-existing': 'keep' } } } };
  let revision = 7;
  let handler;
  let rejection;
  let lastOps;
  /** Simulate a composition whose llm-pi-ai entry is not active. */
  let detached = options.detached === true;
  const settings = {
    describe: () => (detached ? [] : [{ ns: 'llm-pi-ai', revision, value: structuredClone(section) }]),
    async mutate(ns, ops, expected) {
      assert.equal(ns, 'llm-pi-ai');
      if (expected !== revision) throw Object.assign(new Error('stale'), { code: 'SETTINGS_CONFLICT' });
      if (rejection) throw new Error(rejection);
      const next = structuredClone(section);
      for (const op of ops) {
        const target = op.path.slice(0, -1).reduce((at, key) => at[key], next);
        const key = op.path.at(-1);
        if (op.op === 'unset') delete target[key];
        else target[key] = structuredClone(op.value);
      }
      lastOps = structuredClone(ops);
      section = next;
      revision += 1;
    },
  };
  apply({
    // `settings` doubles the 0.1.7 surface; `llm` is opt-in per test so the
    // thinking-tier injector stays inert (no directory -> no work) unless a
    // test supplies one.
    get: (name) => (name === 'llm' ? options.llm : settings),
    // The 0.1.7 Host reads live through describe() and subscribes to nothing;
    // keep an inert `on` so a regression that re-adds a subscription still loads.
    on: () => () => {},
    effect: (fn) => fn(),
    inject: (services, register) => register({
      effect: (fn) => fn(),
      webServer: { register: (route) => { handler = route.handler; } },
    }),
  });
  return {
    stored: () => structuredClone(section.providers.test),
    operations: () => lastOps,
    reject: (message) => { rejection = message; },
    /** Simulate an edit by anyone else: the next describe() reports a newer revision. */
    bumpRevision: () => { revision += 1; },
    async request(method = 'GET', payload) {
      const req = Readable.from(payload === undefined ? [] : [JSON.stringify(payload)]);
      req.method = method;
      req.url = '/model-capabilities?provider=test';
      let status;
      let json;
      await handler(req, {
        writeHead: (code) => { status = code; },
        end: (body) => { json = JSON.parse(body); },
      });
      return { status, json };
    },
  };
}
