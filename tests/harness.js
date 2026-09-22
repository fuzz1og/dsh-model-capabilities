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
  const states = [];
  let cursor = 0;
  const React = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, ...(children.length ? { children: children.flat(Infinity) } : {}) } };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useEffect() {},
  };
  const atoms = Object.fromEntries(['Button', 'Pill', 'Input', 'Menu', 'DisclosureRow', 'StateDot'].map((name) => [name, name]));
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    fetch,
    window: { __ModuleLoader__: { load: (entry) => {
      assert.equal(entry.id, 'dsh-model-capabilities');
      factory = entry.factory;
    } } },
  });
  const mod = factory((name) => name === 'react' ? React : atoms);
  return {
    ui: mod.__internals,
    snapshot: () => states[0],
    render(snapshot) {
      if (snapshot !== undefined) states[0] = snapshot;
      cursor = 0;
      return mod.__internals.ModelCapabilities({ provider: { provider: 'test' }, configured: true });
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
  let section = { providers: { test: { models: [{ id: 'test', name: 'Test', compat: { modelOnly: true } }], compat, headers: { 'x-existing': 'keep' } } } };
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
