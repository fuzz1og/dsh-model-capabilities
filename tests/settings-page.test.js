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
  const posts = [];
  const fetch = async (url, init) => {
    calls.push(String(url));
    if (init !== undefined && init.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
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
        compat: null,
        compatHidden: [],
        baseURL: null,
        headers: null,
        models: options.models ?? [],
      }),
    };
  };
  return { fetch, calls, posts };
}

const row = (provider, extra = {}) => ({
  provider,
  displayName: provider,
  declared: true,
  configured: true,
  hasModelsList: true,
  modelIds: [],
  modelCount: 0,
  standardCount: 0,
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
  assert.doesNotMatch(text, /模型思考档位/);
  assert.match(text, /内置目录模型/);
  // A catalog route has no models list to roll the tier onto, so the header
  // action is withheld rather than offered and then refused by the Host.
  assert.equal(nodes(tree, (node) => node.type === 'Button' && typeof node.props?.title === 'string' && node.props.title.includes('标准档位')).length, 0);
  // And the save control is enabled: a missing models list must not disable a
  // route-level save (that was the 409 the Host used to return).
  const save = nodes(tree, (node) => node.type === 'Button' && textOf(node).includes('应用能力配置'));
  assert.equal(save.length, 1);
  assert.equal(save[0].props.disabled, false);
});

test('a route with a stored list keeps the per-model editor and its save gate', async () => {
  // The contrast case: the per-model section is present, and an empty list still
  // gates the save (a route with a models key must declare at least one model).
  const { fetch } = indexFetch([], { hasModelsList: true, models: [{ id: 'm1' }] });
  const browser = client(fetch);
  const tree = await browser.renderEditor(
    { provider: { provider: 'gateway' }, configured: true },
    browser.ui.loadView(3, {
      hasModelsList: true,
      reasoning: null,
      compat: null,
      compatHidden: [],
      baseURL: null,
      headers: null,
      models: [{ id: 'm1' }],
    }),
  );
  const text = textOf(tree);
  assert.match(text, /模型思考档位（1）/);
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
  // ...and the official segmented filter states both counts (the labels live on
  // the SegmentedControl options, which the harness renders as data).
  const filter = nodes(tree, (node) => node.type === 'SegmentedControl');
  assert.equal(filter.length, 1);
  // Copied into this realm: the props came out of the client's own vm context,
  // and both its objects and the arrays its own `.map` returns fail a strict
  // prototype comparison here.
  assert.deepEqual(Array.from(filter[0].props.options, (option) => String(option.value)), ['configured', 'all']);
  assert.deepEqual(Array.from(filter[0].props.options, (option) => String(option.label)), ['已配置 1', '全部 2']);

  // ...until the filter asks for everything.
  filter[0].props.onChange('all');
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
  const filter = nodes(tree, (node) => node.type === 'SegmentedControl');
  filter[0].props.onChange('all');
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

test('the build contributes exactly one surface: the settings page', async () => {
  // The inline `settings.models.provider-card` cell was removed once the page
  // could reach every route. Two surfaces editing the same fields invite drift,
  // and the card could never render during a custom provider's creation anyway.
  const browser = client(indexFetch([]).fetch);
  const registrations = browser.applySlots();
  assert.deepEqual(registrations.map((r) => r.name), ['settings.section']);
  assert.equal(
    registrations.some((r) => r.name === 'settings.models.provider-card'),
    false,
    'the inline Models-card cell must no longer be contributed',
  );
  const page = registrations[0];
  assert.equal(page.id, 'model-capabilities');
  assert.equal(page.order, 16);
  assert.equal(page.label, '模型能力');
});

test('every disclosure row is given the icon its contract requires', async () => {
  // DisclosureRow's `icon` is a required prop. Omitting it left an empty 16px
  // leading box, and the hover chevron then swapped in from nothing.
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
      models: [{ id: 'm1' }],
    }),
  );
  const rows = nodes(tree, (node) => node.type === 'DisclosureRow');
  assert.ok(rows.length >= 3, `expected the compat, headers and model rows, got ${rows.length}`);
  for (const row of rows) {
    assert.ok(row.props.icon !== undefined && row.props.icon !== null, `a disclosure row has no icon: ${row.props.title}`);
  }
});

test('collapsed summaries are told to shrink, so they cannot wrap in the 24px row', async () => {
  // A disclosure row is a fixed 24px flex line whose children are `flex: none`.
  // A long summary therefore wrapped to several lines and `overflow: hidden`
  // sliced it into overlapping text (measured: a 54px summary in a 24px row).
  const { fetch } = indexFetch([], { hasModelsList: true, models: [{ id: 'm1' }] });
  const browser = client(fetch);
  const tree = await browser.renderEditor(
    { provider: { provider: 'gateway' }, configured: true },
    browser.ui.loadView(3, {
      hasModelsList: true,
      reasoning: null,
      compat: null,
      compatHidden: [],
      baseURL: null,
      headers: null,
      models: [{ id: 'm1' }],
    }),
  );
  const rows = nodes(tree, (node) => node.type === 'DisclosureRow');
  // The text-bearing summaries must carry the shrink+ellipsize class...
  const summaries = rows
    .map((row) => row.props.collapsedContent)
    .filter((content) => content !== undefined && content !== null);
  assert.ok(summaries.length >= 2, 'expected collapsed summaries');
  for (const content of summaries) {
    const cls = String(content.props?.className ?? '');
    assert.ok(
      cls.includes('mc-collapsed') || cls.includes('mc-modelSummary'),
      `a collapsed summary cannot shrink: "${cls}"`,
    );
  }
  // ...and the model summary must not wrap its pills.
  const pillSummary = summaries.find((c) => String(c.props?.className).includes('mc-modelSummary'));
  assert.ok(pillSummary !== undefined, 'model summary not found');
});

test('the editor header names the provider and keeps the 标准档位 action beside it', async () => {
  // "Right of the provider name" is the placement contract: the header carries
  // the display name (falling back to the route id), the directory tag, and the
  // one-click tier action in the same line.
  const { fetch } = indexFetch([], { hasModelsList: true, models: [{ id: 'm1' }] });
  const browser = client(fetch);
  const tree = await browser.renderEditor({ provider: { provider: 'gateway', displayName: 'Gateway One', declared: true }, configured: true });
  const name = nodes(tree, (node) => node.props?.className === 'mc-headName');
  assert.equal(name.length, 1);
  assert.equal(textOf(name[0]), 'Gateway One');
  // The route id stays visible when it differs from the display name.
  assert.match(textOf(tree), /gateway/);
  assert.match(textOf(tree), /自定义/);
  // One action, disabled only while a write is in flight.
  const tier = nodes(tree, (node) => node.type === 'Button' && String(node.props?.title ?? '').includes('标准档位'));
  assert.equal(tier.length, 1);
  assert.equal(tier[0].props.disabled, false);
  assert.match(textOf(tree), /已是标准档位 0\/1/);
});

test('the provider-level 标准档位 action writes the tier to every model in one click', async () => {
  // pi-ai has no named tier, so the action expands 标准档位 into the same
  // reasoningEfforts dict the injector writes — for EVERY model of the route,
  // including one currently disabled and one with a custom list.
  const { fetch, posts } = indexFetch([], { hasModelsList: true, models: [{ id: 'm1' }] });
  const browser = client(fetch);
  const snapshot = browser.ui.loadView(3, {
    hasModelsList: true,
    reasoning: null,
    compat: null,
    compatHidden: [],
    baseURL: null,
    headers: null,
    models: [
      { id: 'm1' },
      { id: 'm2', reasoningEfforts: false },
      { id: 'm3', reasoningEfforts: { off: null, low: 'low', high: 'ultra', max: 'max' } },
    ],
  });
  const tree = browser.render(snapshot, { provider: { provider: 'gateway' }, configured: true });
  const tier = nodes(tree, (node) => node.type === 'Button' && String(node.props?.title ?? '').includes('标准档位'));
  assert.equal(tier.length, 1);
  tier[0].props.onClick();
  // The handler commits immediately: one POST, no second click.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].provider, 'gateway');
  // Normalized into this realm: the payload came out of the client's own vm
  // context, whose objects fail a strict prototype comparison.
  const written = JSON.parse(JSON.stringify(posts[0].models));
  const expectedTier = { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' };
  assert.deepEqual(written, [
    { id: 'm1', reasoningEfforts: expectedTier },
    { id: 'm2', reasoningEfforts: expectedTier },
    { id: 'm3', reasoningEfforts: expectedTier },
  ]);
});

test('a model already on the standard tier is reported as such, not re-staged as custom', async () => {
  // The same dict written by the injector must read back as 标准档位 in the row
  // summary — otherwise a back-filled model would look like a hand-written list
  // and the header count would never reach "all standard".
  const { fetch } = indexFetch([], { hasModelsList: true, models: [{ id: 'm1' }] });
  const browser = client(fetch);
  const tree = browser.render(browser.ui.loadView(3, {
    hasModelsList: true,
    reasoning: null,
    compat: null,
    compatHidden: [],
    baseURL: null,
    headers: null,
    // Key order differs from the constant on purpose: the dict is a declaration.
    models: [{ id: 'm1', reasoningEfforts: { max: 'max', high: 'high', medium: 'medium', low: 'low', off: null } }],
  }));
  assert.match(textOf(tree), /全部 1 个模型已是标准档位/);
  // The row summary is a DisclosureRow prop, not a child, so read it there.
  const rows = nodes(tree, (node) => node.type === 'DisclosureRow' && node.props?.title === 'm1');
  assert.equal(rows.length, 1);
  assert.match(textOf(rows[0].props.collapsedContent), /标准档位/);
});

test('the provider list marks routes already on the standard tier', async () => {
  const { fetch } = indexFetch([
    row('standard-route', { modelCount: 2, standardCount: 2, modelIds: ['a', 'b'] }),
    row('partial-route', { modelCount: 3, standardCount: 1, modelIds: ['c'] }),
  ]);
  const browser = client(fetch);
  const tree = await browser.renderPage();
  const navRows = nodes(tree, (node) => typeof node.props?.className === 'string' && node.props.className.includes('mcp-navRow'));
  const standardRow = navRows.find((node) => textOf(node).includes('standard-route'));
  const partialRow = navRows.find((node) => textOf(node).includes('partial-route'));
  assert.ok(standardRow !== undefined && partialRow !== undefined);
  assert.match(textOf(standardRow), /标准档位/);
  assert.doesNotMatch(textOf(partialRow), /标准档位/);
});
