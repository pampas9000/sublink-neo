import * as v from 'valibot';

/**
 * Key-Value Store Interface
 */
export interface KeyValueStore {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

/**
 * D1 Database Interface (Partial for what we need)
 */
export interface D1Result<T = any> {
    results: T[];
    success: boolean;
    error?: string;
    meta?: any;
}

export interface D1Database {
    prepare(query: string): any;
    batch(statements: any[]): Promise<D1Result[]>;
    exec(query: string): Promise<D1Result>;
    dump(): Promise<ArrayBuffer>;
}

/**
 * Asset Fetcher Type
 */
export type AssetFetcher = (request: any) => Promise<any>;

/**
 * Runtime Configuration Schema
 */
export const RuntimeConfigSchema = v.object({
    configTtlSeconds: v.optional(v.number()),
    shortLinkTtlSeconds: v.optional(v.number())
});

export type RuntimeConfig = v.InferOutput<typeof RuntimeConfigSchema>;

/**
 * Runtime Bindings Schema
 */
export const RuntimeBindingsSchema = v.object({
    kv: v.optional(v.union([v.null(), v.any()])),
    d1: v.optional(v.union([v.null(), v.any()])),
    assetFetcher: v.optional(v.union([v.null(), v.any()])),
    logger: v.optional(v.any()),
    config: v.optional(RuntimeConfigSchema)
});

export type RuntimeBindings = v.InferOutput<typeof RuntimeBindingsSchema>;

/**
 * Normalized Runtime Interface
 */
export interface NormalizedRuntime {
    kv: KeyValueStore | null;
    d1: D1Database | null;
    assetFetcher: AssetFetcher | null;
    logger: any;
    config: {
        configTtlSeconds: number;
        shortLinkTtlSeconds: number | null;
    };
}

export const KeyValueStoreSchema = v.any(); // Legacy or for runtime checks if needed
