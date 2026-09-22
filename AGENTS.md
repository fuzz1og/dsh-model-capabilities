# AGENTS.md

## DeepSeek Harness plugin development

Before changing plugin code, read https://dsh.pub/develop-plugin.md completely.
Follow the pinned runtime contract and verification boundaries there; this
repository's own security, testing, and release rules remain authoritative.

## Repository layout

- `lib/index.js` — Host module (ESM, committed artifact, no build step). Owns
  the same-origin HTTP bridge: GET/POST `/model-capabilities` against the
  `llm-pi-ai` settings entry through `ctx.settings` (read via `describe()`,
  which yields the entry's `value` and `revision` together; write via
  `mutate()`). Do NOT call `settings.get(ns)` or `settings.register(...)`:
  both were removed in dsh 0.1.7-alpha.1, where a settings namespace IS a
  profile entry's own Config.
- `lib/client.js` — Web client, hand-written in the DSH loader's lazy-CJS
  factory form: `window.__ModuleLoader__.load({ id, factory })`. The factory
  resolves `react` and `@deepseek-ai/dsh-client-ui-primitives` at runtime
  through the client module system. Do not convert it to a plain ESM module.
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
- `lib/client.js` must stay a single classic script: no `import`, no JSX
  (use `React.createElement`), no bundler-only syntax.
- Every mutation must surface conflict (`conflict`) and schema rejection
  verbatim in the UI; never report an optimistic write as durable.
- Before changing the slot registration, re-inspect the live
  `settings.models.provider-card` contract in the target DSH version.
- Before relying on any `@deepseek-ai/dsh-client-ui-primitives` export, confirm
  the name exists in the installed client bundle. Icon exports are
  thickness-suffixed pairs (`…OutlineRegular` / `…OutlineMedium` as of
  0.1.7-alpha.1) and have been renamed between releases; resolve new names first
  with old ones as fallbacks so a rename degrades to a working icon rather than
  silently to `undefined`.
