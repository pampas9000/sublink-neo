import { RuntimeBindings, NormalizedRuntime } from '../schemas/index.ts';

const DEFAULTS = {
    configTtlSeconds: 60 * 60 * 24 * 30
};

/**
 * Normalize optional runtime bindings and provide safe defaults.
 *
 * @param {RuntimeBindings} runtime
 * @returns {NormalizedRuntime}
 */
export function normalizeRuntime(runtime: RuntimeBindings = {}): NormalizedRuntime {
    return {
        kv: runtime.kv ?? null,
        d1: runtime.d1 ?? null,
        assetFetcher: runtime.assetFetcher ?? null,
        logger: runtime.logger ?? console,
        config: {
            configTtlSeconds: runtime.config?.configTtlSeconds ?? DEFAULTS.configTtlSeconds,
            shortLinkTtlSeconds: runtime.config?.shortLinkTtlSeconds ?? null
        }
    };
}
