import test from 'node:test';
import assert from 'node:assert/strict';
import { viewOf, applyCompatPatch, COMPAT_FIELDS, COMPAT_UNDISPLAYED_KEYS, COMPAT_WITHHELD_KEYS } from '../lib/index.js';
import { client, bridge, nodes, wire } from './harness.js';

const { ui } = client();
const snapshotOf = (stored) => ui.rememberView('test', wire(viewOf({ models: [{ id: 'test' }], compat: stored }, 7)));

test('Host view → client snapshot → patch → Host merge preserves an unknown enum value', () => {
  const stored = { thinkingFormat: 'future-format', supportsStore: false };
  const snapshot = snapshotOf(stored);
  snapshot.compat.supportsStore = true;
  const patch = wire(ui.buildCompatPatch(snapshot.compat, snapshot.compatKeep));
  assert.deepEqual(applyCompatPatch(stored, patch), { ok: true, compat: { thinkingFormat: 'future-format', supportsStore: true } });
  assert.equal(patch.thinkingFormat, 'keep');
  assert.equal(snapshot.compat.thinkingFormat, 'keep');
});

for (const field of COMPAT_FIELDS) {
  test(field.key + ': valid values and explicit clearing survive the complete projection', () => {
    const values = field.kind === 'bool' ? [true, false] : field.kind === 'enum' ? field.values : [-2147483648, -1, 0, 1, 2147483647];
    for (const value of values) {
      const stored = { [field.key]: value, futureKey: { nested: 'untouched' } };
      const snap = snapshotOf(stored);
      const patch = wire(ui.buildCompatPatch(snap.compat, snap.compatKeep));
      assert.deepEqual(applyCompatPatch(stored, patch).compat, stored);
      assert.deepEqual(applyCompatPatch(stored, { [field.key]: 'unset' }).compat, { futureKey: { nested: 'untouched' } });
    }
  });
  test(field.key + ': unrepresentable stored values KEEP rather than disappear', () => {
    const values = field.kind === 'bool' ? [null, 'true', 1, {}, []] : field.kind === 'enum' ? [null, 'future-value', false, {}, []] : [null, '12', '', 'NaN', {}, [], 1.5, 2147483648, -2147483649, NaN, Infinity];
    for (const value of values) {
      const stored = { [field.key]: value };
      const snap = snapshotOf(stored);
      const patch = wire(ui.buildCompatPatch(snap.compat, snap.compatKeep));
      assert.equal(patch[field.key], 'keep');
      assert.deepEqual(applyCompatPatch(stored, patch).compat, stored);
      if (field.kind !== 'int') assert.equal(snap.compat[field.key], 'keep');
      else assert.equal(ui.intTextError(snap.compat[field.key]), null);
    }
  });
}

test('hidden offered dictionaries, withheld fields and unknown keys are named and preserved', () => {
  const stored = Object.fromEntries([...COMPAT_UNDISPLAYED_KEYS, ...COMPAT_WITHHELD_KEYS, 'futureKey'].map((key) => [key, { preserve: [1, false, null] }]));
  const snap = snapshotOf(stored);
  assert.equal(snap.compatHidden.length, 16);
  const reasons = Object.fromEntries(snap.compatHidden.map(({ key, reason }) => [key, reason]));
  assert.equal(reasons.chatTemplateKwargs, 'not-rendered');
  assert.equal(reasons.openRouterRouting, 'withheld');
  assert.equal(reasons.futureKey, 'unknown');
  assert.deepEqual(applyCompatPatch(stored, wire(ui.buildCompatPatch(snap.compat, snap.compatKeep))).compat, stored);
});

test('integer edits reject invalid magnitudes and syntax, while zero/negative/clear work', () => {
  for (const value of ['NaN', 'Infinity', '1e2', '1.5', '+1', '2147483648', '-2147483649', {}, null, true, NaN, Infinity]) {
    assert.equal(applyCompatPatch({}, { vllmPriority: value }).ok, false, String(value));
  }
  for (const [value, expected] of [[' 0 ', 0], ['-2', -2], [-1, -1]]) {
    assert.deepEqual(applyCompatPatch({}, { vllmPriority: value }).compat, { vllmPriority: expected });
  }
  for (const value of ['', '  ', 'unset']) assert.deepEqual(applyCompatPatch({ vllmPriority: 3 }, { vllmPriority: value }).compat, {});
  for (const field of COMPAT_FIELDS.filter((field) => field.kind !== 'int')) {
    assert.equal(applyCompatPatch({}, { [field.key]: 'invalid' }).ok, false);
  }
});

test('actual Host GET → client render/events/save → Host POST/merge → committed snapshot', async () => {
  const stored = { supportsStore: false, supportsDeveloperRole: 'future-bool', thinkingFormat: 'future-format', vllmPriority: 2147483648, chatTemplateKwargs: { enable_thinking: { $var: 'thinking' } }, openRouterRouting: { sort: 'price' }, futureKey: [1, 2] };
  const host = bridge(stored);
  let posted;
  const browser = client(async (url, options) => {
    assert.equal(url, '/model-capabilities');
    posted = JSON.parse(options.body);
    const response = await host.request('POST', posted);
    return { json: async () => response.json };
  });
  const get = await host.request();
  assert.equal(get.status, 200);
  const snap = browser.ui.rememberView('test', get.json);
  let tree = browser.render(snap);
  for (const key of ['supportsDeveloperRole', 'thinkingFormat']) {
    const row = nodes(tree, (node) => node.props?.key === 'compat-' + key)[0];
    const select = nodes(row, (node) => node.type === browser.ui.Select)[0];
    assert.equal(select.props.value, 'keep');
    const menu = browser.ui.Select(select.props);
    assert.equal(menu.props.selectedId, 'keep');
    assert.equal(menu.props.items.find((item) => item.id === 'keep').label, browser.ui.KEEP_LABEL);
    assert.equal(nodes(menu.props.anchor, (node) => node.props?.className === 'mc-selectLabel')[0].props.children[0], browser.ui.KEEP_LABEL);
    select.props.onChange('keep');
    assert.ok(browser.snapshot().compatKeep.includes(key), 'reselecting KEEP must not clear it');
  }
  const row = nodes(tree, (node) => node.props?.key === 'compat-supportsStore')[0];
  nodes(row, (node) => node.type === browser.ui.Select)[0].props.onChange('true');
  tree = browser.render();
  const save = nodes(tree, (node) => node.type === 'Button' && node.props.variant === 'primary')[0];
  assert.equal(save.props.disabled, false, 'stored out-of-range integer must not block an unrelated edit');
  save.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posted.compatPatch.thinkingFormat, 'keep');
  assert.equal(posted.compatPatch.vllmPriority, 'keep');
  assert.deepEqual(host.stored().compat, { ...stored, supportsStore: true });
  assert.deepEqual(host.stored().headers, { 'x-existing': 'keep' });
  assert.deepEqual(host.stored().models[0].compat, { modelOnly: true });
  assert.equal(browser.snapshot().revision, 8);
  assert.equal(browser.snapshot().compat.thinkingFormat, 'keep');
  assert.ok(nodes(browser.render(), (node) => node.props?.text === '已写入 llm-pi-ai · settings.yaml').length);

  tree = browser.render();
  const enumRow = nodes(tree, (node) => node.props?.key === 'compat-thinkingFormat')[0];
  nodes(enumRow, (node) => node.type === browser.ui.Select)[0].props.onChange('unset');
  const intRow = nodes(tree, (node) => node.props?.key === 'compat-vllmPriority')[0];
  nodes(intRow, (node) => node.type === 'Button')[0].props.onClick();
  const patch = wire(browser.ui.buildCompatPatch(browser.snapshot().compat, browser.snapshot().compatKeep));
  assert.equal(patch.thinkingFormat, 'unset');
  assert.equal(patch.vllmPriority, 'unset');
  const cleared = await host.request('POST', { ...posted, revision: 8, compatPatch: patch });
  assert.equal(cleared.status, 200);
  assert.ok(!('thinkingFormat' in host.stored().compat));
  assert.ok(!('vllmPriority' in host.stored().compat));
});

for (const error of ['conflict', 'pi-ai schema rejected: exact diagnostic']) {
  test('Host and client surface ' + error + ' without optimistic success', async () => {
    const host = bridge({ supportsStore: false });
    const view = (await host.request()).json;
    if (error !== 'conflict') host.reject(error);
    let response;
    const browser = client(async (url, options) => {
      response = await host.request(options?.method ?? 'GET', options?.body ? JSON.parse(options.body) : undefined);
      return { json: async () => response.json };
    });
    const snap = browser.ui.rememberView('test', view);
    if (error === 'conflict') snap.revision = 1;
    let tree = browser.render(snap);
    nodes(tree, (node) => node.type === 'Button' && node.props.variant === 'primary')[0].props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    tree = browser.render();
    assert.ok(nodes(tree, (node) => node.props?.error === true && node.props.text.includes(error)).length);
    assert.equal(host.stored().compat.supportsStore, false);
    assert.equal(host.operations(), undefined);
    if (error === 'conflict') assert.equal(browser.snapshot().revision, 7);
    else assert.equal(response.status, 500);
  });
}

/**
 * dsh 0.1.7-alpha.1 removed `settings.get(ns)`. This is the regression guard:
 * the bridge must not call it, and its stub must therefore never expose it.
 * A reintroduced `settings.get(...)` inside the request handler now throws
 * (`settings.get is not a function`) and the route answers 500 rather than
 * silently returning a stale document.
 */
test('the bridge reads through describe() and never through the removed settings.get()', async () => {
  const host = bridge({ supportsStore: true });
  const response = await host.request();
  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.compat.supportsStore, true);
});

/**
 * The revision is read from the same describe() as the value, so a concurrent
 * edit is fenced by the next request without any cached-revision state: the
 * client's stale revision is refused, and a fresh GET carries the new fence.
 */
test('a concurrent edit is fenced by a live revision, not a cached one', async () => {
  const host = bridge({ supportsStore: true });
  const first = (await host.request()).json;
  assert.equal(first.revision, 7);
  host.bumpRevision();
  const stale = await host.request('POST', {
    provider: 'test',
    revision: first.revision,
    models: [{ id: 'test', input: null, reasoningEfforts: null }],
    compatPatch: {},
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'conflict');
  const fresh = await host.request();
  assert.equal(fresh.json.revision, 8);
  const retried = await host.request('POST', {
    provider: 'test',
    revision: fresh.json.revision,
    models: [{ id: 'test', input: null, reasoningEfforts: null }],
    compatPatch: {},
  });
  assert.equal(retried.status, 200);
  assert.equal(retried.json.view.revision, 9, 'the committed view carries the post-write revision');
});

/**
 * A composition without the llm-pi-ai entry has no descriptor; the bridge must
 * report provider-not-found instead of dereferencing undefined.
 */
test('a detached settings namespace answers provider-not-found', async () => {
  const host = bridge({ supportsStore: true }, { detached: true });
  const response = await host.request();
  assert.equal(response.status, 404);
  assert.equal(response.json.error, 'provider-not-found');
});
