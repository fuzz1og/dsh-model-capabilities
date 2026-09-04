/**
 * dsh-model-capabilities — host half.
 *
 * Same-origin HTTP bridge for the browser half (the pattern the
 * dsh-font-settings bundle uses): a third-party bundle cannot rely on the
 * generated `ctx.remote.settings` wire, so this Host face owns
 * read-modify-write against the `llm-pi-ai` settings namespace and exposes two
 * small JSON routes:
 *
 *   GET  /model-capabilities?provider=<route>  → view of one provider's models
 *        and capability fields, with the namespace revision for fencing.
 *   POST /model-capabilities                   → merge capability edits into
 *        the provider's models / reasoning / defaultInput / compat and persist
 *        through settings.mutate (revision-fenced, pi-ai schema-validated).
 *
 * Data owner remains the pi-ai adapter's `llm-pi-ai` namespace; nothing is
 * owned here. Both handlers run in the Host realm, so ordinary plain objects
 * pass the settings service's prototype checks.
 */
export const inject = ['webServer'];

const NS = 'llm-pi-ai';
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const MODALITIES = ['text', 'image'];
const THINKING_FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling'];
const MAX_TOKEN_FIELDS = ['max_completion_tokens', 'max_tokens'];
const COMPAT_BOOL_KEYS = ['supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming', 'supportsFinishReason', 'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText', 'requiresReasoningContentOnAssistantMessages', 'supportsThinkingTokenBudget', 'supportsStrictMode', 'supportsLongCacheRetention', 'supportsEagerToolInputStreaming', 'supportsCacheControlOnTools', 'supportsTemperature', 'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools'];
const MAX_BODY_BYTES = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(error);
    };
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) fail(new Error('request body too large'));
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(data);
    });
    req.on('error', (error) => fail(error));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function cleanModalities(value) {
  return Array.isArray(value) ? value.filter((m) => MODALITIES.includes(m)) : null;
}

function cleanEfforts(value) {
  if (value === false) return false;
  if (typeof value !== 'object' || value === null) return null;
  const next = {};
  for (const level of LEVELS) if (value[level] !== undefined) next[level] = value[level];
  return Object.keys(next).length === 0 ? null : next;
}

function cleanCompat(value) {
  if (typeof value !== 'object' || value === null) return null;
  const next = {};
  for (const key of COMPAT_BOOL_KEYS) if (typeof value[key] === 'boolean') next[key] = value[key];
  if (THINKING_FORMATS.includes(value.thinkingFormat)) next.thinkingFormat = value.thinkingFormat;
  if (MAX_TOKEN_FIELDS.includes(value.maxTokensField)) next.maxTokensField = value.maxTokensField;
  return Object.keys(next).length === 0 ? null : next;
}

/** One provider's capability view + the namespace revision the view was read at. */
function viewOf(profile, revision) {
  const out = {
    ok: true,
    revision,
    hasModelsList: Array.isArray(profile.models),
    reasoning: typeof profile.reasoning === 'string' && LEVELS.includes(profile.reasoning) ? profile.reasoning : null,
    defaultInput: cleanModalities(profile.defaultInput),
    compat: cleanCompat(profile.compat),
    models: [],
  };
  if (Array.isArray(profile.models)) {
    out.models = profile.models.map((model) => ({
      id: String(model?.id ?? ''),
      name: typeof model?.name === 'string' ? model.name : null,
      contextWindow: typeof model?.contextWindow === 'number' ? model.contextWindow : null,
      maxTokens: typeof model?.maxTokens === 'number' ? model.maxTokens : null,
      input: cleanModalities(model?.input),
      reasoningEfforts: cleanEfforts(model?.reasoningEfforts),
      compat: model?.compat && typeof model.compat === 'object' ? model.compat : null,
    }));
  }
  return out;
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/model-capabilities',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const settings = ctx.get('settings');
      if (settings === undefined) {
        return sendJson(res, 503, { ok: false, error: 'settings service unavailable' });
      }
      try {
        if (req.method === 'GET' && url.pathname === '/model-capabilities') {
          const provider = url.searchParams.get('provider') ?? '';
          if (provider === '') return sendJson(res, 400, { ok: false, error: 'missing provider' });
          let revision = 0;
          for (const descriptor of settings.describe()) if (descriptor.ns === NS) revision = Number(descriptor.revision) || 0;
          const section = settings.get(NS);
          const profile = typeof section === 'object' && section !== null ? section.providers?.[provider] : undefined;
          if (typeof profile !== 'object' || profile === null) return sendJson(res, 404, { ok: false, error: 'provider-not-found' });
          return sendJson(res, 200, viewOf(profile, revision));
        }
        if (req.method === 'POST' && url.pathname === '/model-capabilities') {
          let payload;
          try {
            payload = JSON.parse(await readBody(req));
          } catch {
            return sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
          }
          const provider = typeof payload?.provider === 'string' ? payload.provider : '';
          if (provider === '') return sendJson(res, 400, { ok: false, error: 'missing provider' });
          const expectedRevision = typeof payload?.revision === 'number' ? payload.revision : undefined;
          const section = settings.get(NS);
          const profile = typeof section === 'object' && section !== null ? section.providers?.[provider] : undefined;
          if (typeof profile !== 'object' || profile === null) return sendJson(res, 404, { ok: false, error: 'provider-not-found' });
          if (!Array.isArray(profile.models)) return sendJson(res, 409, { ok: false, error: 'profile-has-no-models-list' });

          const incoming = Array.isArray(payload.models) ? payload.models : [];
          const byId = new Map(incoming.map((entry) => [String(entry?.id ?? ''), entry]));
          const nextModels = profile.models.map((model) => {
            const edit = byId.get(String(model?.id ?? ''));
            if (edit === undefined) return model;
            const next = { ...model };
            if (edit.input === null || edit.input === undefined) delete next.input;
            else if (Array.isArray(edit.input)) next.input = edit.input.filter((m) => MODALITIES.includes(m));
            if (edit.reasoningEfforts === null || edit.reasoningEfforts === undefined) delete next.reasoningEfforts;
            else if (edit.reasoningEfforts === false) next.reasoningEfforts = false;
            else if (typeof edit.reasoningEfforts === 'object' && edit.reasoningEfforts !== null) {
              const efforts = cleanEfforts(edit.reasoningEfforts);
              if (efforts === null) delete next.reasoningEfforts;
              else next.reasoningEfforts = efforts;
            }
            return next;
          });

          const ops = [{ op: 'set', path: ['providers', provider, 'models'], value: nextModels }];
          const route = ['providers', provider];
          if (payload.reasoning === null || payload.reasoning === undefined) ops.push({ op: 'unset', path: [...route, 'reasoning'] });
          else if (LEVELS.includes(payload.reasoning)) ops.push({ op: 'set', path: [...route, 'reasoning'], value: payload.reasoning });
          if (payload.defaultInput === null || payload.defaultInput === undefined) ops.push({ op: 'unset', path: [...route, 'defaultInput'] });
          else if (Array.isArray(payload.defaultInput)) ops.push({ op: 'set', path: [...route, 'defaultInput'], value: payload.defaultInput.filter((m) => MODALITIES.includes(m)) });

          const patch = typeof payload.compatPatch === 'object' && payload.compatPatch !== null ? payload.compatPatch : {};
          const currentCompat = typeof profile.compat === 'object' && profile.compat !== null ? { ...profile.compat } : {};
          for (const key of ['supportsDeveloperRole', 'supportsReasoningEffort']) {
            if (patch[key] === true || patch[key] === false) currentCompat[key] = patch[key];
            else if (patch[key] === 'unset') delete currentCompat[key];
          }
          for (const key of ['maxTokensField', 'thinkingFormat']) {
            if (MAX_TOKEN_FIELDS.includes(patch[key]) || THINKING_FORMATS.includes(patch[key])) currentCompat[key] = patch[key];
            else if (patch[key] === 'unset') delete currentCompat[key];
          }
          if (Object.keys(currentCompat).length === 0) ops.push({ op: 'unset', path: [...route, 'compat'] });
          else ops.push({ op: 'set', path: [...route, 'compat'], value: currentCompat });

          try {
            await settings.mutate(NS, ops, expectedRevision);
            return sendJson(res, 200, { ok: true });
          } catch (error) {
            if (error?.code === 'SETTINGS_CONFLICT') return sendJson(res, 409, { ok: false, error: 'conflict' });
            return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
          }
        }
        return sendJson(res, 404, { ok: false, error: 'not found' });
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
      }
    },
  }), 'dsh-model-capabilities: routes');
}
