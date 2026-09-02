/**
 * dsh-model-capabilities — host half.
 *
 * Deliberately minimal. The browser half owns the whole interaction path:
 * it reads the `llm-pi-ai` settings namespace through the official browser
 * settings wire (`ctx.remote.settings.describe`) and writes per-model
 * capabilities through `ctx.remote.settings.mutate` — the exact same APIs the
 * official Models settings page uses, so revision fencing and pi-ai schema
 * validation apply to every write.
 *
 * This Host face exists so the bundle carries a mountable row; it does not
 * own any durable data (the pi-ai adapter owns the `llm-pi-ai` namespace).
 */
export const name = 'model-capabilities';

export function apply(ctx) {
  ctx.effect(() => {
    console.log('[dsh-model-capabilities] mounted');
    return () => console.log('[dsh-model-capabilities] unmounted');
  });
}
