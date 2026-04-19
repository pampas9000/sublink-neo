import { BaseConfigBuilder } from './BaseConfigBuilder.ts';
import { groupProxiesByCountry } from '../utils.ts';
import { SURGE_CONFIG, SURGE_SITE_RULE_SET_BASEURL, SURGE_IP_RULE_SET_BASEURL, generateRules, DIRECT_DEFAULT_RULES } from '../config/index.ts';
import { addProxyWithDedup } from './helpers/proxyHelpers.ts';
import { buildSelectorMembers, buildNodeSelectMembers, uniqueNames } from './helpers/groupBuilder.ts';
import { ProxyConfig } from '../schemas/index.ts';

export class SurgeConfigBuilder extends BaseConfigBuilder {
    private subscriptionUrl: string | null = null;
    private countryGroupNames: string[] = [];
    private manualGroupName: string | null = null;

    constructor(
        inputString: string,
        selectedRules: any,
        customRules: any[],
        baseConfig: any,
        lang: string | null | undefined,
        userAgent?: string,
        groupByCountry = false,
        includeAutoSelect = true,
        rejectQuic = false,
        fetchUA?: string
    ) {
        const resolvedBaseConfig = baseConfig ?? SURGE_CONFIG;
        super(inputString, resolvedBaseConfig, lang, userAgent, groupByCountry, includeAutoSelect, rejectQuic, fetchUA);
        this.selectedRules = selectedRules;
        this.customRules = customRules;
    }

    setSubscriptionUrl(url: string | null): this {
        this.subscriptionUrl = url;
        return this;
    }

    getProxies(): any[] {
        return this.config.proxies || [];
    }

    /**
     * Get only valid proxies (filter out comment lines for unsupported types)
     */
    getValidProxies(): string[] {
        return this.getProxies().filter(proxy =>
            typeof proxy === 'string' && !proxy.trimStart().startsWith('#')
        );
    }

    override getProxyList(): string[] {
        return this.getValidProxies().map(proxy => this.getProxyName(proxy));
    }

    getProxyName(proxy: any): string {
        if (typeof proxy === 'string') {
            return proxy.split('=')[0]!.trim();
        }
        return (proxy.name || proxy.tag || '').trim();
    }

    convertProxy(proxy: ProxyConfig): any {
        let surgeProxy: string;
        switch (proxy.type) {
            case 'shadowsocks':
                surgeProxy = `${proxy.tag} = ss, ${proxy.server}, ${proxy.server_port}, encrypt-method=${proxy.method}, password=${proxy.password}`;
                break;
            case 'vmess':
                surgeProxy = `${proxy.tag} = vmess, ${proxy.server}, ${proxy.server_port}, username=${proxy.uuid}`;
                if (proxy.alter_id === 0) {
                    surgeProxy += ', vmess-aead=true';
                }
                if (proxy.tls?.enabled) {
                    surgeProxy += ', tls=true';
                    if (proxy.tls.server_name) {
                        surgeProxy += `, sni=${proxy.tls.server_name}`;
                    }
                    if (proxy.tls.insecure) {
                        surgeProxy += ', skip-cert-verify=true';
                    }
                    if (proxy.tls.alpn) {
                        surgeProxy += `, alpn=${proxy.tls.alpn.join(',')}`;
                    }
                }
                if (proxy.transport?.type === 'ws') {
                    surgeProxy += `, ws=true, ws-path=${proxy.transport.path}`;
                    if (proxy.transport.headers) {
                        surgeProxy += `, ws-headers=Host:${(proxy.transport.headers as any).host}`;
                    }
                } else if (proxy.transport?.type === 'grpc') {
                    surgeProxy += `, grpc-service-name=${proxy.transport.service_name}`;
                }
                break;
            case 'trojan':
                surgeProxy = `${proxy.tag} = trojan, ${proxy.server}, ${proxy.server_port}, password=${proxy.password}`;
                if (proxy.tls?.server_name) {
                    surgeProxy += `, sni=${proxy.tls.server_name}`;
                }
                if (proxy.tls?.insecure) {
                    surgeProxy += ', skip-cert-verify=true';
                }
                if (proxy.tls?.alpn) {
                    surgeProxy += `, alpn=${proxy.tls.alpn.join(',')}`;
                }
                if (proxy.transport?.type === 'ws') {
                    surgeProxy += `, ws=true, ws-path=${proxy.transport.path}`;
                    if (proxy.transport.headers) {
                        surgeProxy += `, ws-headers=Host:${(proxy.transport.headers as any).host}`;
                    }
                } else if (proxy.transport?.type === 'grpc') {
                    surgeProxy += `, grpc-service-name=${proxy.transport.service_name}`;
                }
                break;
            case 'hysteria2':
                surgeProxy = `${proxy.tag} = hysteria2, ${proxy.server}, ${proxy.server_port}, password=${proxy.password}`;
                if (proxy.tls?.server_name) {
                    surgeProxy += `, sni=${proxy.tls.server_name}`;
                }
                if (proxy.tls?.insecure) {
                    surgeProxy += ', skip-cert-verify=true';
                }
                if (proxy.tls?.alpn) {
                    surgeProxy += `, alpn=${proxy.tls.alpn.join(',')}`;
                }
                break;
            case 'tuic':
                surgeProxy = `${proxy.tag} = tuic, ${proxy.server}, ${proxy.server_port}, password=${proxy.password}, uuid=${proxy.uuid}`;
                if (proxy.tls?.server_name) {
                    surgeProxy += `, sni=${proxy.tls.server_name}`;
                }
                if (proxy.tls?.alpn) {
                    surgeProxy += `, alpn=${proxy.tls.alpn.join(',')}`;
                }
                if (proxy.tls?.insecure) {
                    surgeProxy += ', skip-cert-verify=true';
                }
                if (proxy.congestion_control) {
                    surgeProxy += `, congestion-controller=${proxy.congestion_control}`;
                }
                if (proxy.udp_relay_mode) {
                    surgeProxy += `, udp-relay-mode=${proxy.udp_relay_mode}`;
                }
                break;
            default:
                surgeProxy = `# ${proxy.tag} - Unsupported proxy type: ${proxy.type}`;
        }
        return surgeProxy;
    }

    addProxyToConfig(proxy: any): void {
        this.config.proxies = this.config.proxies || [];
        addProxyWithDedup(this.config.proxies, proxy, {
            getName: (item) => this.getProxyName(item),
            setName: (value, name) => {
                const equalsPos = typeof value === 'string' ? value.indexOf('=') : -1;
                if (equalsPos > 0) {
                    return `${name}${value.substring(equalsPos)}`;
                }
                return value;
            },
            isSame: (existing, incoming) => {
                if (typeof existing !== 'string' || typeof incoming !== 'string') return false;
                const existingSuffix = existing.substring(existing.indexOf('='));
                const incomingSuffix = incoming.substring(incoming.indexOf('='));
                return existingSuffix === incomingSuffix;
            }
        });
    }

    private hasProxyGroup(name: string): boolean {
        const target = typeof name === 'string' ? name.trim() : name;
        if (!target) return false;
        return (this.config['proxy-groups'] || []).some((group: any) => {
            let existing;
            if (typeof group === 'string') {
                existing = this.getProxyName(group)?.trim();
            } else if (group && typeof group === 'object') {
                existing = (group.name || '').trim();
            }
            return existing === target;
        });
    }

    private getGroupName(group: any): string | undefined {
        if (typeof group === 'string') {
            return this.getProxyName(group);
        } else if (group && typeof group === 'object') {
            return group.name;
        }
        return undefined;
    }

    private convertObjectGroupToSurgeString(group: any): string | null {
        if (!group || !group.name || !group.type) {
            return null;
        }

        const name = group.name;
        const type = group.type === 'url-test' ? 'url-test' : 'select';
        const proxies = Array.isArray(group.proxies) ? group.proxies : [];

        let result = `${name} = ${type}`;
        if (proxies.length > 0) {
            result += `, ${proxies.join(', ')}`;
        }

        if (type === 'url-test') {
            if (group.url) {
                result += `, url=${group.url}`;
            } else {
                result += ', url=http://www.gstatic.com/generate_204';
            }
            if (group.interval) {
                result += `, interval=${group.interval}`;
            } else {
                result += ', interval=300';
            }
        }

        return result;
    }

    private createProxyGroup(name: string, type: string, options: string[] = [], extraConfig = ''): string {
        const sanitized = this.sanitizeOptions(options);
        const optionsPart = sanitized.length > 0 ? `, ${sanitized.join(', ')}` : '';
        return `${name} = ${type}${optionsPart}${extraConfig}`;
    }

    private sanitizeOptions(options: any[] = []): string[] {
        return uniqueNames(options);
    }

    private buildNodeSelectOptions(proxyList: string[] = []): string[] {
        return buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: false,
            manualGroupName: this.manualGroupName || undefined,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect
        });
    }

    private buildAggregatedOptions(proxyList: string[] = []): string[] {
        return buildSelectorMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName || undefined,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect
        });
    }

    addAutoSelectGroup(proxyList: string[]): void {
        if (!this.includeAutoSelect) return;
        this.config['proxy-groups'] = this.config['proxy-groups'] || [];
        const name = this.t('outboundNames.Auto Select');
        if (this.hasProxyGroup(name)) return;
        this.config['proxy-groups'].push(
            this.createProxyGroup(
                name,
                'url-test',
                this.sanitizeOptions(proxyList),
                ', url=http://www.gstatic.com/generate_204, interval=300'
            )
        );
    }

    addNodeSelectGroup(proxyList: string[]): void {
        const options = this.buildNodeSelectOptions(proxyList);
        if (this.hasProxyGroup(this.t('outboundNames.Node Select'))) return;
        this.config['proxy-groups'].push(
            this.createProxyGroup(this.t('outboundNames.Node Select'), 'select', options)
        );
    }

    addOutboundGroups(outbounds: string[], proxyList: string[]): void {
        outbounds.forEach(outbound => {
            if (this.t(`outboundNames.${outbound}`) !== this.t('outboundNames.Node Select')) {
                let options = this.buildAggregatedOptions(proxyList);
                const name = this.t(`outboundNames.${outbound}`);
                if (this.hasProxyGroup(name)) {
                    return;
                }
                if ((DIRECT_DEFAULT_RULES as any).has(outbound)) {
                    options = ['DIRECT', ...options.filter(p => p !== 'DIRECT')];
                }
                this.config['proxy-groups'].push(
                    this.createProxyGroup(name, 'select', options)
                );
            }
        });
    }

    addCustomRuleGroups(proxyList: string[]): void {
        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                if (this.hasProxyGroup(rule.name)) return;
                const options = [
                    this.t('outboundNames.Node Select'),
                    ...(this.includeAutoSelect ? [this.t('outboundNames.Auto Select')] : []),
                    ...(this.manualGroupName ? [this.manualGroupName] : []),
                    'DIRECT',
                    'REJECT'
                ];
                this.config['proxy-groups'].push(
                    this.createProxyGroup(rule.name, 'select', options)
                );
            });
        }
    }

    addFallBackGroup(proxyList: string[]): void {
        const options = this.buildAggregatedOptions(proxyList);
        if (this.hasProxyGroup(this.t('outboundNames.Fall Back'))) return;
        this.config['proxy-groups'].push(
            this.createProxyGroup(this.t('outboundNames.Fall Back'), 'select', options)
        );
    }

    addCountryGroups(): void {
        const proxies = this.getValidProxies();
        const countryGroups = groupProxiesByCountry(proxies, {
            getName: proxy => this.getProxyName(proxy)
        });

        const existing = new Set((this.config['proxy-groups'] || [])
            .map((g: any) => this.getGroupName(g)?.trim())
            .filter(Boolean));

        const manualProxyNames = proxies.map(p => this.getProxyName(p)).filter(Boolean);
        const manualGroupName = manualProxyNames.length > 0 ? this.t('outboundNames.Manual Switch') : null;
        if (manualGroupName) {
            const manualNorm = manualGroupName.trim();
            if (!existing.has(manualNorm)) {
                this.config['proxy-groups'].push(
                    this.createProxyGroup(manualGroupName, 'select', this.sanitizeOptions(manualProxyNames))
                );
                existing.add(manualNorm);
            }
        }

        const countryGroupNames: string[] = [];
        const countries = Object.keys(countryGroups).sort((a, b) => a.localeCompare(b));

        countries.forEach(country => {
            const groupInfo = (countryGroups as any)[country];
            const { emoji, name, proxies: countryProxies } = groupInfo;
            const groupName = `${emoji} ${name}`;
            countryGroupNames.push(groupName);
            if (!existing.has(groupName.trim())) {
                this.config['proxy-groups'].push(
                    this.createProxyGroup(groupName, 'url-test', countryProxies, ', url=https://www.gstatic.com/generate_204, interval=300')
                );
                existing.add(groupName.trim());
            }
        });

        const nodeSelectGroupIndex = (this.config['proxy-groups'] || []).findIndex((g: any) => this.getGroupName(g) === this.t('outboundNames.Node Select'));
        if (nodeSelectGroupIndex > -1) {
            const newOptions = buildNodeSelectMembers({
                proxyList: [],
                translator: this.t,
                groupByCountry: true,
                manualGroupName: manualGroupName || undefined,
                countryGroupNames,
                includeAutoSelect: this.includeAutoSelect
            });
            const newGroup = this.createProxyGroup(this.t('outboundNames.Node Select'), 'select', newOptions);
            this.config['proxy-groups'][nodeSelectGroupIndex] = newGroup;
        }
        this.countryGroupNames = countryGroupNames;
        this.manualGroupName = manualGroupName;
    }

    formatConfig(): string {
        const rules = generateRules(this.selectedRules, this.customRules);
        let finalConfig: string[] = [];

        if (this.subscriptionUrl) {
            finalConfig.push(`#!MANAGED-CONFIG ${this.subscriptionUrl} interval=43200 strict=false`);
            finalConfig.push('');
        }

        finalConfig.push('[General]');
        if (this.config.general) {
            Object.entries(this.config.general).forEach(([key, value]) => {
                finalConfig.push(`${key} = ${value}`);
            });
        }

        if (this.config.replica) {
            finalConfig.push('\n[Replica]');
            Object.entries(this.config.replica).forEach(([key, value]) => {
                finalConfig.push(`${key} = ${value}`);
            });
        }

        finalConfig.push('\n[Proxy]');
        finalConfig.push('DIRECT = direct');
        if (this.config.proxies) {
            finalConfig.push(...this.config.proxies);
        }

        finalConfig.push('\n[Proxy Group]');
        if (this.config['proxy-groups']) {
            const groupStrings = (this.config['proxy-groups'] as any[]).map(group => {
                if (typeof group === 'string') {
                    return group;
                } else if (group && typeof group === 'object') {
                    return this.convertObjectGroupToSurgeString(group);
                }
                return null;
            }).filter(g => g != null);
            finalConfig.push(...(groupStrings as string[]));
        }

        finalConfig.push('\n[Rule]');
        if (this.rejectQuic) {
            finalConfig.push('UDP,DEST-PORT,443,REJECT');
        }

        rules.filter(rule => Array.isArray(rule.src_ip_cidr) && rule.src_ip_cidr.length > 0).map(rule => {
            (rule.src_ip_cidr as any[]).forEach(cidr => {
                const value = typeof cidr === 'string' ? cidr.trim() : cidr;
                if (!value) return;

                const safeValue = typeof value === 'string' ? value.replace(/[\r\n]+/g, '').trim() : value;
                if (!safeValue) return;

                if (typeof safeValue === 'string' && safeValue.endsWith('/32')) {
                    finalConfig.push(`SRC-IP,${safeValue.slice(0, -3)},${this.t('outboundNames.' + rule.outbound)}`);
                } else if (typeof safeValue === 'string' && !safeValue.includes('/')) {
                    finalConfig.push(`SRC-IP,${safeValue},${this.t('outboundNames.' + rule.outbound)}`);
                } else if (typeof safeValue === 'string' && safeValue.includes('/')) {
                    finalConfig.push(`# SRC-IP-CIDR not supported by Surge, skipped: ${safeValue}`);
                }
            });
        });

        rules.filter(rule => !!rule.domain_suffix).map(rule => {
            (rule.domain_suffix as string[]).forEach(suffix => {
                finalConfig.push(`DOMAIN-SUFFIX,${suffix},${this.t('outboundNames.' + rule.outbound)}`);
            });
        });

        rules.filter(rule => !!rule.domain_keyword).map(rule => {
            (rule.domain_keyword as string[]).forEach(keyword => {
                finalConfig.push(`DOMAIN-KEYWORD,${keyword},${this.t('outboundNames.' + rule.outbound)}`);
            });
        });

        rules.filter(rule => rule.site_rules && rule.site_rules.length > 0 && rule.site_rules[0] !== '').map(rule => {
            (rule.site_rules as string[]).forEach(site => {
                finalConfig.push(`RULE-SET,${SURGE_SITE_RULE_SET_BASEURL}${site}.conf,${this.t('outboundNames.' + rule.outbound)}`);
            });
        });

        rules.filter(rule => rule.ip_rules && rule.ip_rules.length > 0 && rule.ip_rules[0] !== '').map(rule => {
            (rule.ip_rules as string[]).forEach(ip => {
                finalConfig.push(`RULE-SET,${SURGE_IP_RULE_SET_BASEURL}${ip}.txt,${this.t('outboundNames.' + rule.outbound)},no-resolve`);
            });
        });

        rules.filter(rule => !!rule.ip_cidr).map(rule => {
            (rule.ip_cidr as string[]).forEach(cidr => {
                finalConfig.push(`IP-CIDR,${cidr},${this.t('outboundNames.' + rule.outbound)},no-resolve`);
            });
        });

        finalConfig.push('FINAL,' + this.t('outboundNames.Fall Back'));

        return finalConfig.join('\n');
    }

    getCurrentUrl(): string | null {
        try {
            if (typeof self !== 'undefined' && self.location) {
                return self.location.href;
            }
            return null;
        } catch (error) {
            console.error('Error getting current URL:', error);
            return null;
        }
    }
}
