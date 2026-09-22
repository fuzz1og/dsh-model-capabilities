import assert from 'node:assert/strict';
import test from 'node:test';
import { client, nodes } from './harness.js';

/**
 * The standalone settings page (`settings.section`). It exists for the two gaps
 * the official Models page leaves: a custom provider has no extension seat while
 * being created, and a catalog route has no stored models list so the official
 * editor never reaches the route-level fields it still owns.
 *
 * Two levels are covered separately and honestly:
 *   - the page: navigation, selection and the index load (wiring)
 *   - the editor: route-level editing on a catalog route (rendered directly, the
 *     same way the inline-card regressions drive it)
 * The page is a host to the SAME editor, so the editor is not tested twice.
 */

/** String children rendered anywhere in a tree (host elements only). */
function textOf(tree) {
  if (typeof tree === 'string') return tree;
  if (typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  if (!tree || typeof tree !== 'object') return '';
  return textOf(tree.props?.children);
}

/** A fetch double answering both the index route and a per-provider view. */
function indexFetch(providers, options = {}) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('/model-capabilities/providers')) {
      if (options.indexError !== undefined) {
        return { ok: true, json: async () => ({ ok: false, error: options.indexError }) };
      }
      return { ok: true, json: async () => ({ ok: true, revision: 3, providers }) };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        revision: 3,
        hasModelsList: options.hasModelsList === true,
        reasoning: null,
        defaultInput: [],
        compat: null,
        compatHidden: [],
        baseURL: null,
        headers: null,
        models: options.models ?? [],
      }),
    };
  };
  return { fetch, calls };
}

const row = (provider, extra = {}) => ({
  provider,
  displayName: provider,
  declared: true,
  configured: true,
  hasModelsList: true,
  modelIds: [],
  headerCount: 0,
  compatCount: 0,
  ...extra,
});

test('the index is fetched once and both a custom and a catalog route are listed', async () => {
  const { fetch, calls } = indexFetch([row('gateway'), row('catalog', { declared: false, hasModelsList: false, displayName: 'Catalog' })]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  assert.deepEqual(calls.filter((url) => url.startsWith('/model-capabilities/providers')), ['/model-capabilities/providers']);
  const text = textOf(tree);
  assert.match(text, /gateway/);
  assert.match(text, /Catalog/);
  // Identity labels, so a gateway is distinguishable from a shipped route.
  assert.match(text, /自定义/);
  assert.match(text, /目录/);
  // A catalog row explains the missing model rows instead of looking empty.
  assert.match(text, /内置目录模型/);
});

test('the first route is selected and the shared editor is mounted for that exact route', async () => {
  const { fetch } = indexFetch([row('gateway'), row('other')]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  // The editor must receive the selected route: assert on the element the page
  // composes, which is the whole wiring contract of this pane.
  const editors = nodes(tree, (node) => node.type === browser.ui.ModelCapabilities);
  assert.equal(editors.length, 1, 'exactly one editor pane');
  assert.equal(editors[0].props.provider.provider, 'gateway');
  assert.equal(editors[0].props.configured, true);
  // A fresh mount per route, so a cached view can never bleed across providers.
  assert.equal(editors[0].props.key, 'gateway');
});

test('clicking a nav row re-points the editor at that route', async () => {
  const { fetch } = indexFetch([row('gateway'), row('other')]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  const navRows = nodes(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('mcp-navRow'));
  assert.equal(navRows.length, 2);
  const otherRow = navRows.find((node) => textOf(node).includes('other'));
  assert.ok(otherRow !== undefined, 'second nav row not found');
  otherRow.props.onClick();
  // Re-render with the page's own state (the harness keeps it in the hook array).
  const after = browser.rerenderPage();
  const editors = nodes(after, (node) => node.type === browser.ui.ModelCapabilities);
  assert.equal(editors[0].props.provider.provider, 'other');
});

test('an empty directory renders an explicit empty state, not a blank pane', async () => {
  const { fetch } = indexFetch([]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  assert.match(textOf(tree), /没有可配置的提供方/);
  assert.match(textOf(tree), /从左列选择一个提供方/);
  // No editor is composed with nothing selected.
  assert.equal(nodes(tree, (node) => node.type === browser.ui.ModelCapabilities).length, 0);
});

test('a failed index surfaces the reason and a retry control', async () => {
  const { fetch } = indexFetch([], { indexError: 'settings service unavailable' });
  const browser = client(fetch);
  const tree = await browser.renderPage();
  // The reason rides the official StateDot line, not a silent empty list.
  // `Status` is a child component, so its text prop sits under an element whose
  // type is that function — search by prop, not by depth.
  const statuses = nodes(tree, (node) => typeof node.props?.text === 'string');
  assert.ok(
    statuses.some((node) => String(node.props.text).includes('settings service unavailable')),
    `error text missing: ${JSON.stringify(statuses.map((n) => n.props.text))}`,
  );
  assert.equal(nodes(tree, (node) => node.type === 'Button' && textOf(node).includes('刷新列表')).length, 1);
});

test('a catalog route keeps the route-level editor instead of a dead end', async () => {
  // The gap this page closes. The editor is mounted for a catalog-shaped route:
  // no stored models list, which used to end its render entirely.
  const { fetch } = indexFetch([], { hasModelsList: false });
  const browser = client(fetch);
  const tree = await browser.renderEditor({ provider: { provider: 'catalog' }, configured: true });
  const text = textOf(tree);
  // Route-level surfaces remain reachable.
  assert.match(text, /默认思考强度/);
  assert.match(text, /请求头/);
  assert.match(text, /兼容设置/);
  // The per-model section is gone, with a note saying why.
  assert.doesNotMatch(text, /逐行覆盖提供方默认值/);
  assert.match(text, /内置目录模型/);
  // And the save control is enabled: a missing models list must not disable a
  // route-level save (that was the 409 the Host used to return).
  const save = nodes(tree, (node) => node.type === 'Button' && textOf(node).includes('应用能力配置'));
  assert.equal(save.length, 1);
  assert.equal(save[0].props.disabled, false);
});

test('a route with a stored list keeps the per-model editor and its save gate', async () => {
  // The contrast case: the per-model section is present, and an empty list still
  // gates the save (a route with a models key must declare at least one model).
  const { fetch } = indexFetch([], { hasModelsList: true, models: [{ id: 'm1', input: [] }] });
  const browser = client(fetch);
  const tree = await browser.renderEditor(
    { provider: { provider: 'gateway' }, configured: true },
    browser.ui.loadView(3, {
      hasModelsList: true,
      reasoning: null,
      defaultInput: [],
      compat: null,
      compatHidden: [],
      baseURL: null,
      headers: null,
      models: [{ id: 'm1', input: [] }],
    }),
  );
  const text = textOf(tree);
  assert.match(text, /逐行覆盖提供方默认值/);
  assert.doesNotMatch(text, /内置目录模型/);
  const save = nodes(tree, (node) => node.type === 'Button' && textOf(node).includes('应用能力配置'));
  assert.equal(save.length, 1);
  assert.equal(save[0].props.disabled, false);
});

test('the default selection prefers a configured route over an unconfigured catalog one', async () => {
  // The list is alphabetical, so its first row is almost always an unconfigured
  // catalog route — which the editor answers with `provider-not-found`. Opening
  // on that is a bad first impression, so a configured custom route wins.
  const { fetch } = indexFetch([
    row('aaa-catalog', { declared: false, configured: false, hasModelsList: false }),
    row('bbb-catalog', { declared: false, configured: false, hasModelsList: false }),
    row('zzz-gateway', { declared: true, configured: true }),
  ]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  const editors = nodes(tree, (node) => node.type === browser.ui.ModelCapabilities);
  assert.equal(editors.length, 1, 'a configured route must be selected, not an unconfigured one');
  assert.equal(editors[0].props.provider.provider, 'zzz-gateway');
});

test('unconfigured routes are hidden by default and revealed by the toggle', async () => {
  // ~40 shipped catalog routes have no stored profile; listing them all buries
  // the routes a user owns, and each one would error if selected.
  const { fetch } = indexFetch([
    row('catalog-a', { declared: false, configured: false, hasModelsList: false }),
    row('gateway', { declared: true, configured: true }),
  ]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  const navRows = () => nodes(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('mcp-navRow'));
  // Only the configured route is listed...
  assert.equal(navRows().length, 1);
  assert.match(textOf(tree), /已配置 1/);
  assert.match(textOf(tree), /全部 2/);

  // ...until the toggle asks for everything.
  const all = nodes(tree, (node) => node.type === 'Button' && textOf(node).includes('全部'));
  assert.equal(all.length, 1);
  all[0].props.onClick();
  const expanded = browser.rerenderPage();
  const expandedRows = nodes(expanded, (node) => typeof node.props?.className === 'string' && node.props.className.includes('mcp-navRow'));
  assert.equal(expandedRows.length, 2);
});

test('selecting an unconfigured route explains itself instead of erroring', async () => {
  // With the toggle on, an unconfigured route can be selected. It has no stored
  // profile, so the editor's GET would 404: say that plainly and point at the
  // official page rather than rendering a bare `provider-not-found`.
  const { fetch, calls } = indexFetch([
    row('catalog-a', { declared: false, configured: false, hasModelsList: false, displayName: 'Catalog A' }),
    row('gateway', { declared: true, configured: true }),
  ]);
  const browser = client(fetch);
  let tree = await browser.renderPage();
  const all = nodes(tree, (node) => node.type === 'Button' && textOf(node).includes('全部'));
  all[0].props.onClick();
  tree = browser.rerenderPage();
  const catalogRow = nodes(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('mcp-navRow'))
    .find((node) => textOf(node).includes('Catalog A'));
  assert.ok(catalogRow !== undefined, 'catalog row not found after expanding');
  catalogRow.props.onClick();
  tree = browser.rerenderPage();

  // Guidance, not the editor and not an error.
  assert.match(textOf(tree), /尚未配置/);
  assert.match(textOf(tree), /官方 Models 页/);
  assert.equal(nodes(tree, (node) => node.type === browser.ui.ModelCapabilities).length, 0);
  assert.doesNotMatch(textOf(tree), /provider-not-found/);
  // And no request was made for a profile that cannot exist.
  assert.equal(calls.filter((url) => url.includes('provider=catalog-a')).length, 0);
});
