# AGENTS.md

## DeepSeek Harness plugin development

Before changing plugin code, read https://dsh.pub/develop-plugin.md completely.
Follow the pinned runtime contract and verification boundaries there; this
repository's own security, testing, and release rules remain authoritative.

## Repository layout

- `lib/index.js` — Host module (ESM, committed artifact, no build step).
- `lib/client.js` — Web client, hand-written in the DSH loader's lazy-CJS
  factory form: `window.__ModuleLoader__.load({ id, factory })`. The factory
  resolves `react` and `@deepseek-ai/dsh-client-ui-primitives` at runtime
  through the client module system. Do not convert it to a plain ESM module.
- `cordis.patch.yml` — `dsh.bundle.patch` layer mounting the row.

## Rules

- The browser half reads and writes ONLY through `ctx.remote.settings`
  (describe / mutate) on the `llm-pi-ai` namespace; never touch the settings
  document directly and never guess another write path.
- The Host half stays minimal: no durable data is owned here.
- `lib/client.js` must stay a single classic script: no `import`, no JSX
  (use `React.createElement`), no bundler-only syntax.
- Every mutation must surface conflict (`settings/conflict`) and schema
  rejection verbatim in the UI; never report an optimistic write as durable.
- Before changing the slot registration, re-inspect the live
  `settings.models.provider-card` contract in the target DSH version.
