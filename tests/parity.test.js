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

test('installed pi-ai offer/withhold gates, profile, schema and enums match this card', { skip: !adapterPath && !required ? 'Set DSH_PI_AI_PATH to an installed dsh-llm-pi-ai package to check upstream parity' : false }, (t) => {
  assert.ok(adapterPath, 'DSH_PI_AI_PATH is required for test:parity when pi-ai is not locally resolvable');
  const manifest = JSON.parse(readFileSync(join(adapterPath, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@deepseek-ai/dsh-llm-pi-ai');
  assert.equal(manifest.version, '0.1.7-alpha.2', 'Re-audit offer/withhold and update the pinned compatibility target');
  const declarations = readFileSync(join(adapterPath, 'lib/types/catalog.d.ts'), 'utf8');
  const source = readFileSync(join(adapterPath, 'lib/index.js'), 'utf8');
  const gates = [...declarations.matchAll(/declare const (\w+_COMPAT_GATE): \{([\s\S]*?)\n\};/g)];
  assert.equal(gates.length, 4, 'All protocol gates must be inspected');
  const dispositions = gates.flatMap(([, , body]) => [...body.matchAll(/readonly (\w+): "(offer|withhold)";/g)].map(([, key, disposition]) => ({ key, disposition })));
  const offered = unique(dispositions.filter(({ disposition }) => disposition === 'offer').map(({ key }) => key));
  const withheld = unique(dispositions.filter(({ disposition }) => disposition === 'withhold').map(({ key }) => key));
  assert.equal(offered.length, 26);
  assert.equal(withheld.length, 13);
  const covered = [...COMPAT_FIELDS.map(({ key }) => key), ...COMPAT_UNDISPLAYED_KEYS];
  assert.equal(new Set(covered).size, covered.length, 'No duplicate or ambiguously classified fields');
  assert.deepEqual(sorted(covered), sorted(offered));
  assert.deepEqual(sorted(COMPAT_WITHHELD_KEYS), sorted(withheld));
  assert.deepEqual(sorted([...rendered.map(({ key }) => key), ...COMPAT_UNDISPLAYED_KEYS]), sorted(offered));
  assert.ok(withheld.every((key) => !covered.includes(key)));

  const profile = declarations.match(/export interface PiAiCompatProfile \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(profile, 'Expected exported profile interface');
  assert.deepEqual(sorted([...profile.matchAll(/^\s+(\w+)\?:/gm)].map(([, key]) => key)), sorted(offered));
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
  t.diagnostic(manifest.version + ': 26 offered = 24 rendered (19 bool / 4 enum / 1 integer) + 2 preserved dictionaries; 13 withheld; all profile/schema keys and enum values match');
});
