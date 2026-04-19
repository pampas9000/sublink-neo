import { D1Database } from '../schemas/index.ts';
import { ServiceError } from './errors.ts';

export interface RuleSet {
    id: string;
    name: string;
    rules: any[];
    created_at?: string;
    updated_at?: string;
}

export class RuleSetService {
    private d1: D1Database;

    constructor(d1: D1Database) {
        this.d1 = d1;
    }

    private initialized = false;

    async initTable() {
        if (this.initialized) return;
        try {
            await this.d1.exec(`CREATE TABLE IF NOT EXISTS rule_sets (id TEXT PRIMARY KEY, name TEXT NOT NULL, rules TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            this.initialized = true;
        } catch (error: any) {
            console.error('D1 initTable error:', error);
            throw new ServiceError(`Failed to initialize D1 table: ${error.message}`, 500);
        }
    }

    async saveRuleSet(ruleSet: RuleSet): Promise<string> {
        try {
            await this.initTable();
            const rulesJson = JSON.stringify(ruleSet.rules);
            const now = new Date().toISOString();

            await this.d1.prepare(`
                INSERT INTO rule_sets (id, name, rules, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    rules = excluded.rules,
                    updated_at = excluded.updated_at
            `).bind(ruleSet.id, ruleSet.name, rulesJson, now, now).run();

            return ruleSet.id;
        } catch (error: any) {
            throw new ServiceError(`Failed to save rule set: ${error.message}`, 500);
        }
    }

    async getRuleSet(id: string): Promise<RuleSet | null> {
        try {
            await this.initTable();
            const result = await this.d1.prepare(`
                SELECT * FROM rule_sets WHERE id = ?
            `).bind(id).first();

            if (!result) return null;

            return {
                ...result,
                rules: JSON.parse(result.rules)
            } as RuleSet;
        } catch (error: any) {
            throw new ServiceError(`Failed to get rule set: ${error.message}`, 500);
        }
    }

    async listRuleSets(): Promise<Partial<RuleSet>[]> {
        try {
            await this.initTable();
            const statement = this.d1.prepare(`
                SELECT id, name, created_at, updated_at FROM rule_sets ORDER BY updated_at DESC
            `);
            const { results } = await statement.all();

            return (results || []) as any[];
        } catch (error: any) {
            console.error('D1 listRuleSets error:', error);
            throw new ServiceError(`Failed to list rule sets: ${error.message}`, 500);
        }
    }

    async deleteRuleSet(id: string): Promise<void> {
        try {
            await this.initTable();
            await this.d1.prepare(`
                DELETE FROM rule_sets WHERE id = ?
            `).bind(id).run();
        } catch (error: any) {
            throw new ServiceError(`Failed to delete rule set: ${error.message}`, 500);
        }
    }
}
