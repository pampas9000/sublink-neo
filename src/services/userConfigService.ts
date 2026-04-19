import { D1Database } from '../schemas/index.ts';
import { ServiceError } from './errors.ts';

export interface UserConfig {
    token: string;
    data: any;
    updated_at?: string;
}

export class UserConfigService {
    private d1: D1Database;
    private initialized = false;

    constructor(d1: D1Database) {
        this.d1 = d1;
    }

    async initTable() {
        if (this.initialized) return;
        try {
            await this.d1.prepare(`CREATE TABLE IF NOT EXISTS user_configs (token TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
            this.initialized = true;
        } catch (error: any) {
            console.error('D1 user_configs init error:', error);
            throw new ServiceError(`Failed to initialize D1 table: ${error.message}`, 500);
        }
    }

    async saveConfig(token: string, data: any): Promise<void> {
        try {
            await this.initTable();
            const dataJson = JSON.stringify(data);
            const now = new Date().toISOString();

            await this.d1.prepare(`
                INSERT INTO user_configs (token, data, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(token) DO UPDATE SET
                    data = excluded.data,
                    updated_at = excluded.updated_at
            `).bind(token, dataJson, now).run();
        } catch (error: any) {
            console.error(`D1 saveConfig error for token ${token}:`, error);
            throw new ServiceError(`Failed to save config: ${error.message}`, 500);
        }
    }

    async getConfig(token: string): Promise<any | null> {
        try {
            await this.initTable();
            const result = await this.d1.prepare(`
                SELECT data FROM user_configs WHERE token = ?
            `).bind(token).first();

            if (!result) return null;

            try {
                return JSON.parse(result.data);
            } catch {
                return null;
            }
        } catch (error: any) {
            console.error(`D1 getConfig error for token ${token}:`, error);
            throw new ServiceError(`Failed to get config: ${error.message}`, 500);
        }
    }
}
