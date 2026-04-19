import yaml from 'js-yaml';
import { deepCopy } from '../../utils.ts';
import { convertYamlProxyToObject } from '../convertYamlProxyToObject.ts';
import { convertSurgeProxyToObject } from '../convertSurgeProxyToObject.ts';
import { convertSurgeIniToJson } from '../../utils/surgeConfigParser.ts';
import { ProxyConfig } from '../../schemas/index.ts';

/**
 * Non-proxy outbound types in Sing-Box that should be filtered out from proxies list
 */
const SINGBOX_NON_PROXY_TYPES = new Set(['direct', 'block', 'dns', 'selector', 'urltest']);

/**
 * Sing-Box outbound types that represent proxy groups (should be converted to proxy-groups)
 */
const SINGBOX_GROUP_TYPES = new Set(['selector', 'urltest']);

export interface ParsedConfig {
    type: string;
    proxies: ProxyConfig[];
    config: any;
}

/**
 * Try to parse content as Sing-Box JSON format
 */
export function parseSingboxJson(content: string): ParsedConfig | null {
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.outbounds)) {
            const proxies = parsed.outbounds.filter((o: any) =>
                o && typeof o === 'object' &&
                o.server && o.type &&
                !SINGBOX_NON_PROXY_TYPES.has(o.type)
            ) as ProxyConfig[];
            
            if (proxies.length > 0) {
                const configOverrides = deepCopy(parsed);
                delete configOverrides.outbounds;

                // Extract selector/urltest outbounds and convert to Clash proxy-groups format
                const proxyGroups = parsed.outbounds
                    .filter((o: any) => o && SINGBOX_GROUP_TYPES.has(o.type))
                    .map((o: any) => convertSingboxGroupToClashFormat(o))
                    .filter((g: any) => g != null);

                if (proxyGroups.length > 0) {
                    configOverrides['proxy-groups'] = proxyGroups;
                }

                return {
                    type: 'singboxConfig',
                    proxies,
                    config: Object.keys(configOverrides).length > 0 ? configOverrides : null
                };
            }
        }
    } catch (e) {
        // Not valid JSON
    }
    return null;
}

/**
 * Convert Sing-Box selector/urltest outbound to Clash proxy-group format
 */
function convertSingboxGroupToClashFormat(outbound: any): any | null {
    if (!outbound || !outbound.tag || !outbound.type) {
        return null;
    }

    const group: any = {
        name: outbound.tag,
        type: outbound.type === 'selector' ? 'select' : 'url-test',
        proxies: outbound.outbounds || []
    };

    // Add url-test specific fields
    if (outbound.type === 'urltest') {
        group.url = outbound.url || 'http://www.gstatic.com/generate_204';
        group.interval = outbound.interval ? parseInterval(outbound.interval) : 300;
    }

    return group;
}

/**
 * Parse interval string to seconds
 */
function parseInterval(interval: string | number): number {
    if (typeof interval === 'number') {
        return interval;
    }
    if (typeof interval === 'string') {
        const match = interval.match(/^(\d+)(s|m|h)?$/);
        if (match) {
            const value = parseInt(match[1]!);
            const unit = match[2] || 's';
            switch (unit) {
                case 'h': return value * 3600;
                case 'm': return value * 60;
                default: return value;
            }
        }
        return parseInt(interval) || 300;
    }
    return 300;
}

/**
 * Try to parse content as Clash YAML format
 */
export function parseClashYaml(content: string): ParsedConfig | null {
    try {
        const parsed = yaml.load(content) as any;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.proxies)) {
            const proxies = parsed.proxies
                .map((p: any) => convertYamlProxyToObject(p))
                .filter((p: any) => p != null) as ProxyConfig[];
            if (proxies.length > 0) {
                const configOverrides = deepCopy(parsed);
                delete configOverrides.proxies;
                return {
                    type: 'yamlConfig',
                    proxies,
                    config: Object.keys(configOverrides).length > 0 ? configOverrides : null
                };
            }
        }
    } catch (e) {
        // Not valid YAML
    }
    return null;
}

/**
 * Try to parse content as Surge INI format
 */
export function parseSurgeIni(content: string): ParsedConfig | null {
    const hasSurgeSection = /\[Proxy\]/i.test(content) ||
        (/\[General\]/i.test(content) && /\[Rule\]/i.test(content));
    if (!hasSurgeSection) {
        return null;
    }

    try {
        const parsed = convertSurgeIniToJson(content) as any;
        if (parsed && Array.isArray(parsed.proxies) && parsed.proxies.length > 0) {
            const proxies = parsed.proxies
                .map((line: string) => convertSurgeProxyToObject(line))
                .filter((p: any) => p != null) as ProxyConfig[];
            if (proxies.length > 0) {
                const configOverrides = deepCopy(parsed);
                delete configOverrides.proxies;

                if (Array.isArray(parsed['proxy-groups']) && parsed['proxy-groups'].length > 0) {
                    const proxyGroups = parsed['proxy-groups']
                        .map((line: string) => parseSurgeProxyGroupLine(line))
                        .filter((g: any) => g != null);
                    if (proxyGroups.length > 0) {
                        configOverrides['proxy-groups'] = proxyGroups;
                    } else {
                        delete configOverrides['proxy-groups'];
                    }
                } else {
                    delete configOverrides['proxy-groups'];
                }

                return {
                    type: 'surgeConfig',
                    proxies,
                    config: Object.keys(configOverrides).length > 0 ? configOverrides : null
                };
            }
        }
    } catch (e) {
        console.warn('Surge INI parsing failed:', (e as any)?.message || e);
    }
    return null;
}

/**
 * Parse Surge proxy-group line into Clash-compatible object
 */
function parseSurgeProxyGroupLine(line: string): any | null {
    if (!line || typeof line !== 'string') {
        return null;
    }

    const match = line.match(/^(.+?)\s*=\s*(\w+[-\w]*)(?:,\s*(.*))?$/);
    if (!match) {
        return null;
    }

    const [, name, type, rest] = match;
    const parts = (rest || '').split(/,\s*/).filter(p => p.trim());

    const proxies: string[] = [];
    const extras: Record<string, string> = {};

    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes('=')) {
            const eqIndex = trimmed.indexOf('=');
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            extras[key] = value;
        } else if (trimmed) {
            proxies.push(trimmed);
        }
    }

    const group: any = {
        name: name!.trim(),
        type: type!.toLowerCase() === 'url-test' ? 'url-test' : 'select',
        proxies
    };

    if (extras.url) group.url = extras.url;
    if (extras.interval) group.interval = parseInt(extras.interval) || 300;

    return group;
}

/**
 * Parse subscription content and extract proxies
 */
export function parseSubscriptionContent(content: string): ParsedConfig | string[] {
    if (!content || typeof content !== 'string') {
        return [];
    }

    const trimmed = content.trim();
    if (!trimmed) {
        return [];
    }

    const singboxResult = parseSingboxJson(trimmed);
    if (singboxResult) return singboxResult;

    const clashResult = parseClashYaml(trimmed);
    if (clashResult) return clashResult;

    const surgeResult = parseSurgeIni(trimmed);
    if (surgeResult) return surgeResult;

    return trimmed.split('\n').filter(line => line.trim() !== '');
}
