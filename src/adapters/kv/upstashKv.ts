import { KeyValueStore } from '../../schemas/index.ts';

interface UpstashKVOptions {
    url: string;
    token: string;
}

export class UpstashKVAdapter implements KeyValueStore {
    private url: string;
    private token: string;

    constructor({ url, token }: UpstashKVOptions) {
        if (!url || !token) {
            throw new Error('Upstash KV adapter requires KV_REST_API_URL and KV_REST_API_TOKEN');
        }
        this.url = url.replace(/\/$/, '');
        this.token = token;
    }

    async get(key: string): Promise<string | null> {
        const result = await this.execute(['GET', key]);
        return result ?? null;
    }

    async put(key: string, value: string, options: { expirationTtl?: number } = {}): Promise<void> {
        const command = ['SET', key, value];
        if (options.expirationTtl) {
            command.push('EX', String(Math.floor(options.expirationTtl)));
        }
        await this.execute(command);
    }

    async delete(key: string): Promise<void> {
        await this.execute(['DEL', key]);
    }

    private async execute(command: string[]): Promise<any> {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command)
        });

        if (!response.ok) {
            throw new Error(`Upstash request failed with status ${response.status}`);
        }

        const payload = await response.json() as { result?: any; error?: string };
        if (payload.error) {
            throw new Error(`Upstash error: ${payload.error}`);
        }
        return payload.result;
    }
}
