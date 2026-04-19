import { CloudflareKVAdapter } from '../adapters/kv/cloudflareKv.ts';
import { NormalizedRuntime } from '../schemas/index.ts';

export interface CloudflareEnv {
    SUBLINK_KV?: any;
    SUBLINK_D1?: any;
    ASSETS?: { fetch: (request: Request | string) => Promise<Response> };
}

export function createCloudflareRuntime(env: CloudflareEnv): NormalizedRuntime {
    return {
        kv: env?.SUBLINK_KV ? new CloudflareKVAdapter(env.SUBLINK_KV) : null,
        d1: env?.SUBLINK_D1 ?? null,
        assetFetcher: env?.ASSETS ? (request: any) => env.ASSETS!.fetch(request) : null,
        logger: console,
        config: {
            configTtlSeconds: 60 * 60 * 24 * 30, // Default fallback
            shortLinkTtlSeconds: null
        }
    };
}
