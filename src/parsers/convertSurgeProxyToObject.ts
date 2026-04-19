import { ProxyConfig, TlsConfig, TransportConfig } from '../schemas/index.ts';

/**
 * Parse key=value parameters from a Surge proxy line
 */
function parseParams(parts: string[]): Record<string, string> {
    const params: Record<string, string> = {};
    for (const part of parts) {
        const trimmed = part.trim();
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            params[key] = value;
        }
    }
    return params;
}

/**
 * Parse boolean value from Surge format (case-insensitive)
 */
function parseBool(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
}

/**
 * Convert a Surge proxy line to internal (Sing-Box) format
 */
export function convertSurgeProxyToObject(line: string): ProxyConfig | null {
    if (!line || typeof line !== 'string') return null;

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        return null;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return null;

    const tag = trimmed.slice(0, eqIndex).trim();
    const rest = trimmed.slice(eqIndex + 1).trim();

    const parts = rest.split(',').map(p => p.trim());
    if (parts.length < 3) return null;

    const type = parts[0]!.toLowerCase();
    const server = parts[1]!;
    const port = parseInt(parts[2]!);

    if (!server || isNaN(port)) return null;

    const params = parseParams(parts.slice(3));

    const buildTls = (): TlsConfig | undefined => {
        if (!parseBool(params.tls)) return undefined;
        return {
            enabled: true,
            server_name: params.sni || params['server-name'] || server,
            insecure: parseBool(params['skip-cert-verify']),
            alpn: params.alpn ? params.alpn.split(',').map(a => a.trim()) : undefined
        };
    };

    const buildTransport = (): TransportConfig | undefined => {
        const wsPath = params['ws-path'] || params.path;
        if (params.ws === 'true' || wsPath) {
            return {
                type: 'ws',
                path: wsPath || '/',
                headers: params['ws-headers'] ? { host: params['ws-headers'] } : undefined
            };
        }
        return undefined;
    };

    switch (type) {
        case 'ss':
        case 'shadowsocks':
            return {
                tag,
                type: 'shadowsocks',
                server,
                server_port: port,
                method: params['encrypt-method'] || params.method || params.cipher || '',
                password: params.password || '',
                tcp_fast_open: parseBool(params.tfo || params['tcp-fast-open'])
            };

        case 'vmess':
            return {
                tag,
                type: 'vmess',
                server,
                server_port: port,
                uuid: params.username || params.uuid || '',
                alter_id: parseInt(params.alterId || '0') || 0,
                security: params.cipher || params.security || 'auto',
                tcp_fast_open: parseBool(params.tfo || params['tcp-fast-open']),
                tls: buildTls(),
                transport: buildTransport()
            };

        case 'trojan':
            return {
                tag,
                type: 'trojan',
                server,
                server_port: port,
                password: params.password || '',
                tcp_fast_open: parseBool(params.tfo || params['tcp-fast-open']),
                tls: {
                    enabled: true,
                    server_name: params.sni || params['server-name'] || server,
                    insecure: parseBool(params['skip-cert-verify']),
                    alpn: params.alpn ? params.alpn.split(',').map(a => a.trim()) : undefined
                },
                transport: buildTransport()
            };

        case 'tuic':
            return {
                tag,
                type: 'tuic',
                server,
                server_port: port,
                uuid: params.uuid || '',
                password: params.password || '',
                congestion_control: params['congestion-controller'] || params.congestion_control,
                udp_relay_mode: params['udp-relay-mode'],
                tls: {
                    enabled: true,
                    server_name: params.sni || params['server-name'] || server,
                    insecure: parseBool(params['skip-cert-verify']),
                    alpn: params.alpn ? params.alpn.split(',').map(a => a.trim()) : undefined
                }
            };

        case 'hysteria2':
        case 'hy2':
            return {
                tag,
                type: 'hysteria2',
                server,
                server_port: port,
                password: params.password,
                tls: {
                    enabled: true,
                    server_name: params.sni || params['server-name'] || server,
                    insecure: parseBool(params['skip-cert-verify']),
                    alpn: params.alpn ? params.alpn.split(',').map(a => a.trim()) : undefined
                },
                obfs: params['obfs-password'] ? {
                    type: params.obfs || 'salamander',
                    password: params['obfs-password']
                } : undefined
            };

        default:
            return null;
    }
}
