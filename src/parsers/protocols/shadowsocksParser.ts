import { base64ToBinary } from '../../utils.ts';
import { ProxyConfig } from '../../schemas/index.ts';

function parseServer(serverPart: string): [string, string] {
    const match = serverPart.match(/\[([^\]]+)\]:(\d+)/);
    if (match) {
        return [match[1], match[2]];
    }
    const parts = serverPart.split(':');
    return [parts[0], parts[1] || ''];
}

/**
 * Parse plugin string from URL query parameter
 */
function parsePluginString(pluginStr: string | null): { plugin: string; plugin_opts?: Record<string, any> } | null {
    if (!pluginStr) return null;

    const parts = pluginStr.split(';');
    const pluginName = parts[0];

    if (!pluginName) return null;

    const opts: Record<string, any> = {};
    for (let i = 1; i < parts.length; i++) {
        const eqIndex = parts[i].indexOf('=');
        if (eqIndex === -1) {
            const key = parts[i].trim();
            if (key) {
                opts[key] = true;
            }
            continue;
        }
        const key = parts[i].substring(0, eqIndex);
        const value = parts[i].substring(eqIndex + 1);
        if (key) {
            if (key === 'obfs') {
                opts.mode = value;
            } else if (key === 'obfs-host') {
                opts.host = value;
            } else if (key === 'obfs-uri') {
                opts.path = value;
            } else {
                opts[key] = value;
            }
        }
    }

    const normalizedPlugin = pluginName === 'simple-obfs' ? 'obfs' : pluginName;

    return {
        plugin: normalizedPlugin,
        plugin_opts: Object.keys(opts).length > 0 ? opts : undefined
    };
}

function createConfig(tag: string | null, server: string, server_port: string, method: string, password: string, pluginInfo: any): ProxyConfig {
    const config: any = {
        tag: tag || 'Shadowsocks',
        type: 'shadowsocks',
        server,
        server_port: parseInt(server_port),
        method,
        password,
        tcp_fast_open: false
    };

    if (pluginInfo) {
        config.plugin = pluginInfo.plugin;
        if (pluginInfo.plugin_opts) {
            config.plugin_opts = pluginInfo.plugin_opts;
        }
        if (pluginInfo.udp !== undefined) {
            config.udp = pluginInfo.udp;
        }
    }

    return config as ProxyConfig;
}

/**
 * Parse Shadowsocks URL
 */
export function parseShadowsocks(url: string): ProxyConfig | null {
    let parts = url.replace('ss://', '').split('#');
    let mainPart = parts[0];
    let tag = parts[1] ? decodeURIComponent(parts[1]) : null;

    let queryString = '';
    const queryIndex = mainPart.indexOf('?');
    if (queryIndex !== -1) {
        queryString = mainPart.substring(queryIndex + 1);
        mainPart = mainPart.substring(0, queryIndex);
    }

    let pluginInfo: any = null;
    if (queryString) {
        const params = new URLSearchParams(queryString);
        const pluginParam = params.get('plugin');
        if (pluginParam) {
            pluginInfo = parsePluginString(pluginParam);
        }
        const udpParam = params.get('udp');
        if (udpParam) {
            pluginInfo = pluginInfo || {};
            pluginInfo.udp = udpParam === 'true';
        }
    }

    try {
        let [credentials, serverPart] = mainPart.split('@');
        if (!serverPart) {
            const decodedLegacy = base64ToBinary(mainPart);
            const [methodAndPass, serverInfo] = decodedLegacy.split('@');
            if (!methodAndPass || !serverInfo) return null;
            const [method, password] = methodAndPass.split(':');
            const [server, server_port] = parseServer(serverInfo);
            return createConfig(tag, server, server_port, method!, password!, pluginInfo);
        }

        let decodedCredentials = base64ToBinary(decodeURIComponent(credentials)).split(':');
        let method = decodedCredentials[0];
        let password = decodedCredentials.slice(1).join(':');
        let [server, server_port] = parseServer(serverPart);

        return createConfig(tag, server, server_port!, method!, password, pluginInfo);
    } catch (e) {
        console.error('Failed to parse shadowsocks URL:', e);
        return null;
    }
}
