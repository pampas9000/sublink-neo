import { describe, it, expect } from 'bun:test';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.ts';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.ts';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.ts';

const MOCK_INPUT = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTo0MDQ5YWFiMS1iZWNiLTQzYTYtOWZjYy1hM2M0Njk0MGNmYmVAMTI3LjAuMC4xOjgzODgjVGVzdA';

describe('QUIC Rejection', () => {
    describe('Clash', () => {
        it('should inject QUIC rejection rule when enabled', async () => {
            const builder = new ClashConfigBuilder(
                MOCK_INPUT,
                ['minimal'],
                [],
                null,
                'en',
                undefined,
                false,
                false,
                undefined,
                undefined,
                true,
                true // rejectQuic
            );
            const config = await builder.build();
            expect(config).toContain('AND,((NETWORK,UDP),(DST-PORT,443)),REJECT');
        });

        it('should NOT inject QUIC rejection rule when disabled', async () => {
            const builder = new ClashConfigBuilder(
                MOCK_INPUT,
                ['minimal'],
                [],
                null,
                'en',
                undefined,
                false,
                false,
                undefined,
                undefined,
                true,
                false // rejectQuic
            );
            const config = await builder.build();
            expect(config).not.toContain('AND,((NETWORK,UDP),(DST-PORT,443)),REJECT');
        });
    });

    describe('Sing-box', () => {
        it('should inject QUIC rejection rule when enabled', async () => {
            const builder = new SingboxConfigBuilder(
                MOCK_INPUT,
                ['minimal'],
                [],
                null,
                'en',
                undefined,
                false,
                false,
                undefined,
                undefined,
                '1.12',
                true,
                true // rejectQuic
            );
            const config = (await builder.build()) as any;
            const rules = config.route.rules;
            const rejectRule = rules.find((r: any) => r.action === 'reject' && r.protocol === 'udp' && r.port?.includes(443));
            expect(rejectRule).toBeDefined();
        });

        it('should NOT inject QUIC rejection rule when disabled', async () => {
            const builder = new SingboxConfigBuilder(
                MOCK_INPUT,
                ['minimal'],
                [],
                null,
                'en',
                undefined,
                false,
                false,
                undefined,
                undefined,
                '1.12',
                true,
                false // rejectQuic
            );
            const config = (await builder.build()) as any;
            const rules = config.route.rules;
            const rejectRule = rules.find((r: any) => r.action === 'reject' && r.protocol === 'udp');
            expect(rejectRule).toBeUndefined();
        });
    });

    describe('Surge', () => {
        it('should inject QUIC rejection rule when enabled', async () => {
            const builder = new SurgeConfigBuilder(
                MOCK_INPUT,
                ['minimal'],
                [],
                null,
                'en',
                undefined,
                false,
                true,
                true // rejectQuic
            );
            const config = await builder.build();
            expect(config).toContain('UDP,DEST-PORT,443,REJECT');
        });

        it('should NOT inject QUIC rejection rule when disabled', async () => {
            const builder = new SurgeConfigBuilder(
                MOCK_INPUT,
                ['minimal'],
                [],
                null,
                'en',
                undefined,
                false,
                true,
                false // rejectQuic
            );
            const config = await builder.build();
            expect(config).not.toContain('UDP,DEST-PORT,443,REJECT');
        });
    });
});
