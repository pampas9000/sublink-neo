import { SING_BOX_CONFIG, generateRuleSets, generateRules, DIRECT_DEFAULT_RULES } from '../config/index.ts';
import { BaseConfigBuilder } from './BaseConfigBuilder.ts';
import { deepCopy, groupProxiesByCountry } from '../utils.ts';
import { addProxyWithDedup } from './helpers/proxyHelpers.ts';
import { buildSelectorMembers as buildSelectorMemberList, buildNodeSelectMembers, uniqueNames } from './helpers/groupBuilder.ts';
import { normalizeGroupName } from './helpers/groupNameUtils.ts';
import { ProxyConfig } from '../schemas/index.ts';

export class SingboxConfigBuilder extends BaseConfigBuilder {
    private countryGroupNames: string[] = [];
    private manualGroupName: string | null = null;
    private enableClashUI: boolean;
    private externalController?: string;
    private externalUiDownloadUrl?: string;
    private singboxVersion: string;

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
        singboxVersion = '1.12',
        includeAutoSelect = true,
        rejectQuic = false,
        fetchUA?: string
    ) {
        const resolvedBaseConfig = baseConfig ?? SING_BOX_CONFIG;
        super(inputString, resolvedBaseConfig, lang, userAgent, groupByCountry, includeAutoSelect, rejectQuic, fetchUA);

        this.selectedRules = selectedRules;
        this.customRules = customRules;
        this.enableClashUI = enableClashUI;
        this.externalController = externalController;
        this.externalUiDownloadUrl = externalUiDownloadUrl;
        this.singboxVersion = singboxVersion;

        if (this.config?.dns?.servers?.length > 0) {
            this.config.dns.servers[0].detour = this.t('outboundNames.Node Select');
        }
    }

    override isCompatibleProviderFormat(format: 'clash' | 'singbox' | 'unknown'): boolean {
        if (this.singboxVersion === '1.11') {
            return false;
        }
        return format === 'singbox';
    }

    generateOutboundProviders(): any[] {
        return this.providerUrls.map((url, index) => ({
            tag: `_auto_provider_${index + 1}`,
            type: 'http',
            download_url: url,
            path: `./providers/_auto_provider_${index + 1}.json`,
            download_interval: '24h',
            health_check: {
                enabled: true,
                url: 'https://www.gstatic.com/generate_204',
                interval: '5m'
            }
        }));
    }

    getProviderTags(): string[] {
        return this.providerUrls.map((_, index) => `_auto_provider_${index + 1}`);
    }

    getAllProviderTags(): string[] {
        if (this.singboxVersion === '1.11') {
            return [];
        }
        const existingTags = Array.isArray(this.config.outbound_providers)
            ? this.config.outbound_providers.map((p: any) => p?.tag).filter(Boolean)
            : [];
        const autoTags = this.getProviderTags();
        return [...new Set([...existingTags, ...autoTags])];
    }

    getProxies(): any[] {
        return (this.config.outbounds || []).filter((outbound: any) => outbound?.server !== undefined);
    }

    getProxyName(proxy: any): string {
        return proxy.tag;
    }

    convertProxy(proxy: ProxyConfig): any {
        const sanitized = { ...(proxy as any) };

        delete sanitized.udp;

        if (sanitized.alpn && sanitized.tls) {
            if (!sanitized.tls.alpn) {
                sanitized.tls = { ...sanitized.tls, alpn: sanitized.alpn };
            }
            delete sanitized.alpn;
        } else if (sanitized.alpn && !sanitized.tls) {
            delete sanitized.alpn;
        }

        delete sanitized.packet_encoding;

        if (sanitized.type === 'anytls') {
            if (sanitized['idle-session-check-interval'] !== undefined) {
                sanitized.idle_session_check_interval = `${sanitized['idle-session-check-interval']}s`;
                delete sanitized['idle-session-check-interval'];
            }
            if (sanitized['idle-session-timeout'] !== undefined) {
                sanitized.idle_session_timeout = `${sanitized['idle-session-timeout']}s`;
                delete sanitized['idle-session-timeout'];
            }
            if (sanitized['min-idle-session'] !== undefined) {
                sanitized.min_idle_session = sanitized['min-idle-session'];
                delete sanitized['min-idle-session'];
            }
            if (sanitized.tls?.utls?.fingerprint) {
                sanitized.tls.utls = {
                    enabled: true,
                    fingerprint: sanitized.tls.utls.fingerprint
                };
            }
        }

        if (sanitized.type === 'hysteria2') {
            // Map Clash-style fields onto sing-box's hysteria2 outbound fields
            const toMbps = (value: any): number | undefined => {
                const num = parseInt(String(value), 10);
                return Number.isNaN(num) ? undefined : num;
            };
            if (sanitized.up !== undefined) {
                sanitized.up_mbps ??= toMbps(sanitized.up);
                delete sanitized.up;
            }
            if (sanitized.down !== undefined) {
                sanitized.down_mbps ??= toMbps(sanitized.down);
                delete sanitized.down;
            }
            if (sanitized.ports) {
                sanitized.server_ports ??= String(sanitized.ports)
                    .split(',')
                    .map((range: string) => range.trim().replace('-', ':'))
                    .filter((range: string) => range.length > 0);
                delete sanitized.ports;
            }
            if (typeof sanitized.hop_interval === 'number') {
                sanitized.hop_interval = `${sanitized.hop_interval}s`;
            }
            // sing-box has no certificate fingerprint pin for hysteria2
            delete sanitized.fingerprint;
        }

        return sanitized;
    }

    addProxyToConfig(proxy: any): void {
        this.config.outbounds = this.config.outbounds || [];
        addProxyWithDedup(this.config.outbounds, proxy, {
            getName: (item) => item?.tag,
            setName: (item, name) => {
                if (item) item.tag = name;
            },
            isSame: (existing = {}, incoming = {}) => {
                const { tag: _incomingTag, ...restIncoming } = incoming;
                const { tag: _existingTag, ...restExisting } = existing;
                return JSON.stringify(restIncoming) === JSON.stringify(restExisting);
            }
        });
    }

    private hasOutboundTag(tag: string): boolean {
        const target = normalizeGroupName(tag);
        return (this.config.outbounds || []).some((outbound: any) => normalizeGroupName(outbound?.tag) === target);
    }

    private hasAutoSelectCandidates(proxyList = this.getProxyList()): boolean {
        return (Array.isArray(proxyList) && proxyList.length > 0) || this.getAllProviderTags().length > 0;
    }

    addAutoSelectGroup(proxyList: string[]): void {
        if (!this.includeAutoSelect) return;
        this.config.outbounds = this.config.outbounds || [];
        const tag = this.t('outboundNames.Auto Select');
        if (this.hasOutboundTag(tag)) return;
        const providerTags = this.getAllProviderTags();
        const autoSelectMembers = deepCopy(uniqueNames(proxyList));
        if (autoSelectMembers.length === 0 && providerTags.length === 0) return;

        const group: any = {
            type: "urltest",
            tag,
            outbounds: autoSelectMembers
        };

        if (providerTags.length > 0) {
            group.providers = providerTags;
        }

        this.config.outbounds.unshift(group);
    }

    addNodeSelectGroup(proxyList: string[]): void {
        this.config.outbounds = this.config.outbounds || [];
        const tag = this.t('outboundNames.Node Select');
        if (this.hasOutboundTag(tag)) return;
        const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList);
        const members = buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName || undefined,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect
        });

        const group: any = {
            type: "selector",
            tag,
            outbounds: members
        };

        const providerTags = this.getAllProviderTags();
        if (providerTags.length > 0) {
            group.providers = providerTags;
        }

        this.config.outbounds.unshift(group);
    }

    private buildSelectorMembersList(proxyList: string[] = []): string[] {
        return buildSelectorMemberList({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName || undefined,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList)
        });
    }

    addOutboundGroups(outbounds: string[], proxyList: string[]): void {
        outbounds.forEach(outbound => {
            if (outbound !== 'Node Select' && this.t(`outboundNames.${outbound}`) !== this.t('outboundNames.Node Select')) {
                let selectorMembers = this.buildSelectorMembersList(proxyList);
                const tag = this.t(`outboundNames.${outbound}`);
                if (this.hasOutboundTag(tag)) {
                    return;
                }
                if ((DIRECT_DEFAULT_RULES as any).has(outbound)) {
                    selectorMembers = ['DIRECT', ...selectorMembers.filter(p => p !== 'DIRECT')];
                }
                this.config.outbounds.push({
                    type: "selector",
                    tag,
                    outbounds: selectorMembers
                });
            }
        });
    }

    addCustomRuleGroups(proxyList: string[]): void {
        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList);
                const selectorMembers = [
                    this.t('outboundNames.Node Select'),
                    ...(includeAutoSelect ? [this.t('outboundNames.Auto Select')] : []),
                    ...(this.manualGroupName ? [this.manualGroupName] : []),
                    'DIRECT',
                    'REJECT'
                ];
                if (this.hasOutboundTag(rule.name)) return;
                this.config.outbounds.push({
                    type: "selector",
                    tag: rule.name,
                    outbounds: selectorMembers
                });
            });
        }
    }

    addFallBackGroup(proxyList: string[]): void {
        const selectorMembers = this.buildSelectorMembersList(proxyList);
        if (this.hasOutboundTag(this.t('outboundNames.Fall Back'))) return;
        this.config.outbounds.push({
            type: "selector",
            tag: this.t('outboundNames.Fall Back'),
            outbounds: selectorMembers
        });
    }

    addCountryGroups(): void {
        const proxies = this.getProxies();
        const countryGroups = groupProxiesByCountry(proxies, {
            getName: proxy => this.getProxyName(proxy)
        });

        const existingTags = new Set((this.config.outbounds || []).map((o: any) => normalizeGroupName(o?.tag)).filter(Boolean));

        const manualProxyNames = proxies.map(p => p?.tag).filter(Boolean);
        const manualGroupName = manualProxyNames.length > 0 ? this.t('outboundNames.Manual Switch') : null;
        if (manualGroupName) {
            const manualNorm = normalizeGroupName(manualGroupName);
            if (!existingTags.has(manualNorm)) {
                this.config.outbounds.push({
                    type: 'selector',
                    tag: manualGroupName,
                    outbounds: manualProxyNames
                });
                existingTags.add(manualNorm);
            }
        }

        const countries = Object.keys(countryGroups).sort((a, b) => a.localeCompare(b));
        const countryGroupNames: string[] = [];
        const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates();

        countries.forEach(country => {
            const group = (countryGroups as any)[country];
            const { emoji, name, proxies: countryProxies } = group;
            if (!countryProxies || countryProxies.length === 0) {
                return;
            }
            const groupName = `${emoji} ${name}`;
            const norm = normalizeGroupName(groupName);
            if (!existingTags.has(norm)) {
                this.config.outbounds.push({
                    tag: groupName,
                    type: 'urltest',
                    outbounds: countryProxies
                });
                existingTags.add(norm);
            }
            countryGroupNames.push(groupName);
        });

        const nodeSelectTag = this.t('outboundNames.Node Select');
        const nodeSelectGroup = this.config.outbounds.find((o: any) => normalizeGroupName(o?.tag) === normalizeGroupName(nodeSelectTag));
        if (nodeSelectGroup && Array.isArray(nodeSelectGroup.outbounds)) {
            const rebuilt = buildNodeSelectMembers({
                proxyList: [],
                translator: this.t,
                groupByCountry: true,
                manualGroupName: manualGroupName || undefined,
                countryGroupNames,
                includeAutoSelect
            });
            nodeSelectGroup.outbounds = rebuilt;
        }

        this.countryGroupNames = countryGroupNames;
        this.manualGroupName = manualGroupName;
    }

    override mergeUserProxyGroups(userGroups: any[]): void {
        if (!Array.isArray(userGroups)) return;

        const proxyList = this.getProxyList();
        const allProviderTags = new Set(this.getAllProviderTags());

        const groupTags = new Set<string>(
            (this.config.outbounds || [])
                .filter((o: any) => o.type === 'selector' || o.type === 'urltest')
                .map((o: any) => normalizeGroupName(o?.tag))
                .filter(Boolean) as string[]
        );
        const validRefs = new Set<string>(['DIRECT', 'REJECT', 'direct', 'block']);
        proxyList.forEach(n => validRefs.add(n));
        groupTags.forEach(n => validRefs.add(n));

        userGroups.forEach(userGroup => {
            if (!userGroup?.name) return;

            const existingIndex = (this.config.outbounds || []).findIndex((o: any) =>
                normalizeGroupName(o?.tag) === normalizeGroupName(userGroup.name)
            );

            if (existingIndex >= 0) {
                const existing = this.config.outbounds[existingIndex];

                if (Array.isArray(userGroup.use) && userGroup.use.length > 0) {
                    const validUserProviders = userGroup.use.filter((p: string) => allProviderTags.has(p));
                    existing.providers = [...new Set([
                        ...(existing.providers || []),
                        ...validUserProviders
                    ])];
                }

                if (Array.isArray(userGroup.proxies) && userGroup.proxies.length > 0) {
                    const validUserOutbounds = userGroup.proxies.filter((p: string) => validRefs.has(p));
                    existing.outbounds = [...new Set([
                        ...(existing.outbounds || []),
                        ...validUserOutbounds
                    ])];
                }

                if (userGroup.url) existing.url = userGroup.url;
                if (typeof userGroup.interval === 'number') {
                    existing.interval = `${userGroup.interval}s`;
                }
            } else {
                const newOutbound: any = {
                    type: userGroup.type === 'url-test' ? 'urltest' : 'selector',
                    tag: userGroup.name
                };

                if (Array.isArray(userGroup.proxies)) {
                    newOutbound.outbounds = userGroup.proxies.filter((p: string) => validRefs.has(p));
                }

                if (Array.isArray(userGroup.use)) {
                    const validProviders = userGroup.use.filter((p: string) => allProviderTags.has(p));
                    if (validProviders.length > 0) {
                        newOutbound.providers = validProviders;
                    }
                }

                if ((newOutbound.outbounds?.length > 0) || (newOutbound.providers?.length > 0)) {
                    this.config.outbounds.push(newOutbound);
                }
            }
        });
    }

    validateOutbounds(): void {
        const proxyList = this.getProxyList();
        const providerTags = this.getAllProviderTags();
        const invalidTags = new Set<string>();

        (this.config.outbounds || []).forEach((outbound: any) => {
            if (outbound.type === 'urltest' &&
                (!outbound.outbounds || outbound.outbounds.length === 0) &&
                (!outbound.providers || outbound.providers.length === 0)) {
                outbound.outbounds = [...proxyList];
                if (providerTags.length > 0) {
                    outbound.providers = [...providerTags];
                }
                if ((!outbound.outbounds || outbound.outbounds.length === 0) &&
                    (!outbound.providers || outbound.providers.length === 0)) {
                    invalidTags.add(normalizeGroupName(outbound.tag));
                }
            }
        });

        if (invalidTags.size > 0) {
            this.config.outbounds = (this.config.outbounds || [])
                .filter((outbound: any) => !invalidTags.has(normalizeGroupName(outbound?.tag)))
                .map((outbound: any) => {
                    if (Array.isArray(outbound.outbounds)) {
                        outbound.outbounds = outbound.outbounds.filter((tag: string) => !invalidTags.has(normalizeGroupName(tag)));
                    }
                    return outbound;
                });
        }
    }

    formatConfig(): string {
        const rules = this.generateRules();
        const { site_rule_sets, ip_rule_sets } = generateRuleSets(this.selectedRules, this.customRules);

        this.config.route.rule_set = [...site_rule_sets, ...ip_rule_sets];

        if (this.providerUrls.length > 0) {
            const existingProviders = Array.isArray(this.config.outbound_providers) ? this.config.outbound_providers : [];
            const newProviders = this.generateOutboundProviders();
            this.config.outbound_providers = [...existingProviders, ...newProviders];
        }

        this.validateOutbounds();

        const attachProtocolIfNeeded = (entry: any, rule: any) => {
            if (Array.isArray(rule?.protocol) && rule.protocol.length > 0) {
                entry.protocol = rule.protocol;
            }
            return entry;
        };

        const hasMatchValues = (value: any) => {
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'string') return value.trim() !== '';
            return false;
        };

        rules.filter(rule => Array.isArray(rule.src_ip_cidr) && rule.src_ip_cidr.length > 0).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                source_ip_cidr: rule.src_ip_cidr,
                outbound: this.t(`outboundNames.${rule.outbound}`)
            }, rule));
        });

        rules.filter(rule => hasMatchValues(rule.domain_suffix) || hasMatchValues(rule.domain_keyword)).map(rule => {
            const entry: any = {
                outbound: this.t(`outboundNames.${rule.outbound}`)
            };

            if (hasMatchValues(rule.domain_suffix)) entry.domain_suffix = rule.domain_suffix;
            if (hasMatchValues(rule.domain_keyword)) entry.domain_keyword = rule.domain_keyword;

            this.config.route.rules.push(attachProtocolIfNeeded(entry, rule));
        });

        rules.filter(rule => !!rule.site_rules[0]).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                rule_set: [
                    ...(rule.site_rules.length > 0 && rule.site_rules[0] !== '' ? rule.site_rules : []),
                ],
                outbound: this.t(`outboundNames.${rule.outbound}`)
            }, rule));
        });

        rules.filter(rule => !!rule.ip_rules[0]).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                rule_set: [
                    ...(rule.ip_rules
                        .map((ip: string) => ip.trim())
                        .filter((ip: string) => ip !== '')
                        .map((ip: string) => `${ip}-ip`))
                ],
                outbound: this.t(`outboundNames.${rule.outbound}`)
            }, rule));
        });

        rules.filter(rule => hasMatchValues(rule.ip_cidr)).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                ip_cidr: rule.ip_cidr,
                outbound: this.t(`outboundNames.${rule.outbound}`)
            }, rule));
        });

        rules.filter(rule => !!rule.rule_provider_url).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                rule_set: [rule.outbound],
                outbound: this.t(`outboundNames.${rule.outbound}`)
            }, rule));
        });

        this.config.route.rules.unshift(
            { clash_mode: 'direct', outbound: 'DIRECT' },
            { clash_mode: 'global', outbound: this.t('outboundNames.Node Select') },
            { action: 'sniff' },
            { protocol: 'dns', action: 'hijack-dns' }
        );
        
        if (this.rejectQuic) {
            this.config.route.rules.unshift({
                protocol: 'udp',
                port: [443],
                action: 'reject'
            });
        }

        this.config.route.auto_detect_interface = true;
        this.config.route.final = this.t('outboundNames.Fall Back');

        if (this.enableClashUI || this.externalController || this.externalUiDownloadUrl) {
            const defaultExternalController = "0.0.0.0:9090";
            const defaultExternalUiDownloadUrl = "https://gh-proxy.com/https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip";
            const defaultExternalUi = "./ui";
            const defaultSecret = "";
            const defaultDownloadDetour = "DIRECT";
            const defaultClashMode = "rule";

            this.config.experimental = this.config.experimental || {};
            const existingClashApi = this.config.experimental.clash_api || {};

            const externalController = this.externalController || existingClashApi.external_controller || defaultExternalController;
            const externalUiDownloadUrl = this.externalUiDownloadUrl || existingClashApi.external_ui_download_url || defaultExternalUiDownloadUrl;
            const externalUi = existingClashApi.external_ui || defaultExternalUi;
            const secret = existingClashApi.secret ?? defaultSecret;
            const externalUiDownloadDetour = existingClashApi.external_ui_download_detour || defaultDownloadDetour;
            const clashMode = existingClashApi.default_mode || defaultClashMode;

            this.config.experimental.clash_api = {
                ...existingClashApi,
                external_controller: externalController,
                external_ui: externalUi,
                external_ui_download_url: externalUiDownloadUrl,
                external_ui_download_detour: externalUiDownloadDetour,
                secret,
                default_mode: clashMode
            };
        }
        return this.config;
    }
}
