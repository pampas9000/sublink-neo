import { parseServerInfo, parseUrlParams, createTlsConfig, parseMaybeNumber, parseArray, parseBool } from '../../utils.ts';
import { ProxyConfig } from '../../schemas/index.ts';

/**
 * Parse Hysteria2 URL
 */
export function parseHysteria2(url: string): ProxyConfig | null {
    try {
        const { addressPart, params, name } = parseUrlParams(url);
        let host: string | null;
        let port: number | null;
        let password = '';

        if (addressPart.includes('@')) {
            const [uuid, serverInfo] = addressPart.split('@');
            const parsed = parseServerInfo(serverInfo);
            host = parsed.host;
            port = parsed.port;
            password = decodeURIComponent(uuid!);
        } else {
            const parsed = parseServerInfo(addressPart);
            host = parsed.host;
            port = parsed.port;
            password = params.auth || '';
        }

        if (!host || port === null) return null;

        // Hysteria2 requires TLS by protocol design
        if (!params.security) params.security = 'tls';
        const tls = createTlsConfig(params);
        
        let obfs: any = undefined;
        if (params['obfs-password']) {
            obfs = {
                type: params.obfs || 'salamander',
                password: params['obfs-password']
            };
        }

        return {
            tag: name || 'Hysteria2',
            type: 'hysteria2',
            server: host,
            server_port: port,
            password: password,
            tls: tls.enabled ? tls : undefined,
            obfs,
            up: params.up ?? (params.upmbps ? parseMaybeNumber(params.upmbps) : undefined),
            down: params.down ?? (params.downmbps ? parseMaybeNumber(params.downmbps) : undefined),
            tcp_fast_open: parseBool(params['fast-open'])
        } as ProxyConfig;
    } catch (e) {
        console.error('Failed to parse hysteria2 URL:', e);
        return null;
    }
}
