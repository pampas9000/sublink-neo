import Redis from 'ioredis';
import { createFileAssetFetcher } from '../adapters/assets/fileAssetFetcher.ts';
import { UpstashKVAdapter } from '../adapters/kv/upstashKv.ts';
import { MemoryKVAdapter } from '../adapters/kv/memoryKv.ts';
import { RedisKVAdapter } from '../adapters/kv/redisKv.ts';
import { NormalizedRuntime, KeyValueStore } from '../schemas/index.ts';

/**
 * Create a runtime environment for Node.js.
 */
export function createNodeRuntime(env: any = process.env): NormalizedRuntime {
    return {
        kv: resolveKv(env),
        assetFetcher: createFileAssetFetcher(env.STATIC_DIR || 'public'),
        logger: console,
        config: {
            configTtlSeconds: parseNumber(env.CONFIG_TTL_SECONDS) ?? 60 * 60 * 24 * 30,
            shortLinkTtlSeconds: parseNumber(env.SHORT_LINK_TTL_SECONDS) ?? null
        }
    };
}

function resolveKv(env: any): KeyValueStore | null {
    const redisAdapter = createRedisAdapter(env);
    if (redisAdapter) {
        return redisAdapter;
    }
    if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
        return new UpstashKVAdapter({
            url: env.KV_REST_API_URL,
            token: env.KV_REST_API_TOKEN
        });
    }
    if (env.DISABLE_MEMORY_KV === 'true') {
        return null;
    }
    return new MemoryKVAdapter();
}

function createRedisAdapter(env: any): RedisKVAdapter | null {
    const connection = buildRedisConnection(env);
    if (!connection) {
        return null;
    }
    const client = connection.url
        ? new Redis(connection.url, connection.options)
        : new Redis(connection.options);
    return new RedisKVAdapter({
        client,
        prefix: connection.prefix,
        manageConnection: true
    });
}

interface RedisConnection {
    url?: string;
    prefix?: string;
    options: any;
}

function buildRedisConnection(env: any): RedisConnection | null {
    const prefix = env.REDIS_KEY_PREFIX || undefined;
    const commonOptions = buildCommonRedisOptions(env);
    if (env.REDIS_URL) {
        return {
            url: env.REDIS_URL,
            prefix,
            options: commonOptions
        };
    }
    if (env.REDIS_HOST && env.REDIS_PORT) {
        return {
            prefix,
            options: {
                ...commonOptions,
                host: env.REDIS_HOST,
                port: Number(env.REDIS_PORT)
            }
        };
    }
    return null;
}

function buildCommonRedisOptions(env: any): any {
    const options: any = {};
    if (env.REDIS_USERNAME) {
        options.username = env.REDIS_USERNAME;
    }
    if (env.REDIS_PASSWORD) {
        options.password = env.REDIS_PASSWORD;
    }
    if (env.REDIS_TLS === 'true') {
        options.tls = {};
    }
    return options;
}

function parseNumber(value: any): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
