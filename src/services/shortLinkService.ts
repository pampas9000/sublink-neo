import { generateWebPath } from '../utils.ts';
import { MissingDependencyError } from './errors.ts';
import { KeyValueStore } from '../schemas/index.ts';

interface ShortLinkOptions {
    shortLinkTtlSeconds?: number | null;
}

export class ShortLinkService {
    private kv: KeyValueStore | null;
    private options: ShortLinkOptions;

    constructor(kv: KeyValueStore | null, options: ShortLinkOptions = {}) {
        this.kv = kv;
        this.options = options;
    }

    private ensureKv(): KeyValueStore {
        if (!this.kv) {
            throw new MissingDependencyError('Short link service requires a KV store');
        }
        return this.kv;
    }

    async createShortLink(queryString: string, providedCode?: string): Promise<string> {
        const kv = this.ensureKv();
        const shortCode = providedCode || generateWebPath();
        const ttl = this.options.shortLinkTtlSeconds;
        const putOptions = typeof ttl === 'number' ? { expirationTtl: ttl } : undefined;
        await kv.put(shortCode, queryString, putOptions);
        return shortCode;
    }

    async resolveShortCode(code: string): Promise<string | null> {
        const kv = this.ensureKv();
        return kv.get(code);
    }
}
