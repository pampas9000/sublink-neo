import { ProxyConfig, TlsConfig, TransportConfig } from '../schemas/index.ts';

/**
 * Convert a Clash YAML proxy object to internal (Sing-Box) format
 */
export function convertYamlProxyToObject(p: any): ProxyConfig | null {
    if (!p || typeof p !== 'object' || !p.type) return null;
    const type = String(p.type).toLowerCase();
    const name = p.name || p.tag || 'proxy';
    
    const toArray = (value: any): string[] | undefined => {
        if (value === undefined || value === null) return undefined;
        return Array.isArray(value) ? value.map((v: any) => String(v)) : [String(value)];
    };

    switch (type) {
        case 'ss':
        case 'shadowsocks':
            return {
                tag: name,
                type: 'shadowsocks',
                server: p.server,
                server_port: parseInt(p.port),
                method: p.cipher || p.method || '',
                password: p.password || '',
                tcp_fast_open: !!p['fast-open'],
                plugin: p.plugin,
                plugin_opts: p['plugin-opts'],
                udp: p.udp
            } as ProxyConfig;

        case 'vmess': {
            const tlsEnabled = !!p.tls;
            const tls: TlsConfig | undefined = tlsEnabled
                ? {
                    enabled: true,
                    server_name: p.servername || p.sni,
                    insecure: !!p['skip-cert-verify'],
                    alpn: toArray(p.alpn)
                }
                : undefined;
            
            const transport = ((): TransportConfig | undefined => {
                const net = p.network || p['network-type'];
                if (net === 'ws') {
                    const w = p['ws-opts'] || {};
                    return { type: 'ws', path: w.path || '/', headers: w.headers };
                }
                if (net === 'grpc') {
                    const g = p['grpc-opts'] || {};
                    return { type: 'grpc', service_name: g['grpc-service-name'] || 'GunService' };
                }
                if (net === 'http') {
                    const h = p['http-opts'] || {};
                    return { type: 'http', method: h.method || 'GET', path: Array.isArray(h.path) ? h.path[0] : (h.path || '/'), headers: h.headers };
                }
                if (net === 'h2') {
                    const h2 = p['h2-opts'] || {};
                    return { type: 'h2', path: h2.path || '/', host: toArray(h2.host) };
                }
                return undefined;
            })();

            return {
                tag: name,
                type: 'vmess',
                server: p.server,
                server_port: parseInt(p.port),
                uuid: p.uuid,
                alter_id: typeof p.alterId !== 'undefined' ? parseInt(p.alterId) : 0,
                security: p.cipher || p.security || 'auto',
                tcp_fast_open: !!p['fast-open'],
                transport,
                tls,
                udp: p.udp
            } as ProxyConfig;
        }

        case 'vless': {
            const tlsEnabled = !!p.tls;
            const reality = p['reality-opts'];
            const tls: TlsConfig | undefined = tlsEnabled
                ? {
                    enabled: true,
                    server_name: p.servername || p.sni,
                    insecure: !!p['skip-cert-verify'],
                    alpn: toArray(p.alpn),
                    reality: reality ? {
                        enabled: true,
                        public_key: reality['public-key'],
                        short_id: reality['short-id']
                    } : undefined
                }
                : undefined;

            if (tls && p['client-fingerprint']) {
                tls.utls = {
                    enabled: true,
                    fingerprint: p['client-fingerprint']
                };
            }

            const transport = ((): TransportConfig | undefined => {
                const net = p.network;
                if (net === 'ws') {
                    const w = p['ws-opts'] || {};
                    return { type: 'ws', path: w.path || '/', headers: w.headers };
                }
                if (net === 'grpc') {
                    const g = p['grpc-opts'] || {};
                    return { type: 'grpc', service_name: g['grpc-service-name'] || 'GunService' };
                }
                if (net === 'http') {
                    const h = p['http-opts'] || {};
                    return { type: 'http', method: h.method || 'GET', path: Array.isArray(h.path) ? h.path[0] : (h.path || '/'), headers: h.headers };
                }
                if (net === 'h2') {
                    const h2 = p['h2-opts'] || {};
                    return { type: 'h2', path: h2.path || '/', host: toArray(h2.host) };
                }
                return undefined;
            })();

            return {
                tag: name,
                type: 'vless',
                server: p.server,
                server_port: parseInt(p.port),
                uuid: p.uuid,
                tcp_fast_open: !!p['fast-open'],
                tls,
                transport,
                flow: p.flow ?? undefined,
                udp: p.udp
            } as ProxyConfig;
        }

        case 'trojan': {
            const tlsEnabled = !!p.tls;
            const reality = p['reality-opts'];
            const tls: TlsConfig | undefined = tlsEnabled
                ? {
                    enabled: true,
                    server_name: p.servername || p.sni,
                    insecure: !!p['skip-cert-verify'],
                    alpn: toArray(p.alpn),
                    reality: reality ? {
                        enabled: true,
                        public_key: reality['public-key'],
                        short_id: reality['short-id']
                    } : undefined
                }
                : undefined;

            if (tls && p['client-fingerprint']) {
                tls.utls = {
                    enabled: true,
                    fingerprint: p['client-fingerprint']
                };
            }

            const transport = ((): TransportConfig | undefined => {
                const net = p.network;
                if (net === 'ws') {
                    const w = p['ws-opts'] || {};
                    return { type: 'ws', path: w.path || '/', headers: w.headers };
                }
                if (net === 'grpc') {
                    const g = p['grpc-opts'] || {};
                    return { type: 'grpc', service_name: g['grpc-service-name'] || 'GunService' };
                }
                if (net === 'http') {
                    const h = p['http-opts'] || {};
                    return { type: 'http', method: h.method || 'GET', path: Array.isArray(h.path) ? h.path[0] : (h.path || '/'), headers: h.headers };
                }
                if (net === 'h2') {
                    const h2 = p['h2-opts'] || {};
                    return { type: 'h2', path: h2.path || '/', host: toArray(h2.host) };
                }
                return undefined;
            })();

            return {
                type: 'trojan',
                tag: name,
                server: p.server,
                server_port: parseInt(p.port),
                password: p.password,
                tcp_fast_open: !!p['fast-open'],
                tls,
                transport,
                flow: p.flow ?? undefined,
                udp: p.udp
            } as ProxyConfig;
        }

        case 'anytls': {
            const tlsEnabled = p.tls !== false; // Usually true by default for AnyTLS
            const tls: TlsConfig | undefined = tlsEnabled
                ? {
                    enabled: true,
                    server_name: p.servername || p.sni,
                    insecure: !!p['skip-cert-verify'],
                    alpn: toArray(p.alpn)
                }
                : undefined;

            if (tls && p['client-fingerprint']) {
                tls.utls = {
                    enabled: true,
                    fingerprint: p['client-fingerprint']
                };
            }

            return {
                type: 'anytls',
                tag: name,
                server: p.server,
                server_port: parseInt(p.port),
                password: p.password,
                tls,
                tcp_fast_open: !!p['fast-open'],
                udp: p.udp,
                'idle-session-check-interval': p['idle-session-check-interval'],
                'idle-session-timeout': p['idle-session-timeout'],
                'min-idle-session': p['min-idle-session']
            } as ProxyConfig;
        }

        case 'hysteria2':
        case 'hysteria':
        case 'hy2': {
            const tls: TlsConfig = {
                enabled: true,
                server_name: p.sni || p.servername || p.server,
                insecure: !!p['skip-cert-verify'],
                alpn: toArray(p.alpn)
            };
            const obfs: any = p.obfs ? {
                type: p.obfs,
                password: p['obfs-password']
            } : undefined;

            return {
                tag: name,
                type: 'hysteria2',
                server: p.server,
                server_port: parseInt(p.port),
                password: p.password,
                tls,
                obfs,
                up: p.up,
                down: p.down,
                tcp_fast_open: !!p['fast-open'],
                udp: p.udp
            } as ProxyConfig;
        }

        case 'tuic': {
            return {
                tag: name,
                type: 'tuic',
                server: p.server,
                server_port: parseInt(p.port),
                uuid: p.uuid,
                password: p.password,
                congestion_control: p['congestion-controller'] || p.congestion_control,
                tls: {
                    enabled: true,
                    server_name: p.sni || p.servername || p.server,
                    alpn: toArray(p.alpn),
                    insecure: !!p['skip-cert-verify']
                },
                udp_relay_mode: p['udp-relay-mode'],
                tcp_fast_open: !!p['fast-open'],
                udp: p.udp
            } as ProxyConfig;
        }

        default:
            return null;
    }
}
