import { KeyValueStore } from '../../schemas/index.ts';
import type { Redis } from 'ioredis';

interface RedisKVOptions {
    prefix?: string;
    client: Redis;
    manageConnection?: boolean;
}

export class RedisKVAdapter implements KeyValueStore {
    private prefix: string;
    private client: Redis;
    private manageConnection: boolean;

    constructor(options: RedisKVOptions) {
        const { prefix, client, manageConnection = false } = options;
        if (!client) {
            throw new Error('Redis KV adapter requires an active Redis client instance');
        }
        this.prefix = prefix ? `${prefix}:` : '';
        this.client = client;
        this.manageConnection = manageConnection;
    }

    private formatKey(key: string): string {
        return `${this.prefix}${key}`;
    }

    async get(key: string): Promise<string | null> {
        const value = await this.client.get(this.formatKey(key));
        return value ?? null;
    }

    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
        const ttlSeconds = normalizeTtl(options.expirationTtl);
        const formattedKey = this.formatKey(key);
        if (typeof ttlSeconds === 'number') {
            await this.client.set(formattedKey, value, 'EX', ttlSeconds);
        } else {
            await this.client.set(formattedKey, value);
        }
    }

    async delete(key: string): Promise<void> {
        await this.client.del(this.formatKey(key));
    }

    async disconnect(): Promise<void> {
        if (this.manageConnection && this.client) {
            await (this.client as any).quit();
        }
    }
}

function normalizeTtl(ttl: any): number | null {
    if (!ttl && ttl !== 0) return null;
    const parsed = Math.floor(Number(ttl));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
