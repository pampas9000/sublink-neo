import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.ts';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.ts';

const clashYamlInput = [
  'proxies:',
  '  - {name: "HY2-YAML", type: hysteria2, server: h.example.com, port: 8881, up: "200 Mbps", down: "1000 Mbps", password: pw, sni: example.org, skip-cert-verify: false, fingerprint: "B0:17:C5:85", udp: true, alpn: [h3], ports: "20000-30000", hop-interval: 30}'
].join('\n');

const uriInput = 'hysteria2://pw@1.2.3.4:60000?insecure=1&sni=www.example.com&mport=60000-65530&pinSHA256=7883ab&alpn=h3#HY2-URI';

async function buildClashProxy(input: string, name: string) {
  const builder = new ClashConfigBuilder(input, 'minimal', [], undefined, 'zh-CN', 'test-agent');
  const built = yaml.load(await builder.build()) as any;
  return built.proxies.find((p: any) => p.name === name);
}

async function buildSingboxOutbound(input: string, tag: string) {
  const builder = new SingboxConfigBuilder(input, 'minimal', [], undefined, 'zh-CN', 'test-agent');
  const built = await builder.build();
  const config = typeof built === 'string' ? JSON.parse(built) : built;
  return config.outbounds.find((o: any) => o.tag === tag);
}

describe('Hysteria2 field preservation', () => {
  it('keeps up/down, fingerprint, ports, hop-interval, alpn and udp from Clash YAML', async () => {
    const proxy = await buildClashProxy(clashYamlInput, 'HY2-YAML');
    expect(proxy).toMatchObject({
      up: '200 Mbps',
      down: '1000 Mbps',
      fingerprint: 'B0:17:C5:85',
      ports: '20000-30000',
      'hop-interval': 30,
      alpn: ['h3'],
      udp: true,
      sni: 'example.org',
      'skip-cert-verify': false
    });
  });

  it('maps mport, pinSHA256 and alpn from hysteria2:// URIs', async () => {
    const proxy = await buildClashProxy(uriInput, 'HY2-URI');
    expect(proxy).toMatchObject({
      ports: '60000-65530',
      fingerprint: '7883ab',
      alpn: ['h3'],
      'skip-cert-verify': true
    });
  });

  it('emits sing-box native hysteria2 fields', async () => {
    const outbound = await buildSingboxOutbound(clashYamlInput, 'HY2-YAML');
    expect(outbound.up_mbps).toBe(200);
    expect(outbound.down_mbps).toBe(1000);
    expect(outbound.server_ports).toEqual(['20000:30000']);
    expect(outbound.hop_interval).toBe('30s');
    expect(outbound.tls.alpn).toEqual(['h3']);
    for (const key of ['up', 'down', 'ports', 'fingerprint', 'udp']) {
      expect(outbound).not.toHaveProperty(key);
    }
  });
});
