import { parseServerInfo, parseUrlParams, createTlsConfig, createTransportConfig, parseBool } from '../../utils.ts';
import { ProxyConfig } from '../../schemas/index.ts';

/**
 * Parse VLESS URL
 */
export function parseVless(url: string): ProxyConfig | null {
    try {
        const { addressPart, params, name } = parseUrlParams(url);
        const [uuid, serverInfo] = addressPart.split('@');
        if (!uuid || !serverInfo) return null;
        
        const { host, port } = parseServerInfo(serverInfo);
        if (!host || port === null) return null;

        const tls = createTlsConfig(params);
        if (tls.reality?.enabled) {
            tls.utls = {
                enabled: true,
                fingerprint: 'chrome'
            };
        }
        const transport = params.type !== 'tcp' ? createTransportConfig(params) : undefined;

        return {
            type: 'vless',
            tag: name || 'VLESS',
            server: host,
            server_port: port,
            uuid: decodeURIComponent(uuid),
            tcp_fast_open: false,
            tls: tls.enabled ? tls : undefined,
            transport,
            flow: params.flow ?? undefined,
            udp: parseBool(params.udp)
        } as ProxyConfig;
    } catch (e) {
        console.error('Failed to parse vless URL:', e);
        return null;
    }
}
