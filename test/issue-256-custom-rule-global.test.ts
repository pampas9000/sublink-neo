import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.ts';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.ts';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.ts';

/**
 * Issue #256 Regression Test
 * Custom rules should not include country groups as direct outbounds
 * to prevent them from acting as global proxies.
 */
describe('Issue #256 - Custom rules should not bypass selector chain', () => {
    const inputString = 'ss://YWVzLTI1Ni1nY206dGVzdA==@us1.example.com:8388#US-Node-1\n' +
                       'ss://YWVzLTI1Ni1nY206dGVzdA==@uk1.example.com:8388#UK-Node-1';

    const customRules = [
        { name: 'Custom-Rule-1', site_rules: ['google'], ip_rules: [], domain_suffix: [], domain_keyword: [] },
        { name: 'Custom-Rule-2', site_rules: ['github'], ip_rules: [], domain_suffix: [], domain_keyword: [] }
    ];

    // Expected translated names for zh-CN locale
    const NODE_SELECT = '🚀 节点选择';
    const AUTO_SELECT = '⚡ 自动选择';

    describe('SingboxConfigBuilder', () => {
        it('should not include country groups in custom rule outbounds when groupByCountry is enabled', async () => {
            const builder = new SingboxConfigBuilder(
                inputString,
                'minimal',
                customRules,
                undefined,
                'zh-CN',
                '',
                true, // groupByCountry = true
                false,
                undefined,
                undefined,
                '1.12',
                true
            );

            await builder.build();

            // Find custom rule outbounds
            const customRule1 = (builder.config as any).outbounds.find((o: any) => o?.tag === 'Custom-Rule-1');
            const customRule2 = (builder.config as any).outbounds.find((o: any) => o?.tag === 'Custom-Rule-2');

            expect(customRule1).toBeDefined();
            expect(customRule2).toBeDefined();

            // Custom rules should contain Node Select, Auto Select, DIRECT, REJECT
            // But should NOT contain country groups like "🇺🇸 United States"
            expect(customRule1.outbounds).toContain(NODE_SELECT);
            expect(customRule1.outbounds).toContain(AUTO_SELECT);
            expect(customRule1.outbounds).toContain('DIRECT');
            expect(customRule1.outbounds).toContain('REJECT');

            // Should NOT contain country groups
            const hasCountryGroup = (customRule1.outbounds as string[]).some(tag =>
                tag.includes('🇺🇸') || tag.includes('🇬🇧') || tag.includes('United States') || tag.includes('United Kingdom')
            );
            expect(hasCountryGroup).toBe(false);

            // Verify the same for customRule2
            expect(customRule2.outbounds).toContain(NODE_SELECT);
            const hasCountryGroup2 = (customRule2.outbounds as string[]).some(tag =>
                tag.includes('🇺🇸') || tag.includes('🇬🇧') || tag.includes('United States') || tag.includes('United Kingdom')
            );
            expect(hasCountryGroup2).toBe(false);
        });

        it('should still include country groups in Node Select when groupByCountry is enabled', async () => {
            const builder = new SingboxConfigBuilder(
                inputString,
                'minimal',
                customRules,
                undefined,
                'zh-CN',
                '',
                true, // groupByCountry = true
                false,
                undefined,
                undefined,
                '1.12',
                true
            );

            await builder.build();

            // Node Select should contain country groups
            const nodeSelect = (builder.config as any).outbounds.find((o: any) => o?.tag === NODE_SELECT);
            expect(nodeSelect).toBeDefined();

            // Node Select should contain country groups as options
            const hasCountryGroup = (nodeSelect.outbounds as string[]).some(tag =>
                tag.includes('🇺🇸') || tag.includes('🇬🇧') || tag.includes('United States') || tag.includes('United Kingdom')
            );
            expect(hasCountryGroup).toBe(true);
        });
    });

    describe('ClashConfigBuilder', () => {
        it('should not include country groups in custom rule proxies when groupByCountry is enabled', async () => {
            const builder = new ClashConfigBuilder(
                inputString,
                'minimal',
                customRules,
                undefined,
                'zh-CN',
                '',
                true, // groupByCountry = true
                false,
                undefined,
                undefined,
                true
            );

            await builder.build();

            // Find custom rule proxy groups
            const customRule1 = (builder.config as any)['proxy-groups'].find((g: any) => g?.name === 'Custom-Rule-1');
            const customRule2 = (builder.config as any)['proxy-groups'].find((g: any) => g?.name === 'Custom-Rule-2');

            expect(customRule1).toBeDefined();
            expect(customRule2).toBeDefined();

            // Custom rules should contain Node Select, Auto Select, DIRECT, REJECT
            expect(customRule1.proxies).toContain(NODE_SELECT);
            expect(customRule1.proxies).toContain(AUTO_SELECT);
            expect(customRule1.proxies).toContain('DIRECT');
            expect(customRule1.proxies).toContain('REJECT');

            // Should NOT contain country groups
            const hasCountryGroup = (customRule1.proxies as string[]).some(tag =>
                tag.includes('🇺🇸') || tag.includes('🇬🇧') || tag.includes('United States') || tag.includes('United Kingdom')
            );
            expect(hasCountryGroup).toBe(false);
        });

        it('should still include country groups in Node Select when groupByCountry is enabled', async () => {
            const builder = new ClashConfigBuilder(
                inputString,
                'minimal',
                customRules,
                undefined,
                'zh-CN',
                '',
                true, // groupByCountry = true
                false,
                undefined,
                undefined,
                true
            );

            await builder.build();

            // Node Select should contain country groups
            const nodeSelect = (builder.config as any)['proxy-groups'].find((g: any) => g?.name === NODE_SELECT);
            expect(nodeSelect).toBeDefined();

            // Node Select should contain country groups as options
            const hasCountryGroup = (nodeSelect.proxies as string[]).some(tag =>
                tag.includes('🇺🇸') || tag.includes('🇬🇧') || tag.includes('United States') || tag.includes('United Kingdom')
            );
            expect(hasCountryGroup).toBe(true);
        });
    });

    describe('SurgeConfigBuilder', () => {
        it('should not include country groups in custom rule options when groupByCountry is enabled', async () => {
            const builder = new SurgeConfigBuilder(
                inputString,
                'minimal',
                customRules,
                undefined,
                'zh-CN',
                '',
                true, // groupByCountry = true
                true
            );

            await builder.build();

            // Find custom rule proxy groups
            const customRule1 = (builder.config as any)['proxy-groups'].find((g: any) => {
                const name = typeof g === 'string' ? g.split('=')[0].trim() : g?.name;
                return name === 'Custom-Rule-1';
            });
            const customRule2 = (builder.config as any)['proxy-groups'].find((g: any) => {
                const name = typeof g === 'string' ? g.split('=')[0].trim() : g?.name;
                return name === 'Custom-Rule-2';
            });

            expect(customRule1).toBeDefined();
            expect(customRule2).toBeDefined();

            // Get the options from the group string
            const groupString = typeof customRule1 === 'string' ? customRule1 : '';

            // Should contain Node Select
            expect(groupString).toContain(NODE_SELECT);

            // Should NOT contain country groups
            expect(groupString).not.toContain('🇺🇸');
            expect(groupString).not.toContain('🇬🇧');
        });
    });
});
