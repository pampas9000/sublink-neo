import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodeBase64 } from '../src/utils.ts';
import { parseShadowsocks } from '../src/parsers/protocols/shadowsocksParser.ts';
import { fetchSubscription } from '../src/parsers/subscription/httpSubscriptionFetcher.ts';

/**
 * Sub-Store `?target=ClashMeta` returns plain YAML with flow-style (JSON) proxy entries,
 * and its default output uses SIP002 plain `method:password` userinfo for SS 2022 ciphers.
 */
describe('Sub-Store plain content', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodeBase64 throws on non-Base64 input instead of returning garbage', () => {
    expect(() => decodeBase64('proxies:\n  - {"type":"ss"}')).toThrow();
    expect(decodeBase64('aGVsbG8gd29ybGQ=')).toBe('hello world');
    expect(decodeBase64('aGVs\nbG8_')).toBe('hello?');
  });

  it('parses a plain Clash YAML subscription without Base64-decoding it', async () => {
    const yamlBody = [
      'proxies:',
      '  - {"type":"hysteria2","name":"🇸🇬新加坡-2","server":"a.example.com","port":8881,"password":"pw","sni":"example.org"}',
      '  - {"name":"SS 2022","type":"ss","server":"2001:db8::1","port":17669,"cipher":"2022-blake3-aes-128-gcm","password":"dummy+Pass/word==","udp":true}',
    ].join('\n');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(yamlBody, { status: 200 }));

    const result = await fetchSubscription('https://sub.example.com/collection?target=ClashMeta');

    expect(result.type).toBe('yamlConfig');
    expect(result.proxies.map((p: any) => p.tag)).toEqual(['🇸🇬新加坡-2', 'SS 2022']);
    expect(result.proxies[1].method).toBe('2022-blake3-aes-128-gcm');
    expect(result.proxies[1].password).toBe('dummy+Pass/word==');
  });

  it('parses SIP002 ss:// URL with plain percent-encoded userinfo', () => {
    const proxy: any = parseShadowsocks(
      'ss://2022-blake3-aes-128-gcm:dummy%2BPass%2Fword%3D%3D@[2001:db8::1]:17669?udp=1#SS%202022'
    );
    expect(proxy.tag).toBe('SS 2022');
    expect(proxy.server).toBe('2001:db8::1');
    expect(proxy.server_port).toBe(17669);
    expect(proxy.method).toBe('2022-blake3-aes-128-gcm');
    expect(proxy.password).toBe('dummy+Pass/word==');
    expect(proxy.udp).toBe(true);
  });

  it('still parses Base64 userinfo', () => {
    const proxy: any = parseShadowsocks('ss://YWVzLTI1Ni1nY206dGVzdCtwYXNzL3dvcmQ9@example.com:8388#Test');
    expect(proxy.method).toBe('aes-256-gcm');
    expect(proxy.password).toBe('test+pass/word=');
  });
});
