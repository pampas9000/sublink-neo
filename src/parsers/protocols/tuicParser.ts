import { parseServerInfo, parseUrlParams, parseArray, parseBool } from '../../utils.ts';
import { ProxyConfig } from '../../schemas/index.ts';

/**
 * Parse TUIC URL
 */
export function parseTuic(url: string): ProxyConfig | null {
    try {
        const { addressPart, params, name } = parseUrlParams(url);
        const [userinfo, serverInfo] = addressPart.split('@');
        if (!userinfo || !serverInfo) return null;
        
        const { host, port } = parseServerInfo(serverInfo);
        if (!host || port === null) return null;

        const credentials = decodeURIComponent(userinfo).split(':');
        const tls = {
            enabled: true,
            server_name: params.sni || params.host,
            alpn: parseArray(params.alpn),
            insecure: parseBool(params['skip-cert-verify'] ?? params.insecure ?? params.allowInsecure, false)
        };

        return {
            tag: name || 'TUIC',
            type: 'tuic',
            server: host,
            server_port: port,
            uuid: credentials[0] || '',
            password: credentials[1] || '',
            congestion_control: params.congestion_control,
            tls,
            udp_relay_mode: params['udp-relay-mode'] || params.udp_relay_mode,
            tcp_fast_open: parseBool(params['fast-open'], undefined)
        } as ProxyConfig;
    } catch (e) {
        console.error('Failed to parse tuic URL:', e);
        return null;
    }
}
