import { Translator } from '../../i18n/index.ts';

/**
 * Emit Clash rules as strings
 */
export function emitClashRules(rules: any[] = [], translator: Translator): string[] {
    if (!translator) {
        throw new Error('emitClashRules requires a translator function');
    }
    const results: string[] = [];

    rules
        .filter(rule => Array.isArray(rule.src_ip_cidr) && rule.src_ip_cidr.length > 0)
        .forEach(rule => {
            (rule.src_ip_cidr as any[]).forEach(cidr => {
                if (!cidr) return;
                results.push(`SRC-IP-CIDR,${cidr},${translator('outboundNames.' + rule.outbound)}`);
            });
        });

    rules
        .filter(rule => Array.isArray(rule.domain_suffix) && rule.domain_suffix.length > 0)
        .forEach(rule => {
            (rule.domain_suffix as any[]).forEach(suffix => {
                results.push(`DOMAIN-SUFFIX,${suffix},${translator('outboundNames.' + rule.outbound)}`);
            });
        });

    rules
        .filter(rule => Array.isArray(rule.domain_keyword) && rule.domain_keyword.length > 0)
        .forEach(rule => {
            (rule.domain_keyword as any[]).forEach(keyword => {
                results.push(`DOMAIN-KEYWORD,${keyword},${translator('outboundNames.' + rule.outbound)}`);
            });
        });

    rules
        .filter(rule => Array.isArray(rule.site_rules) && rule.site_rules[0])
        .forEach(rule => {
            (rule.site_rules as any[]).forEach(site => {
                results.push(`RULE-SET,${site},${translator('outboundNames.' + rule.outbound)}`);
            });
        });

    rules
        .filter(rule => Array.isArray(rule.ip_rules) && rule.ip_rules[0])
        .forEach(rule => {
            (rule.ip_rules as any[]).forEach(ip => {
                results.push(`RULE-SET,${ip}-ip,${translator('outboundNames.' + rule.outbound)},no-resolve`);
            });
        });

    rules
        .filter(rule => Array.isArray(rule.ip_cidr) && rule.ip_cidr.length > 0)
        .forEach(rule => {
            (rule.ip_cidr as any[]).forEach(cidr => {
                results.push(`IP-CIDR,${cidr},${translator('outboundNames.' + rule.outbound)},no-resolve`);
            });
        });

    return results;
}

const normalize = (s: any) => typeof s === 'string' ? s.trim() : s;

/**
 * Sanitize Clash proxy groups by removing non-existent proxies and deduping
 */
export function sanitizeClashProxyGroups(config: any): void {
    const groups = config['proxy-groups'] || [];
    if (!Array.isArray(groups) || groups.length === 0) {
        return;
    }
    const proxies = config.proxies || [];
    const proxyNames = new Set(proxies.map((p: any) => normalize(p?.name)).filter(Boolean));
    const groupNames = new Set(groups.map((g: any) => normalize(g?.name)).filter(Boolean));
    const validNames = new Set(['DIRECT', 'REJECT'].map(normalize));
    proxyNames.forEach(n => validNames.add(n));
    groupNames.forEach(n => validNames.add(n));

    config['proxy-groups'] = groups.map(group => {
        if (!group || !Array.isArray(group.proxies)) return group;
        const normalizedProxies = group.proxies
            .map((x: any) => typeof x === 'string' ? x.trim() : x)
            .filter((x: any) => typeof x === 'string');
        const seen = new Set<string>();
        const deduped = normalizedProxies.filter((value: string) => {
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });

        if (Array.isArray(group.use) && group.use.length > 0) {
            return { ...group, proxies: deduped };
        }

        const filtered = deduped.filter((x: string) => validNames.has(normalize(x)));
        return { ...group, proxies: filtered };
    });
}
