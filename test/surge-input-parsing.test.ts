import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.ts';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.ts';
import { parseSurgeIni } from '../src/parsers/subscription/subscriptionContentParser.ts';
import { convertSurgeProxyToObject } from '../src/parsers/convertSurgeProxyToObject.ts';

describe('Surge input parsing', () => {
    const sampleSurgeConfig = `
[General]
loglevel = notify
skip-proxy = 127.0.0.1, localhost

[Proxy]
HK-SS = ss, hk.example.com, 443, encrypt-method=aes-256-gcm, password=test-password
US-VMess = vmess, us.example.com, 443, username=12345678-1234-1234-1234-123456789abc, tls=true
JP-Trojan = trojan, jp.example.com, 443, password=trojan-password, sni=jp.example.com
TW-TUIC = tuic, tw.example.com, 443, uuid=tuic-uuid, password=tuic-pass, congestion-controller=bbr
SG-HY2 = hysteria2, sg.example.com, 443, password=hy2-password, sni=sg.example.com

[Proxy Group]
Proxy = select, HK-SS, US-VMess, JP-Trojan

[Rule]
DOMAIN-SUFFIX,google.com,Proxy
FINAL,DIRECT
`;

    describe('convertSurgeProxyToObject', () => {
        it('should parse Shadowsocks proxy line', () => {
            const result = convertSurgeProxyToObject('SS-Node = ss, example.com, 8388, encrypt-method=aes-256-gcm, password=test123')!;
            expect(result).not.toBeNull();
            expect(result.tag).toBe('SS-Node');
            expect(result.type).toBe('shadowsocks');
            expect(result.server).toBe('example.com');
            expect(result.server_port).toBe(8388);
            expect((result as any).method).toBe('aes-256-gcm');
            expect((result as any).password).toBe('test123');
        });

        it('should parse VMess proxy line', () => {
            const result = convertSurgeProxyToObject('VMess-Node = vmess, example.com, 443, username=test-uuid, tls=true, sni=vmess.example.com')!;
            expect(result).not.toBeNull();
            expect(result.tag).toBe('VMess-Node');
            expect(result.type).toBe('vmess');
            expect(result.server).toBe('example.com');
            expect(result.server_port).toBe(443);
            expect((result as any).uuid).toBe('test-uuid');
            expect((result as any).tls?.enabled).toBe(true);
            expect((result as any).tls?.server_name).toBe('vmess.example.com');
        });

        it('should parse Trojan proxy line', () => {
            const result = convertSurgeProxyToObject('Trojan-Node = trojan, example.com, 443, password=trojan-pass, sni=trojan.example.com')!;
            expect(result).not.toBeNull();
            expect(result.tag).toBe('Trojan-Node');
            expect(result.type).toBe('trojan');
            expect((result as any).password).toBe('trojan-pass');
            expect((result as any).tls?.server_name).toBe('trojan.example.com');
        });

        it('should parse TUIC proxy line', () => {
            const result = convertSurgeProxyToObject('TUIC-Node = tuic, example.com, 443, uuid=my-uuid, password=my-pass, congestion-controller=bbr')!;
            expect(result).not.toBeNull();
            expect(result.tag).toBe('TUIC-Node');
            expect(result.type).toBe('tuic');
            expect((result as any).uuid).toBe('my-uuid');
            expect((result as any).password).toBe('my-pass');
            expect((result as any).congestion_control).toBe('bbr');
        });

        it('should parse Hysteria2 proxy line', () => {
            const result = convertSurgeProxyToObject('HY2-Node = hysteria2, example.com, 443, password=hy2-pass, sni=hy2.example.com')!;
            expect(result).not.toBeNull();
            expect(result.tag).toBe('HY2-Node');
            expect(result.type).toBe('hysteria2');
            expect((result as any).password).toBe('hy2-pass');
            expect((result as any).tls?.server_name).toBe('hy2.example.com');
        });

        it('should return null for invalid lines', () => {
            expect(convertSurgeProxyToObject('')).toBeNull();
            expect(convertSurgeProxyToObject('# comment')).toBeNull();
            expect(convertSurgeProxyToObject('invalid line')).toBeNull();
            expect(convertSurgeProxyToObject('DIRECT = direct')).toBeNull();
        });

        it('should handle case-insensitive boolean values', () => {
            // Test with uppercase TRUE
            const result1 = convertSurgeProxyToObject('VMess-Upper = vmess, example.com, 443, username=uuid, tls=TRUE')!;
            expect((result1 as any).tls?.enabled).toBe(true);

            // Test with mixed case True
            const result2 = convertSurgeProxyToObject('VMess-Mixed = vmess, example.com, 443, username=uuid, tls=True')!;
            expect((result2 as any).tls?.enabled).toBe(true);

            // Test with skip-cert-verify=TRUE
            const result3 = convertSurgeProxyToObject('Trojan-Test = trojan, example.com, 443, password=pass, skip-cert-verify=TRUE')!;
            expect((result3 as any).tls?.insecure).toBe(true);
        });
    });

    describe('parseSurgeIni', () => {
        it('should parse Surge INI config and extract proxies', () => {
            const result = parseSurgeIni(sampleSurgeConfig)!;
            expect(result).not.toBeNull();
            expect(result.type).toBe('surgeConfig');
            expect(result.proxies.length).toBe(5);
        });

        it('should extract correct proxy types', () => {
            const result = parseSurgeIni(sampleSurgeConfig)!;
            const types = result.proxies.map((p: any) => p.type);
            expect(types).toContain('shadowsocks');
            expect(types).toContain('vmess');
            expect(types).toContain('trojan');
            expect(types).toContain('tuic');
            expect(types).toContain('hysteria2');
        });

        it('should preserve config overrides', () => {
            const result = parseSurgeIni(sampleSurgeConfig)!;
            expect(result.config).not.toBeNull();
            expect(result.config.general).toBeDefined();
            expect(result.config.rules).toBeDefined();
        });

        it('should convert proxy-groups from strings to objects', () => {
            const result = parseSurgeIni(sampleSurgeConfig)!;
            // proxy-groups should now be parsed and converted to Clash-compatible object format
            expect(result.config['proxy-groups']).toBeDefined();
            expect(Array.isArray(result.config['proxy-groups'])).toBe(true);
            expect(result.config['proxy-groups'].length).toBe(1);

            const group = result.config['proxy-groups'][0];
            expect(group.name).toBe('Proxy');
            expect(group.type).toBe('select');
            expect(group.proxies).toContain('HK-SS');
            expect(group.proxies).toContain('US-VMess');
            expect(group.proxies).toContain('JP-Trojan');
        });


        it('should return null for non-Surge content', () => {
            expect(parseSurgeIni('not a surge config')).toBeNull();
            expect(parseSurgeIni('{"outbounds": []}')).toBeNull();
            expect(parseSurgeIni('proxies:\n  - name: test')).toBeNull();
        });
    });

    describe('Integration with builders', () => {
        it('should work with SingboxConfigBuilder', async () => {
            const builder = new SingboxConfigBuilder(
                sampleSurgeConfig,
                [],
                [],
                undefined,
                'zh-CN',
                undefined,
                false
            );

            const resultText = await builder.build();
            const result = JSON.parse(resultText) as any;
            const proxies = (result.outbounds as any[]).filter((o: any) => o.server);

            expect(proxies.length).toBe(5);
            expect(proxies.map((p: any) => p.tag)).toContain('HK-SS');
            expect(proxies.map((p: any) => p.tag)).toContain('US-VMess');
            expect(proxies.map((p: any) => p.tag)).toContain('JP-Trojan');
        });

        it('should work with ClashConfigBuilder', async () => {
            const builder = new ClashConfigBuilder(
                sampleSurgeConfig,
                [],
                [],
                undefined,
                'zh-CN',
                undefined,
                false
            );

            const resultYaml = await builder.build();
            const yaml = await import('js-yaml');
            const result = yaml.load(resultYaml) as any;
            const proxies = result.proxies;

            expect(proxies.length).toBe(5);
            expect(proxies.map((p: any) => p.name)).toContain('HK-SS');
            expect(proxies.map((p: any) => p.name)).toContain('US-VMess');
        });
    });
});
