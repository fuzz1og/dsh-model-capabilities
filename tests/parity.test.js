import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { COMPAT_FIELDS, COMPAT_UNDISPLAYED_KEYS, COMPAT_WITHHELD_KEYS } from '../lib/index.js';
import { client, wire } from './harness.js';

const sorted = (values) => [...values].sort();
const unique = (values) => [...new Set(values)];
const ui = client().ui;
const rendered = [
  ...ui.COMPAT_BOOL_FIELDS.map(({ key }) => ({ key, kind: 'bool' })),
  ...ui.COMPAT_ENUMS.map(({ key, values }) => ({ key, kind: 'enum', values: wire(values) })),
  ...ui.COMPAT_INT_FIELDS.map(({ key }) => ({ key, kind: 'int' })),
];

test('Host and client offer exactly the same controls, kinds, enum values and integer bounds', () => {
  assert.deepEqual(rendered.sort((a, b) => a.key.localeCompare(b.key)), [...COMPAT_FIELDS].sort((a, b) => a.key.localeCompare(b.key)));
  assert.equal(ui.VLLM_PRIORITY_MIN, -2147483648);
  assert.equal(ui.VLLM_PRIORITY_MAX, 2147483647);
});

// No machine-specific paths in the repository. Explicit path is mandatory in
// CI via test:parity; ordinary npm test can run without an installed Harness.
let adapterPath = process.env.DSH_PI_AI_PATH;
if (!adapterPath) {
  try { adapterPath = dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm-pi-ai/package.json')); } catch {}
}
const required = process.env.DSH_REQUIRE_PI_AI_PARITY === '1';

/**
 * Every `key: "offer" | "withhold"` pair the adapter's gate tables declare.
 *
 * dsh 0.2.0-rc.2 ships the gates in `lib/index.js` (the compiled bundle), not in
 * the `lib/types/catalog.d.ts` declaration file this check used to read: an
 * installed package has no `types/` directory at all. Both layouts are
 * supported — the declaration file when present, the runtime module otherwise —
 * because the withheld set is what a user's stored profile is diagnosed
 * against, and it must be read from whatever the installed version actually
 * ships.
 *
 * @param source - the adapter's `lib/index.js`.
 * @param declarations - its `lib/types/catalog.d.ts`, when the package ships one.
 * @returns the disposition of every field any protocol gate classifies.
 */
function gateDispositions(source, declarations) {
  const regions = [];
  if (declarations !== undefined) {
    for (const [, , body] of declarations.matchAll(/declare const (\w+_COMPAT_GATE): \{([\s\S]*?)\n\};/g)) regions.push(body);
  }
  // Named tables (`const X_COMPAT_GATE = { … };`) plus the protocol map itself,
  // whose gates may be declared inline.
  for (const [, body] of source.matchAll(/const \w*_COMPAT_GATE = \{([\s\S]*?)\n\};/g)) regions.push(body);
  for (const [, body] of source.matchAll(/const COMPAT_GATES = \{([\s\S]*?)\n\};/g)) regions.push(body);
  const pairs = regions.flatMap((body) => [...body.matchAll(/(\w+): "(offer|withhold)"/g)].map(([, key, disposition]) => ({ key, disposition })));
  return {
    offered: unique(pairs.filter(({ disposition }) => disposition === 'offer').map(({ key }) => key)),
    withheld: unique(pairs.filter(({ disposition }) => disposition === 'withhold').map(({ key }) => key)),
    protocols: unique([...source.matchAll(/^\s*"[a-z-]+(?:-[a-z]+)*": (?:\w*_COMPAT_GATE|\{)/gm)].map(([line]) => line.trim())).length,
  };
}

test('installed pi-ai offer/withhold gates, schema and enums match this card', { skip: !adapterPath && !required ? 'Set DSH_PI_AI_PATH to an installed dsh-llm-pi-ai package to check upstream parity' : false }, (t) => {
  assert.ok(adapterPath, 'DSH_PI_AI_PATH is required for test:parity when pi-ai is not locally resolvable');
  const manifest = JSON.parse(readFileSync(join(adapterPath, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@deepseek-ai/dsh-llm-pi-ai');
  assert.equal(manifest.version, '0.2.0-rc.2', 'Re-audit offer/withhold and update the pinned compatibility target');
  const source = readFileSync(join(adapterPath, 'lib/index.js'), 'utf8');
  let declarations;
  try { declarations = readFileSync(join(adapterPath, 'lib/types/catalog.d.ts'), 'utf8'); } catch { declarations = undefined; }

  const gates = gateDispositions(source, declarations);
  assert.ok(gates.protocols >= 6, `Expected every protocol gate to be inspected, found ${gates.protocols}`);
  const offered = gates.offered;
  const withheld = gates.withheld;
  assert.equal(offered.length, 26);
  assert.equal(withheld.length, 14);
  const covered = [...COMPAT_FIELDS.map(({ key }) => key), ...COMPAT_UNDISPLAYED_KEYS];
  assert.equal(new Set(covered).size, covered.length, 'No duplicate or ambiguously classified fields');
  assert.deepEqual(sorted(covered), sorted(offered));
  assert.deepEqual(sorted(COMPAT_WITHHELD_KEYS), sorted(withheld));
  assert.deepEqual(sorted([...rendered.map(({ key }) => key), ...COMPAT_UNDISPLAYED_KEYS]), sorted(offered));
  assert.ok(withheld.every((key) => !covered.includes(key)));

  const schema = source.match(/const compatProfile = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(schema, 'Expected adapter compat schema');
  const schemaFields = [...schema.matchAll(/^\s*(\w+): (.+?)(?:,)?$/gm)];
  assert.deepEqual(sorted(schemaFields.map(([, key]) => key)), sorted(offered));
  for (const { key, kind } of COMPAT_FIELDS) {
    const expression = schemaFields.find(([, name]) => name === key)?.[2];
    if (kind === 'bool') assert.match(expression, /^z\.boolean\(\)/, key);
    if (kind === 'int') assert.match(expression, /^z\.number\(\)\.step\(1\)/, key);
  }
  for (const key of COMPAT_UNDISPLAYED_KEYS) assert.match(schemaFields.find(([, name]) => name === key)[2], /^z\.dict\(chatTemplateKwarg\)/);
  const names = { maxTokensField: 'MAX_TOKENS_FIELDS', thinkingFormat: 'SUPPORTED_THINKING_FORMATS', thinkingTokenBudgetField: 'THINKING_TOKEN_BUDGET_FIELDS', cacheControlFormat: 'CACHE_CONTROL_FORMATS' };
  for (const { key, values } of COMPAT_FIELDS.filter(({ kind }) => kind === 'enum')) {
    const body = source.match(new RegExp('const ' + names[key] + ' = Object\\.keys\\(\\{([\\s\\S]*?)\\}\\);'))?.[1];
    assert.ok(body, 'Expected runtime enum ' + names[key]);
    const upstreamValues = [...body.matchAll(/(?:"([^"\n]+)"|([\w-]+)):\s*true/g)].map(([, quoted, bare]) => quoted ?? bare);
    assert.deepEqual(sorted(values), sorted(upstreamValues), key);
    assert.ok(schemaFields.find(([, name]) => name === key)[2].includes('z.union(' + names[key] + ')'));
  }
  // The thinking levels a tier may name, and the modalities the adapter accepts,
  // are the two other closed sets this bundle depends on.
  const levels = source.match(/const THINKING_LEVELS = Object\.keys\(\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(levels, 'Expected THINKING_LEVELS');
  assert.deepEqual(sorted([...levels.matchAll(/([\w-]+): true/g)].map(([, level]) => level)), sorted(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']));
  t.diagnostic(`${manifest.version}: ${offered.length} offered = 24 rendered (19 bool / 4 enum / 1 integer) + 2 preserved dictionaries; ${withheld.length} withheld; profile schema, enum values and thinking levels all match`);
});
