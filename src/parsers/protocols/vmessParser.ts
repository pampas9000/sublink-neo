import { decodeBase64 } from '../../utils.ts';
import { ProxyConfig, TransportConfig, TlsConfig } from '../../schemas/index.ts';

function normalizeArray(value: any): any[] | null {
    if (!value) return null;
    return Array.isArray(value) ? value : [value];
}

function buildHttpHeaders(vmessConfig: any): Record<string, string[]> | undefined {
    let hostHeader = vmessConfig.host;
    if (vmessConfig.headers && typeof vmessConfig.headers === 'object') {
        const normalized: Record<string, string[]> = {};
        Object.entries(vmessConfig.headers).forEach(([key, value]) => {
            const normalizedValue = normalizeArray(value)?.map(entry => `${entry}`);
            if (normalizedValue && normalizedValue.length > 0) {
                normalized[key] = normalizedValue;
            }
        });
        if (hostHeader && !normalized.host) {
            normalized.host = [hostHeader];
        }
        if (Object.keys(normalized).length > 0) {
            return normalized;
        }
    }
    return hostHeader ? { host: [hostHeader] } : undefined;
}

/**
 * Parse VMess URL
 */
export function parseVmess(url: string): ProxyConfig | null {
    try {
        let base64WithFragment = url.replace('vmess://', '');
        let tagOverride: string | undefined;
        const hashPos = base64WithFragment.indexOf('#');
        if (hashPos >= 0) {
            tagOverride = decodeURIComponent(base64WithFragment.slice(hashPos + 1));
            base64WithFragment = base64WithFragment.slice(0, hashPos);
        }

        const vmessConfig = JSON.parse(decodeBase64(base64WithFragment));
        let tls: TlsConfig | undefined;
        let transport: TransportConfig | undefined;
        
        const networkType = vmessConfig.net || 'tcp';
        const transportType = vmessConfig.type || networkType;

        const tlsEnabled = vmessConfig.tls && vmessConfig.tls !== '' && vmessConfig.tls !== 'none';
        if (tlsEnabled) {
            tls = {
                enabled: true,
                server_name: vmessConfig.sni || undefined,
                insecure: !!vmessConfig['skip-cert-verify']
            };
        }

        if (networkType === 'ws') {
            transport = {
                type: 'ws',
                path: vmessConfig.path || '/',
                headers: { 'host': vmessConfig.host ? vmessConfig.host : vmessConfig.sni }
            };
        } else if ((networkType === 'tcp' && transportType === 'http') || networkType === 'http') {
            const method = vmessConfig.method || 'GET';
            const path = vmessConfig.path || '/';
            transport = {
                type: 'http',
                method,
                path: Array.isArray(path) ? path[0] : path,
                headers: buildHttpHeaders(vmessConfig)
            };
        } else if (networkType === 'grpc') {
            transport = {
                type: 'grpc',
                service_name: vmessConfig?.path || vmessConfig?.serviceName || 'GunService'
            };
        } else if (networkType === 'h2') {
            const hostValue = vmessConfig.host || vmessConfig.sni;
            transport = {
                type: 'h2',
                path: vmessConfig.path || '/',
                host: hostValue ? (Array.isArray(hostValue) ? hostValue : [hostValue]) : undefined
            };
        }

        return {
            tag: tagOverride || vmessConfig.ps || 'VMess',
            type: 'vmess',
            server: vmessConfig.add,
            server_port: parseInt(vmessConfig.port),
            uuid: vmessConfig.id,
            alter_id: parseInt(vmessConfig.aid) || 0,
            security: vmessConfig.scy || 'auto',
            tcp_fast_open: false,
            transport,
            tls,
            network: ['ws', 'grpc', 'http', 'h2'].includes(networkType) ? 'tcp' : networkType,
            udp: vmessConfig.udp !== undefined ? vmessConfig.udp : undefined
        } as ProxyConfig;
    } catch (e) {
        console.error('Failed to parse vmess URL:', e);
        return null;
    }
}
