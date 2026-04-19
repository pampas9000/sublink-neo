import yaml from 'js-yaml';
import { generateWebPath } from '../utils.ts';
import { InvalidPayloadError, MissingDependencyError } from './errors.ts';
import { KeyValueStore } from '../schemas/index.ts';

interface ConfigStorageOptions {
    configTtlSeconds?: number;
}

export class ConfigStorageService {
    private kv: KeyValueStore | null;
    private options: ConfigStorageOptions;

    constructor(kv: KeyValueStore | null, options: ConfigStorageOptions = {}) {
        this.kv = kv;
        this.options = options;
    }

    private ensureKv(): KeyValueStore {
        if (!this.kv) {
            throw new MissingDependencyError('Config storage requires a KV store');
        }
        return this.kv;
    }

    async getConfigById(configId: string): Promise<any | null> {
        const kv = this.ensureKv();
        const stored = await kv.get(configId);
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            throw new InvalidPayloadError('Stored config is not valid JSON');
        }
    }

    async saveConfig(type: string, content: string | object): Promise<string> {
        if (!type) {
            throw new InvalidPayloadError('Missing config type');
        }

        const kv = this.ensureKv();
        const configId = `${type}_${generateWebPath(8)}`;
        const configString = this.serializeConfig(type, content);

        // Validate string is JSON before storing
        try {
            JSON.parse(configString);
        } catch {
             throw new InvalidPayloadError('Serialized config is not valid JSON');
        }

        const ttlSeconds = this.options.configTtlSeconds;
        const putOptions = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
        await kv.put(configId, configString, putOptions);
        return configId;
    }

    private serializeConfig(type: string, content: string | object): string {
        if (type === 'clash') {
            if (typeof content === 'string' && (content.trim().startsWith('-') || content.includes(':'))) {
                const yamlConfig = yaml.load(content);
                return JSON.stringify(yamlConfig);
            }
            return typeof content === 'object' ? JSON.stringify(content) : (content as string);
        }

        if (typeof content === 'object') {
            return JSON.stringify(content);
        }
        if (typeof content === 'string') {
            return content;
        }
        throw new InvalidPayloadError('Unsupported config content type');
    }
}
