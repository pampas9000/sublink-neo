import { ProxyParser } from '../parsers/index.ts';
import { deepCopy, tryDecodeSubscriptionLines, decodeBase64 } from '../utils.ts';
import { createTranslator, Translator } from '../i18n/index.ts';
import { generateRules, getOutbounds, PREDEFINED_RULE_SETS } from '../config/index.ts';
import { ProxyConfig } from '../schemas/index.ts';

export abstract class BaseConfigBuilder {
    protected inputString: string;
    public config: any;
    protected customRules: any[];
    protected selectedRules: any;
    protected t: Translator;
    protected userAgent?: string;
    protected appliedOverrideKeys: Set<string>;
    protected groupByCountry: boolean;
    protected includeAutoSelect: boolean;
    protected providerUrls: string[];
    protected subscriptionUserinfo?: string;
    protected pendingUserProxyGroups?: any[];

    constructor(
        inputString: string,
        baseConfig: any,
        lang: string | null | undefined,
        userAgent?: string,
        groupByCountry = false,
        includeAutoSelect = true
    ) {
        this.inputString = inputString;
        this.config = deepCopy(baseConfig);
        this.customRules = [];
        this.selectedRules = [];
        this.t = createTranslator(lang);
        this.userAgent = userAgent;
        this.appliedOverrideKeys = new Set();
        this.groupByCountry = groupByCountry;
        this.includeAutoSelect = includeAutoSelect;
        this.providerUrls = [];
        this.subscriptionUserinfo = undefined;
    }

    async build(): Promise<string> {
        const customItems = await this.parseCustomItems();
        this.addCustomItems(customItems);
        this.addSelectors();
        return this.formatConfig();
    }

    async parseCustomItems(): Promise<ProxyConfig[]> {
        const input = this.inputString || '';
        const parsedItems: ProxyConfig[] = [];

        // Import the content parser for direct input parsing
        const { parseSubscriptionContent } = await import('../parsers/subscription/subscriptionContentParser.ts');

        // Try to parse the entire input as a config format (Sing-Box JSON or Clash YAML)
        const directResult = parseSubscriptionContent(input);
        if (directResult && typeof directResult === 'object' && !Array.isArray(directResult)) {
            if (directResult.config) {
                this.applyConfigOverrides(directResult.config);
            }
            if (Array.isArray(directResult.proxies)) {
                for (const proxy of directResult.proxies) {
                    if (proxy && (proxy as any).tag) {
                        parsedItems.push(proxy as ProxyConfig);
                    }
                }
                if (parsedItems.length > 0) return parsedItems;
            }
        }

        // Check for Base64 encoded content
        const isBase64Like = /^[A-Za-z0-9+/=\r\n]+$/.test(input) && input.replace(/[\r\n]/g, '').length % 4 === 0;
        if (isBase64Like) {
            try {
                const sanitized = input.replace(/\s+/g, '');
                const decodedWhole = decodeBase64(sanitized);
                if (typeof decodedWhole === 'string') {
                    const decodedResult = parseSubscriptionContent(decodedWhole);
                    if (decodedResult && typeof decodedResult === 'object' && !Array.isArray(decodedResult)) {
                        if (decodedResult.config) {
                            this.applyConfigOverrides(decodedResult.config);
                        }
                        if (Array.isArray(decodedResult.proxies)) {
                            for (const proxy of decodedResult.proxies) {
                                if (proxy && (proxy as any).tag) {
                                    parsedItems.push(proxy as ProxyConfig);
                                }
                            }
                            if (parsedItems.length > 0) return parsedItems;
                        }
                    }
                }
            } catch (_) { }
        }

        // line-by-line processing
        const urls = input.split('\n').filter(url => url.trim() !== '');
        for (const url of urls) {
            let processedUrls = tryDecodeSubscriptionLines(url);
            if (!Array.isArray(processedUrls)) {
                processedUrls = [processedUrls];
            }

            for (const processedUrl of processedUrls) {
                const trimmedUrl = typeof processedUrl === 'string' ? processedUrl.trim() : '';

                if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
                    const { fetchSubscriptionWithFormat } = await import('../parsers/subscription/httpSubscriptionFetcher.ts');

                    try {
                        const fetchResult = await fetchSubscriptionWithFormat(trimmedUrl, this.userAgent);
                        if (fetchResult) {
                            const { content, format, url: originalUrl, subscriptionUserinfo } = fetchResult;

                            if (subscriptionUserinfo && !this.subscriptionUserinfo) {
                                this.subscriptionUserinfo = subscriptionUserinfo;
                            }

                            if (this.isCompatibleProviderFormat(format)) {
                                this.providerUrls.push(originalUrl);
                                continue;
                            }

                            const result = parseSubscriptionContent(content);
                            if (result && typeof result === 'object' && !Array.isArray(result)) {
                                if (result.config) {
                                    this.applyConfigOverrides(result.config);
                                }
                                if (Array.isArray(result.proxies)) {
                                    result.proxies.forEach(proxy => {
                                        if (proxy && typeof proxy === 'object' && (proxy as any).tag) {
                                            parsedItems.push(proxy as ProxyConfig);
                                        }
                                    });
                                }
                                continue;
                            }
                            if (Array.isArray(result)) {
                                for (const item of result) {
                                    if (item && typeof item === 'object' && (item as any).tag) {
                                        parsedItems.push(item as ProxyConfig);
                                    } else if (typeof item === 'string') {
                                        const subResult = await ProxyParser.parse(item, this.userAgent);
                                        if (subResult) {
                                            if (Array.isArray(subResult)) {
                                                parsedItems.push(...(subResult as ProxyConfig[]));
                                            } else {
                                                parsedItems.push(subResult as ProxyConfig);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error processing HTTP subscription:', error);
                    }
                    continue;
                }

                const result = await ProxyParser.parse(processedUrl, this.userAgent);
                if (result && typeof result === 'object' && !Array.isArray(result) && (result as any).type && (result as any).proxies) {
                     const casted = result as any;
                    if (casted.config) {
                        this.applyConfigOverrides(casted.config);
                    }
                    if (Array.isArray(casted.proxies)) {
                        casted.proxies.forEach((proxy: any) => {
                            if (proxy && typeof proxy === 'object' && proxy.tag) {
                                parsedItems.push(proxy as ProxyConfig);
                            }
                        });
                    }
                    continue;
                }
                if (Array.isArray(result)) {
                    for (const item of result) {
                        if (item && typeof item === 'object' && (item as any).tag) {
                            parsedItems.push(item as ProxyConfig);
                        } else if (typeof item === 'string') {
                            const subResult = await ProxyParser.parse(item, this.userAgent);
                            if (subResult) {
                                if (Array.isArray(subResult)) {
                                    parsedItems.push(...(subResult as ProxyConfig[]));
                                } else {
                                    parsedItems.push(subResult as ProxyConfig);
                                }
                            }
                        }
                    }
                } else if (result) {
                    parsedItems.push(result as ProxyConfig);
                }
            }
        }

        return parsedItems;
    }

    isCompatibleProviderFormat(format: 'clash' | 'singbox' | 'unknown'): boolean {
        return false;
    }

    applyConfigOverrides(overrides: any): void {
        if (!overrides || typeof overrides !== 'object') {
            return;
        }

        const blacklistedKeys = new Set(['proxies', 'rules', 'rule-providers', 'proxy-groups']);

        Object.entries(overrides).forEach(([key, value]) => {
            if (blacklistedKeys.has(key)) {
                return;
            }
            if (value === undefined) {
                delete this.config[key];
                this.appliedOverrideKeys.add(key);
            } else if (key === 'dns' && typeof value === 'object' && !Array.isArray(value)) {
                this.config[key] = this.mergeDnsConfig(this.config[key], value);
                this.appliedOverrideKeys.add(key);
            } else {
                this.config[key] = deepCopy(value);
                this.appliedOverrideKeys.add(key);
            }
        });

        if (Array.isArray(overrides['proxy-groups'])) {
            this.pendingUserProxyGroups = this.pendingUserProxyGroups || [];
            this.pendingUserProxyGroups.push(...overrides['proxy-groups']);
        }
    }

    mergeDnsConfig(existing: any, incoming: any): any {
        if (!existing || typeof existing !== 'object') {
            return deepCopy(incoming);
        }

        const result = deepCopy(existing);
        const mergeableArrayKeys = new Set(['nameserver', 'fallback', 'fake-ip-filter']);

        Object.entries(incoming).forEach(([key, value]) => {
            if (mergeableArrayKeys.has(key) && Array.isArray(value)) {
                if (Array.isArray(result[key])) {
                    result[key] = [...new Set([...result[key], ...value])];
                } else {
                    result[key] = deepCopy(value);
                }
            } else if (key === 'nameserver-policy' && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = { ...(result[key] || {}), ...deepCopy(value) };
            } else {
                result[key] = deepCopy(value);
            }
        });

        return result;
    }

    hasConfigOverride(key: string): boolean {
        return this.appliedOverrideKeys?.has(key);
    }

    getSubscriptionUserinfo(): string | undefined {
        return this.subscriptionUserinfo;
    }

    getOutboundsList(): any {
        let outbounds;
        if (typeof this.selectedRules === 'string' && (PREDEFINED_RULE_SETS as any)[this.selectedRules]) {
            outbounds = getOutbounds((PREDEFINED_RULE_SETS as any)[this.selectedRules]);
        } else if (this.selectedRules && Object.keys(this.selectedRules).length > 0) {
            outbounds = getOutbounds(this.selectedRules);
        } else {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS.minimal);
        }
        return outbounds;
    }

    getProxyList(): string[] {
        return this.getProxies().map(proxy => this.getProxyName(proxy));
    }

    abstract getProxies(): any[];
    abstract getProxyName(proxy: any): string;
    abstract convertProxy(proxy: ProxyConfig): any;
    abstract addProxyToConfig(proxy: any): void;
    abstract addAutoSelectGroup(proxyList: string[]): void;
    abstract addNodeSelectGroup(proxyList: string[]): void;
    abstract addOutboundGroups(outbounds: any, proxyList: string[]): void;
    abstract addCustomRuleGroups(proxyList: string[]): void;
    abstract addFallBackGroup(proxyList: string[]): void;
    abstract addCountryGroups(): void;

    addCustomItems(customItems: ProxyConfig[]): void {
        const validItems = customItems.filter(item => item != null);
        validItems.forEach(item => {
            if (item?.tag) {
                const convertedProxy = this.convertProxy(item);
                if (convertedProxy) {
                    this.addProxyToConfig(convertedProxy);
                }
            }
        });
    }

    addSelectors(): void {
        const outbounds = this.getOutboundsList();
        const proxyList = this.getProxyList();

        this.addAutoSelectGroup(proxyList);
        this.addNodeSelectGroup(proxyList);
        if (this.groupByCountry) {
            this.addCountryGroups();
        }
        this.addOutboundGroups(outbounds, proxyList);
        this.addCustomRuleGroups(proxyList);
        this.addFallBackGroup(proxyList);

        if (this.pendingUserProxyGroups && this.pendingUserProxyGroups.length > 0) {
            this.mergeUserProxyGroups(this.pendingUserProxyGroups);
        }
    }

    mergeUserProxyGroups(userGroups: any[]): void {
        // Default: no-op.
    }

    generateRules(): any[] {
        return generateRules(this.selectedRules, this.customRules);
    }

    abstract formatConfig(): string;
}
