import { Translator } from '../../i18n/index.ts';

const normalize = (value: any) => typeof value === 'string' ? value.trim() : value;

export function uniqueNames(names: any[] = []): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    names.forEach(name => {
        if (typeof name !== 'string') return;
        const normalized = normalize(name);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

export function withDirectReject(options: any[] = []): string[] {
    return uniqueNames([
        ...options,
        'DIRECT',
        'REJECT'
    ]);
}

interface MemberBuilderOptions {
    proxyList?: string[];
    translator: Translator;
    groupByCountry?: boolean;
    manualGroupName?: string;
    countryGroupNames?: string[];
    includeAutoSelect?: boolean;
}

export function buildNodeSelectMembers({
    proxyList = [],
    translator,
    groupByCountry = false,
    manualGroupName,
    countryGroupNames = [],
    includeAutoSelect = true
}: MemberBuilderOptions): string[] {
    if (!translator) {
        throw new Error('buildNodeSelectMembers requires a translator function');
    }
    const autoName = translator('outboundNames.Auto Select');
    const base = groupByCountry
        ? [
            ...(includeAutoSelect ? [autoName] : []),
            ...(manualGroupName ? [manualGroupName] : []),
            ...countryGroupNames
        ]
        : [
            ...(includeAutoSelect ? [autoName] : []),
            ...proxyList
        ];
    return withDirectReject(base);
}

export function buildSelectorMembers({
    proxyList = [],
    translator,
    groupByCountry = false,
    manualGroupName,
    countryGroupNames = [],
    includeAutoSelect = true
}: MemberBuilderOptions): string[] {
    if (!translator) {
        throw new Error('buildSelectorMembers requires a translator function');
    }
    const base = groupByCountry
        ? [
            translator('outboundNames.Node Select'),
            ...(includeAutoSelect ? [translator('outboundNames.Auto Select')] : []),
            ...(manualGroupName ? [manualGroupName] : []),
            ...countryGroupNames
        ]
        : [
            translator('outboundNames.Node Select'),
            ...proxyList
        ];
    return withDirectReject(base);
}
