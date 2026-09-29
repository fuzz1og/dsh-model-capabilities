# AGENTS.md

## DeepSeek Harness plugin development

Before changing plugin code, read https://dsh.pub/develop-plugin.md completely.
Follow the pinned runtime contract and verification boundaries there; this
repository's own security, testing, and release rules remain authoritative.

## Repository layout

- `lib/index.js` — Host module (ESM, committed artifact, no build step). Owns
  the same-origin HTTP bridge: GET/POST `/model-capabilities` plus
  GET `/model-capabilities/providers`, against the `llm-pi-ai` settings entry
  through `ctx.settings` (read via `describe()`, which yields the entry's
  `value` and `revision` together; write via `mutate()`). Do NOT call
  `settings.get(ns)` or `settings.register(...)`: both were removed in dsh
  0.1.7-alpha.1, where a settings namespace IS a profile entry's own Config.
  It also owns the thinking-tier injector (`ensureStandardTiers`), which
  back-fills `STANDARD_REASONING_EFFORTS` into declared routes that declare no
  tiers.
- `lib/client.js` — Web client, hand-written in the DSH loader's lazy-CJS
  factory form: `window.__ModuleLoader__.load({ id, factory })`. The factory
  resolves `react` and `@deepseek-ai/dsh-client-ui-primitives` at runtime
  through the client module system, and registers exactly one surface: the
  `settings.section` page (id `model-capabilities`). Do not convert it to a
  plain ESM module.
- `cordis.patch.yml` — `dsh.bundle.patch` layer mounting the row.

## Rules

- The browser half reads and writes ONLY through the Host bridge
  (same-origin fetch to `/model-capabilities`). Do NOT use `ctx.remote.settings`
  for a third-party bundle: the generated remote wire is not available to
  external client modules (verified — `ctx.remote` is `undefined`), and never
  touch the settings document directly.
- The Host half owns no durable data: the pi-ai adapter owns the `llm-pi-ai`
  namespace; every write goes through the official `settings.mutate` with the
  view revision (conflicts and pi-ai schema rejections surface verbatim).
- **Accepted modalities are not this plugin's business.** `models[].input` and
  `providers.<route>.defaultInput` belong to the official Models page's
  "Input types" editor (dsh 0.2.0+). The bridge neither reads nor writes them;
  do not re-add a second editor for a field another surface already owns.
- **标准档位 is one constant, declared twice on purpose.** The Host owns
  `STANDARD_REASONING_EFFORTS` in `lib/index.js`; the client mirrors it as
  `STANDARD_TIER`. `tests/reasoning-defaults.test.js` loads both files and
  asserts they are equal, so a one-sided edit fails the suite. There is no
  named tier in pi-ai — the tier IS that `reasoningEfforts` dict, and the
  provider-level action expands it for every model of the route.
- `lib/client.js` must stay a single classic script: no `import`, no JSX
  (use `React.createElement`), no bundler-only syntax.
- Every mutation must surface conflict (`conflict`) and schema rejection
  verbatim in the UI; never report an optimistic write as durable.
- Before changing the slot registration, re-inspect the live `settings.section`
  contract in the target DSH version (`kind: list`, scope root; registrant
  options `{ id, order, label }`; owner props `{ close }`).
- Before relying on any `@deepseek-ai/dsh-client-ui-primitives` export, confirm
  the name exists in the installed client bundle. Icon exports are
  thickness-suffixed pairs (`…OutlineRegular` / `…OutlineMedium` as of
  0.1.7-alpha.1) and have been renamed between releases; resolve new names first
  with old ones as fallbacks so a rename degrades to a working icon rather than
  silently to `undefined`. Component exports were verified in the installed
  0.2.0-rc.2 bundle (Button / Pill / Tag / Input / Menu / DisclosureRow /
  SegmentedControl / StateDot); `Tag` and `SegmentedControl` additionally carry
  in-file fallbacks because a missing component throws instead of degrading.
