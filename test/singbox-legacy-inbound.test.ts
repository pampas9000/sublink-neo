import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.ts';
import { SING_BOX_CONFIG, SING_BOX_CONFIG_V1_11 } from '../src/config/singboxConfig.ts';

/**
 * Tests for sing-box 1.13+ compatibility (issue #357)
 *
 * Legacy inbound fields (sniff, sniff_timeout, domain_strategy, etc.) were
 * deprecated in sing-box 1.11.0 and removed in 1.13.0.
 * Sniffing is now handled via route rule actions: { "action": "sniff" }
 */

const sampleInput = JSON.stringify({
    outbounds: [
        {
            type: 'vless',
            tag: 'test-proxy',
            server: 'example.com',
            server_port: 443,
            uuid: '00000000-0000-0000-0000-000000000000',
            tls: { enabled: true, server_name: 'example.com' }
        }
    ]
});

const LEGACY_INBOUND_FIELDS = ['sniff', 'sniff_timeout', 'sniff_override_destination', 'domain_strategy', 'udp_disable_domain_unmapping'];

describe('sing-box 1.13+ compatibility: no legacy inbound fields', () => {
    it('SING_BOX_CONFIG inbounds should not contain legacy fields', () => {
        for (const inbound of SING_BOX_CONFIG.inbounds as any[]) {
            for (const field of LEGACY_INBOUND_FIELDS) {
                expect(inbound).not.toHaveProperty(field);
            }
        }
    });

    it('SING_BOX_CONFIG_V1_11 inbounds should not contain legacy fields', () => {
        for (const inbound of (SING_BOX_CONFIG_V1_11 as any).inbounds || []) {
            for (const field of LEGACY_INBOUND_FIELDS) {
                expect(inbound).not.toHaveProperty(field);
            }
        }
    });

    it('built config (v1.12) should have sniff as route rule action, not on inbounds', async () => {
        const builder = new SingboxConfigBuilder(
            sampleInput, [], [], undefined, 'zh-CN', undefined, false
        );
        const resultText = await builder.build();
        const result = JSON.parse(resultText) as any;

        // Inbounds must not have legacy fields
        for (const inbound of result.inbounds as any[]) {
            for (const field of LEGACY_INBOUND_FIELDS) {
                expect(inbound, `inbound "${inbound.tag}" should not have "${field}"`).not.toHaveProperty(field);
            }
        }

        // Route rules must contain { action: 'sniff' }
        const sniffRule = (result.route.rules as any[]).find((r: any) => r.action === 'sniff');
        expect(sniffRule).toBeDefined();
    });

    it('built config (v1.11) should have sniff as route rule action, not on inbounds', async () => {
        const builder = new SingboxConfigBuilder(
            sampleInput, [], [], SING_BOX_CONFIG_V1_11, 'zh-CN', undefined,
            false, false, undefined, undefined, '1.11'
        );
        const resultText = await builder.build();
        const result = JSON.parse(resultText) as any;

        for (const inbound of result.inbounds as any[]) {
            for (const field of LEGACY_INBOUND_FIELDS) {
                expect(inbound, `inbound "${inbound.tag}" should not have "${field}"`).not.toHaveProperty(field);
            }
        }

        const sniffRule = (result.route.rules as any[]).find((r: any) => r.action === 'sniff');
        expect(sniffRule).toBeDefined();
    });

    it('should not reintroduce legacy fields when user provides custom base config with sniff on inbound', async () => {
        // Simulate a user-provided base config that still has legacy sniff field
        const customBaseConfig = {
            inbounds: [
                { type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 2080 },
                { type: 'tun', tag: 'tun-in', address: '172.19.0.1/30', auto_route: true, strict_route: true, stack: 'mixed', sniff: true }
            ],
            outbounds: [
                { type: 'block', tag: 'REJECT' },
                { type: 'direct', tag: 'DIRECT' }
            ],
            route: { rule_set: [], rules: [] }
        };

        const builder = new SingboxConfigBuilder(
            sampleInput, [], [], customBaseConfig as any, 'zh-CN', undefined, false
        );
        const resultText = await builder.build();
        const result = JSON.parse(resultText) as any;

        // Route rules must still have sniff action
        const sniffRule = (result.route.rules as any[]).find((r: any) => r.action === 'sniff');
        expect(sniffRule).toBeDefined();
    });
});
