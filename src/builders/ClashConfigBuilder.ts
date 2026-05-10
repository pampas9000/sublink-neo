import yaml from 'js-yaml';
import { CLASH_CONFIG, generateRules, generateClashRuleSets, getOutbounds, PREDEFINED_RULE_SETS, DIRECT_DEFAULT_RULES } from '../config/index.ts';
import { BaseConfigBuilder } from './BaseConfigBuilder.ts';
import { deepCopy, groupProxiesByCountry } from '../utils.ts';
import { addProxyWithDedup } from './helpers/proxyHelpers.ts';
import { buildSelectorMembers, buildNodeSelectMembers, uniqueNames } from './helpers/groupBuilder.ts';
import { emitClashRules, sanitizeClashProxyGroups } from './helpers/clashConfigUtils.ts';
import { normalizeGroupName, findGroupIndexByName } from './helpers/groupNameUtils.ts';
import { ProxyConfig } from '../schemas/index.ts';

/**
 * Check if the client supports MRS (Meta Rule Set) format
 */
function supportsMrsFormat(userAgent?: string): boolean {
    if (!userAgent) return true;
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mihomo') || 
        ua.includes('meta') ||
        ua.includes('clash-verge') ||
        ua.includes('stash') ||
        ua.includes('verge')) {
        return true;
    }
    
    if (ua.includes('merlin') ||
        ua.includes('clashforwindows') ||
        ua.includes('clashforandroid') ||
        ua.includes('clash/')) {
        return false;
    }
    
    return true;
}

function getClashUdpValue(proxy: any, defaultEnabled = true): boolean {
    if (typeof proxy?.udp !== 'undefined') {
        return proxy.udp;
    }
    return defaultEnabled;
}

export class ClashConfigBuilder extends BaseConfigBuilder {
    private countryGroupNames: string[] = [];
    private manualGroupName: string | null = null;
    private enableClashUI: boolean;
    private externalController?: string;
    private externalUiDownloadUrl?: string;

    constructor(
        inputString: string,
        selectedRules: any,
        customRules: any[],
        baseConfig: any,
        lang: string | null | undefined,
        userAgent?: string,
        groupByCountry = false,
        enableClashUI = false,
        externalController?: string,
        externalUiDownloadUrl?: string,
        includeAutoSelect = true,
        rejectQuic = false,
        fetchUA?: string
    ) {
        const resolvedBaseConfig = baseConfig ?? CLASH_CONFIG;
        super(inputString, resolvedBaseConfig, lang, userAgent, groupByCountry, includeAutoSelect, rejectQuic, fetchUA);
        this.selectedRules = selectedRules;
        this.customRules = customRules;
        this.enableClashUI = enableClashUI;
        this.externalController = externalController;
        this.externalUiDownloadUrl = externalUiDownloadUrl;
    }

    override isCompatibleProviderFormat(format: 'clash' | 'singbox' | 'unknown'): boolean {
        return format === 'clash';
    }

    generateProxyProviders(): Record<string, any> {
        const providers: Record<string, any> = {};
        this.providerUrls.forEach((url, index) => {
            const name = `_auto_provider_${index + 1}`;
            providers[name] = {
                type: 'http',
                url: url,
                path: `./proxy_providers/${name}.yaml`,
                interval: 3600,
                'health-check': {
                    enable: true,
                    url: 'https://www.gstatic.com/generate_204',
                    interval: 300,
                    timeout: 5000,
                    lazy: true
                }
            };
        });
        return providers;
    }

    getProviderNames(): string[] {
        return this.providerUrls.map((_, index) => `_auto_provider_${index + 1}`);
    }

    getAllProviderNames(): string[] {
        const existingProviders = this.config?.['proxy-providers'] && typeof this.config['proxy-providers'] === 'object'
            ? Object.keys(this.config['proxy-providers'])
            : [];
        const autoProviders = this.getProviderNames();
        return [...new Set([...existingProviders, ...autoProviders])];
    }

    getProxies(): any[] {
        return this.config.proxies || [];
    }

    getProxyName(proxy: any): string {
        return proxy.name;
    }

    convertProxy(proxy: ProxyConfig): any {
        const p = proxy as any;
        switch (proxy.type) {
            case 'shadowsocks':
                return {
                    name: proxy.tag,
                    type: 'ss',
                    server: proxy.server,
                    port: proxy.server_port,
                    cipher: proxy.method,
                    password: proxy.password,
                    udp: getClashUdpValue(proxy),
                    ...(p.plugin ? { plugin: p.plugin } : {}),
                    ...(p.plugin_opts ? { 'plugin-opts': p.plugin_opts } : {})
                };
            case 'vmess':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    alterId: proxy.alter_id ?? 0,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    servername: proxy.tls?.server_name || '',
                    'skip-cert-verify': !!proxy.tls?.insecure,
                    network: proxy.transport?.type || (proxy as any).network || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws'
                        ? {
                            path: proxy.transport.path,
                            headers: proxy.transport.headers
                        }
                        : undefined,
                    'http-opts': proxy.transport?.type === 'http'
                        ? (() => {
                            const opts: any = {
                                method: proxy.transport.method || 'GET',
                                path: Array.isArray(proxy.transport.path) ? proxy.transport.path : [proxy.transport.path || '/'],
                            };
                            if (proxy.transport.headers && Object.keys(proxy.transport.headers).length > 0) {
                                opts.headers = proxy.transport.headers;
                            }
                            return opts;
                        })()
                        : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc'
                        ? {
                            'grpc-service-name': proxy.transport.service_name
                        }
                        : undefined,
                    'h2-opts': proxy.transport?.type === 'h2'
                        ? {
                            path: proxy.transport.path,
                            host: proxy.transport.host
                        }
                        : undefined,
                    udp: getClashUdpValue(proxy)
                };
            case 'vless':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    cipher: (proxy as any).security || 'none',
                    tls: proxy.tls?.enabled || false,
                    'client-fingerprint': proxy.tls?.utls?.fingerprint,
                    servername: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    } : undefined,
                    'reality-opts': proxy.tls?.reality?.enabled ? {
                        'public-key': proxy.tls.reality.public_key,
                        'short-id': proxy.tls.reality.short_id,
                    } : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc' ? {
                        'grpc-service-name': proxy.transport.service_name,
                    } : undefined,
                    tfo: proxy.tcp_fast_open,
                    'skip-cert-verify': !!proxy.tls?.insecure,
                    udp: getClashUdpValue(proxy),
                    ...((proxy as any).alpn ? { alpn: (proxy as any).alpn } : {}),
                    ...((proxy as any).packet_encoding ? { 'packet-encoding': (proxy as any).packet_encoding } : {}),
                    'flow': proxy.flow ?? undefined,
                };
            case 'hysteria2':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    ...(p.ports ? { ports: p.ports } : {}),
                    obfs: proxy.obfs?.type,
                    'obfs-password': proxy.obfs?.password,
                    password: proxy.password,
                    auth: (proxy as any).auth,
                    up: proxy.up,
                    down: proxy.down,
                    'recv-window-conn': (proxy as any).recv_window_conn,
                    sni: proxy.tls?.server_name || '',
                    'skip-cert-verify': !!proxy.tls?.insecure,
                    ...((proxy as any).hop_interval !== undefined ? { 'hop-interval': (proxy as any).hop_interval } : {}),
                    ...((proxy as any).alpn ? { alpn: (proxy as any).alpn } : {}),
                    ...((proxy as any).fast_open !== undefined ? { 'fast-open': (proxy as any).fast_open } : {}),
                };
            case 'trojan':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    password: proxy.password,
                    cipher: (proxy as any).security || 'none',
                    tls: proxy.tls?.enabled || false,
                    'client-fingerprint': proxy.tls?.utls?.fingerprint,
                    sni: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    } : undefined,
                    'reality-opts': proxy.tls?.reality?.enabled ? {
                        'public-key': proxy.tls.reality.public_key,
                        'short-id': proxy.tls.reality.short_id,
                    } : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc' ? {
                        'grpc-service-name': proxy.transport.service_name,
                    } : undefined,
                    tfo: proxy.tcp_fast_open,
                    'skip-cert-verify': !!proxy.tls?.insecure,
                    ...((proxy as any).alpn ? { alpn: (proxy as any).alpn } : {}),
                    'flow': proxy.flow ?? undefined,
                    udp: getClashUdpValue(proxy),
                };
            case 'tuic':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    password: proxy.password,
                    'congestion-controller': proxy.congestion_control,
                    'skip-cert-verify': !!proxy.tls?.insecure,
                    ...((proxy as any).disable_sni !== undefined ? { 'disable-sni': (proxy as any).disable_sni } : {}),
                    ...(proxy.tls?.alpn ? { alpn: proxy.tls.alpn } : {}),
                    'sni': proxy.tls?.server_name,
                    'udp-relay-mode': proxy.udp_relay_mode || 'native',
                    ...((proxy as any).zero_rtt !== undefined ? { 'zero-rtt': (proxy as any).zero_rtt } : {}),
                    ...((proxy as any).reduce_rtt !== undefined ? { 'reduce-rtt': (proxy as any).reduce_rtt } : {}),
                    ...((proxy as any).fast_open !== undefined ? { 'fast-open': (proxy as any).fast_open } : {}),
                };
            case 'anytls':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    password: proxy.password,
                    'skip-cert-verify': !!proxy.tls?.insecure,
                    alpn: proxy.tls?.alpn,
                    'sni': proxy.tls?.server_name,
                    'client-fingerprint': proxy.tls?.utls?.fingerprint,
                    udp: getClashUdpValue(proxy),
                    'idle-session-check-interval': proxy['idle-session-check-interval'],
                    'idle-session-timeout': proxy['idle-session-timeout'],
                    'min-idle-session': proxy['min-idle-session']
                };
            default:
                return {
                    name: (proxy as any).tag,
                    ...p
                };
        }
    }

    addProxyToConfig(proxy: any): void {
        this.config.proxies = this.config.proxies || [];
        addProxyWithDedup(this.config.proxies, proxy, {
            getName: (item) => item?.name,
            setName: (item, name) => {
                if (item) item.name = name;
            },
            isSame: (a = {}, b = {}) => {
                const { name: _name, ...restOfProxy } = b;
                const { name: __name, ...restOfExisting } = a;
                return JSON.stringify(restOfProxy) === JSON.stringify(restOfExisting);
            }
        });
    }

    private hasProxyGroup(name: string): boolean {
        const target = normalizeGroupName(name);
        return (this.config['proxy-groups'] || []).some((group: any) => group && normalizeGroupName(group.name) === target);
    }

    addAutoSelectGroup(proxyList: string[]): void {
        if (!this.includeAutoSelect) return;
        this.config['proxy-groups'] = this.config['proxy-groups'] || [];
        const autoName = this.t('outboundNames.Auto Select');
        if (this.hasProxyGroup(autoName)) return;

        const group: any = {
            name: autoName,
            type: 'url-test',
            proxies: deepCopy(uniqueNames(proxyList)),
            url: 'https://www.gstatic.com/generate_204',
            interval: 300,
            lazy: false
        };

        const providerNames = this.getAllProviderNames();
        if (providerNames.length > 0) {
            group.use = providerNames;
        }

        this.config['proxy-groups'].push(group);
    }

    addNodeSelectGroup(proxyList: string[]): void {
        this.config['proxy-groups'] = this.config['proxy-groups'] || [];
        const nodeName = this.t('outboundNames.Node Select');
        if (this.hasProxyGroup(nodeName)) return;
        const list = buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName || undefined,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect
        });

        const group: any = {
            type: "select",
            name: nodeName,
            proxies: list
        };

        const providerNames = this.getAllProviderNames();
        if (providerNames.length > 0) {
            group.use = providerNames;
        }

        this.config['proxy-groups'].unshift(group);
    }

    private buildSelectGroupMembers(proxyList: string[] = []): string[] {
        return buildSelectorMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName || undefined,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect
        });
    }

    addOutboundGroups(outbounds: string[], proxyList: string[]): void {
        outbounds.forEach(outbound => {
            if (this.t(`outboundNames.${outbound}`) !== this.t('outboundNames.Node Select')) {
                const name = this.t(`outboundNames.${outbound}`);
                if (!this.hasProxyGroup(name)) {
                    let proxies = this.buildSelectGroupMembers(proxyList);
                    if ((DIRECT_DEFAULT_RULES as any).has(outbound)) {
                        proxies = ['DIRECT', ...proxies.filter(p => p !== 'DIRECT')];
                    }
                    const group: any = {
                        type: "select",
                        name,
                        proxies
                    };
                    const providerNames = this.getAllProviderNames();
                    if (providerNames.length > 0) {
                        group.use = providerNames;
                    }
                    this.config['proxy-groups'].push(group);
                }
            }
        });
    }

    addCustomRuleGroups(proxyList: string[]): void {
        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                const name = this.t(`outboundNames.${rule.name}`);
                if (!this.hasProxyGroup(name)) {
                    const proxies = [
                        this.t('outboundNames.Node Select'),
                        ...(this.includeAutoSelect ? [this.t('outboundNames.Auto Select')] : []),
                        ...(this.manualGroupName ? [this.manualGroupName] : []),
                        'DIRECT',
                        'REJECT'
                    ];
                    const group: any = {
                        type: "select",
                        name,
                        proxies
                    };
                    const providerNames = this.getAllProviderNames();
                    if (providerNames.length > 0) {
                        group.use = providerNames;
                    }
                    this.config['proxy-groups'].push(group);
                }
            });
        }
    }

    addFallBackGroup(proxyList: string[]): void {
        const name = this.t('outboundNames.Fall Back');
        if (this.hasProxyGroup(name)) return;
        const proxies = this.buildSelectGroupMembers(proxyList);
        const group: any = {
            type: "select",
            name,
            proxies
        };
        const providerNames = this.getAllProviderNames();
        if (providerNames.length > 0) {
            group.use = providerNames;
        }
        this.config['proxy-groups'].push(group);
    }

    addCountryGroups(): void {
        const proxies = this.getProxies();
        const countryGroups = groupProxiesByCountry(proxies, {
            getName: proxy => this.getProxyName(proxy)
        });

        const existingNames = new Set((this.config['proxy-groups'] || []).map((g: any) => normalizeGroupName(g?.name)).filter(Boolean));

        const manualProxyNames = proxies.map(p => this.getProxyName(p)).filter(Boolean);
        const manualGroupName = manualProxyNames.length > 0 ? this.t('outboundNames.Manual Switch') : null;
        if (manualGroupName) {
            const manualNorm = normalizeGroupName(manualGroupName);
            if (!existingNames.has(manualNorm)) {
                const group: any = {
                    name: manualGroupName,
                    type: 'select',
                    proxies: manualProxyNames
                };
                const providerNames = this.getAllProviderNames();
                if (providerNames.length > 0) {
                    group.use = providerNames;
                }
                this.config['proxy-groups'].push(group);
                existingNames.add(manualNorm);
            }
        }

        const countries = Object.keys(countryGroups).sort((a, b) => a.localeCompare(b));
        const countryGroupNames: string[] = [];

        countries.forEach(country => {
            const groupInfo = (countryGroups as any)[country];
            const { emoji, name, proxies: countryProxies } = groupInfo;
            const groupName = `${emoji} ${name}`;
            const norm = normalizeGroupName(groupName);
            if (!existingNames.has(norm)) {
                const group: any = {
                    name: groupName,
                    type: 'url-test',
                    proxies: countryProxies,
                    url: 'https://www.gstatic.com/generate_204',
                    interval: 300,
                    lazy: false
                };
                const providerNames = this.getAllProviderNames();
                if (providerNames.length > 0) {
                    group.use = providerNames;
                }
                this.config['proxy-groups'].push(group);
                existingNames.add(norm);
            }
            countryGroupNames.push(groupName);
        });

        const nodeSelectGroup = this.config['proxy-groups'].find((g: any) => g && g.name === this.t('outboundNames.Node Select'));
        if (nodeSelectGroup && Array.isArray(nodeSelectGroup.proxies)) {
            const rebuilt = buildNodeSelectMembers({
                proxyList: [],
                translator: this.t,
                groupByCountry: true,
                manualGroupName: manualGroupName || undefined,
                countryGroupNames,
                includeAutoSelect: this.includeAutoSelect
            });
            nodeSelectGroup.proxies = rebuilt;
        }
        this.countryGroupNames = countryGroupNames;
        this.manualGroupName = manualGroupName;
    }

    override mergeUserProxyGroups(userGroups: any[]): void {
        if (!Array.isArray(userGroups)) return;

        const proxyList = this.getProxyList();
        const allProviderNames = new Set(this.getAllProviderNames());

        const groupNames = new Set<string>(
            (this.config['proxy-groups'] || [])
                .map((g: any) => normalizeGroupName(g?.name))
                .filter(Boolean) as string[]
        );
        const validRefs = new Set<string>(['DIRECT', 'REJECT']);
        proxyList.forEach(n => validRefs.add(n));
        groupNames.forEach(n => validRefs.add(n));

        userGroups.forEach(userGroup => {
            if (!userGroup?.name) return;

            const existingIndex = findGroupIndexByName(
                this.config['proxy-groups'],
                userGroup.name
            );

            if (existingIndex >= 0) {
                const existing = this.config['proxy-groups'][existingIndex];

                if (Array.isArray(userGroup.use) && userGroup.use.length > 0) {
                    const validUserProviders = userGroup.use.filter((p: string) => allProviderNames.has(p));
                    existing.use = [...new Set([
                        ...(existing.use || []),
                        ...validUserProviders
                    ])];
                }

                if (Array.isArray(userGroup.proxies)) {
                    const validUserProxies = userGroup.proxies.filter((p: string) => validRefs.has(p));
                    existing.proxies = [...new Set([
                        ...(existing.proxies || []),
                        ...validUserProxies
                    ])];
                }

                if (userGroup.url) existing.url = userGroup.url;
                if (typeof userGroup.interval === 'number') existing.interval = userGroup.interval;
                if (typeof userGroup.lazy === 'boolean') existing.lazy = userGroup.lazy;
            } else {
                const newGroup = { ...userGroup };

                if (Array.isArray(newGroup.proxies)) {
                    newGroup.proxies = newGroup.proxies.filter((p: string) => validRefs.has(p));
                }

                if (Array.isArray(newGroup.use)) {
                    newGroup.use = newGroup.use.filter((p: string) => allProviderNames.has(p));
                }

                const isAutoFillableType = newGroup.type === 'url-test' || newGroup.type === 'fallback';
                if ((newGroup.proxies?.length > 0) || (newGroup.use?.length > 0) || isAutoFillableType) {
                    this.config['proxy-groups'].push(newGroup);
                }
            }
        });
    }

    validateProxyGroups(): void {
        const proxyList = this.getProxyList();
        const providerNames = this.getAllProviderNames();

        (this.config['proxy-groups'] || []).forEach((group: any) => {
            if ((group.type === 'url-test' || group.type === 'fallback') &&
                (!group.proxies || group.proxies.length === 0) &&
                (!group.use || group.use.length === 0)) {
                group.proxies = [...proxyList];
                if (providerNames.length > 0) {
                    group.use = [...providerNames];
                }
            }
        });
    }

    formatConfig(): string {
        const rules = this.generateRules();
        const useMrs = supportsMrsFormat(this.userAgent);
        const { site_rule_providers, ip_rule_providers } = generateClashRuleSets(this.selectedRules, this.customRules, useMrs);
        this.config['rule-providers'] = {
            ...this.config['rule-providers'],
            ...site_rule_providers,
            ...ip_rule_providers
        };
        const ruleResults = emitClashRules(rules, this.t);

        if (this.providerUrls.length > 0) {
            this.config['proxy-providers'] = {
                ...this.config['proxy-providers'],
                ...this.generateProxyProviders()
            };
        }

        this.validateProxyGroups();
        sanitizeClashProxyGroups(this.config);

        this.config.rules = [
            ...(this.rejectQuic ? ['AND,((NETWORK,UDP),(DST-PORT,443)),REJECT'] : []),
            ...ruleResults,
            `MATCH,${this.t('outboundNames.Fall Back')}`
        ];

        if (this.enableClashUI || this.externalController || this.externalUiDownloadUrl) {
            const defaultController = '0.0.0.0:9090';
            const defaultUiPath = './ui';
            const defaultUiName = 'zashboard';
            const defaultUiUrl = 'https://gh-proxy.com/https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip';
            const defaultSecret = '';

            const controller = this.externalController || this.config['external-controller'] || defaultController;
            const uiPath = this.config['external-ui'] || defaultUiPath;
            const uiName = this.config['external-ui-name'] || defaultUiName;
            const uiUrl = this.externalUiDownloadUrl || this.config['external-ui-url'] || defaultUiUrl;
            const secret = this.config['secret'] ?? defaultSecret;

            this.config['external-controller'] = controller;
            this.config['external-ui'] = uiPath;
            this.config['external-ui-name'] = uiName;
            this.config['external-ui-url'] = uiUrl;
            this.config['secret'] = secret;
        }

        return yaml.dump(this.config);
    }
}
