import { parseServerInfo, parseUrlParams, createTlsConfig, createTransportConfig } from '../../utils.ts';
import { ProxyConfig } from '../../schemas/index.ts';

/**
 * Parse Trojan URL
 */
export function parseTrojan(url: string): ProxyConfig | null {
    try {
        const { addressPart, params, name } = parseUrlParams(url);
        const [password, serverInfo] = addressPart.split('@');
        if (!password || !serverInfo) return null;
        
        const { host, port } = parseServerInfo(serverInfo);
        if (!host || port === null) return null;

        const tls = createTlsConfig(params);
        const transport = params.type !== 'tcp' ? createTransportConfig(params) : undefined;
        
        return {
            type: 'trojan',
            tag: name || 'Trojan',
            server: host,
            server_port: port,
            password: decodeURIComponent(password),
            tcp_fast_open: false,
            tls: tls.enabled ? tls : undefined,
            transport,
            flow: params.flow ?? undefined
        } as ProxyConfig;
    } catch (e) {
        console.error('Failed to parse trojan URL:', e);
        return null;
    }
}
