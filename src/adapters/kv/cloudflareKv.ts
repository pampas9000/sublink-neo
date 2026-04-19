import { KeyValueStore } from '../../schemas/index.ts';

export class CloudflareKVAdapter implements KeyValueStore {
    private binding: any;

    constructor(binding: any) {
        this.binding = binding;
    }

    async get(key: string): Promise<string | null> {
        return this.binding.get(key);
    }

    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
        return this.binding.put(key, value, options);
    }

    async delete(key: string): Promise<void> {
        return this.binding.delete(key);
    }
}
