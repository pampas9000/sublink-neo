import { parseServerInfo, parseUrlParams, parseArray, parseBool, parseMaybeNumber } from '../../utils.ts';
import { ProxyConfig, TlsConfig } from '../../schemas/index.ts';

/**
 * Parse AnyTLS URL
 * Format: anytls://password@server:port?sni=...
 */
export function parseAnyTLS(url: string): ProxyConfig | null {
    try {
        const { addressPart, params, name } = parseUrlParams(url);
        const [password, serverInfo] = addressPart.split('@');
        if (!password || !serverInfo) return null;
        
        const { host, port } = parseServerInfo(serverInfo);
        if (!host || port === null) return null;

        const alpn = parseArray(params.alpn);
        const insecure = parseBool(
            params['skip-cert-verify'] ?? params.insecure ?? params.allowInsecure,
            true
        );

        const tls: TlsConfig = {
            enabled: true,
            server_name: params.sni,
            insecure: insecure,
            alpn: alpn,
        };

        if (params['client-fingerprint']) {
            tls.utls = {
                enabled: true,
                fingerprint: params['client-fingerprint'],
            };
        }

        return {
            type: 'anytls',
            tag: name || 'AnyTLS',
            server: host,
            server_port: port,
            password: decodeURIComponent(password),
            tcp_fast_open: false,
            udp: parseBool(params.udp, false),
            tls: tls,
            sni: params.sni,
            alpn: alpn && alpn.length > 0 ? alpn : undefined,
            'idle-session-check-interval': parseMaybeNumber(params['idle-session-check-interval']),
            'idle-session-timeout': parseMaybeNumber(params['idle-session-timeout']),
            'min-idle-session': parseMaybeNumber(params['min-idle-session'])
        } as ProxyConfig;
    } catch (e) {
        console.error('Failed to parse anytls URL:', e);
        return null;
    }
}
