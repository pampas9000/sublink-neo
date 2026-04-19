import { KeyValueStore } from '../../schemas/index.ts';

export class MemoryKVAdapter implements KeyValueStore {
    private store: Map<string, string>;
    private expirations: Map<string, any>;

    constructor() {
        this.store = new Map();
        this.expirations = new Map();
    }

    async get(key: string): Promise<string | null> {
        this.cleanExpired(key);
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
        this.store.set(key, value);
        if (options.expirationTtl) {
            this.scheduleExpiration(key, options.expirationTtl);
        } else {
            this.clearExpiration(key);
        }
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
        this.clearExpiration(key);
    }

    private scheduleExpiration(key: string, ttlSeconds: number): void {
        this.clearExpiration(key);
        const timeoutId = setTimeout(() => {
            this.store.delete(key);
            this.expirations.delete(key);
        }, ttlSeconds * 1000);
        this.expirations.set(key, timeoutId);
    }

    private clearExpiration(key: string): void {
        const timeoutId = this.expirations.get(key);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.expirations.delete(key);
        }
    }

    private cleanExpired(key: string): void {
        if (!this.expirations.has(key)) return;
        if (!this.store.has(key)) {
            this.clearExpiration(key);
        }
    }
}
