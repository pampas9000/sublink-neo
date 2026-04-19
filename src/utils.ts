import { TlsConfig, TransportConfig } from './schemas/index.ts';

const PATH_LENGTH = 7;

/**
 * Check if a string starts with a prefix
 */
export function checkStartsWith(str: string | null | undefined, prefix: string | null | undefined): boolean {
    if (str === undefined || str === null || prefix === undefined || prefix === null) {
        return false;
    }
    const s = String(str);
    const p = String(prefix);
    return s.slice(0, p.length) === p;
}

/**
 * Base64 encode a string
 */
export function encodeBase64(input: string): string {
    const encoder = new TextEncoder();
    const utf8Array = encoder.encode(input);
    let binaryString = '';
    for (const byte of utf8Array) {
        binaryString += String.fromCharCode(byte);
    }
    return base64FromBinary(binaryString);
}

/**
 * Base64 decode a string
 */
export function decodeBase64(input: string): string {
    const binaryString = base64ToBinary(input);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
}

/**
 * Convert binary string to Base64
 */
export function base64FromBinary(binaryString: string): string {
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64String = '';
    let padding = '';
    let currentBinary = binaryString;

    const remainder = currentBinary.length % 3;
    if (remainder > 0) {
        padding = '='.repeat(3 - remainder);
        currentBinary += '\0'.repeat(3 - remainder);
    }

    for (let i = 0; i < currentBinary.length; i += 3) {
        const bytes = [
            currentBinary.charCodeAt(i),
            currentBinary.charCodeAt(i + 1),
            currentBinary.charCodeAt(i + 2)
        ];
        const base64Index1 = bytes[0] >> 2;
        const base64Index2 = ((bytes[0] & 3) << 4) | (bytes[1] >> 4);
        const base64Index3 = ((bytes[1] & 15) << 2) | (bytes[2] >> 6);
        const base64Index4 = bytes[2] & 63;

        base64String += base64Chars[base64Index1] +
            base64Chars[base64Index2] +
            base64Chars[base64Index3] +
            base64Chars[base64Index4];
    }

    return base64String.slice(0, base64String.length - padding.length) + padding;
}

/**
 * Convert Base64 string to binary string
 */
export function base64ToBinary(base64String: string): string {
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let binaryString = '';
    let normalizedBase64 = base64String.replace(/=+$/, ''); // Remove padding

    for (let i = 0; i < normalizedBase64.length; i += 4) {
        const bytes = [
            base64Chars.indexOf(normalizedBase64[i]),
            normalizedBase64[i + 1] ? base64Chars.indexOf(normalizedBase64[i + 1]) : -1,
            normalizedBase64[i + 2] ? base64Chars.indexOf(normalizedBase64[i + 2]) : -1,
            normalizedBase64[i + 3] ? base64Chars.indexOf(normalizedBase64[i + 3]) : -1
        ];
        
        const byte1 = (bytes[0] << 2) | (bytes[1] >> 4);
        const byte2 = ((bytes[1] & 15) << 4) | (bytes[2] >> 2);
        const byte3 = ((bytes[2] & 3) << 6) | bytes[3];

        if (bytes[1] !== -1) binaryString += String.fromCharCode(byte1);
        if (bytes[2] !== -1) binaryString += String.fromCharCode(byte2);
        if (bytes[3] !== -1) binaryString += String.fromCharCode(byte3);
    }

    return binaryString;
}

interface DecodeOptions {
    decodeUriComponent?: boolean;
}

/**
 * Try to decode subscription lines (handles plain text, base64, and URL encoding)
 */
export function tryDecodeSubscriptionLines(input: string | any, { decodeUriComponent = false }: DecodeOptions = {}): string | string[] | any {
    if (typeof input !== 'string') {
        return input;
    }

    const trimmed = input.trim();
    if (trimmed === '') {
        return trimmed;
    }

    const splitIfMultiple = (value: string | any): string | string[] | any => {
        if (typeof value !== 'string') {
            return value;
        }

        const normalized = value.replace(/\r\n/g, '\n');
        const segments = normalized
            .split('\n')
            .map(segment => segment.trim())
            .filter(segment => segment !== '');

        if (segments.length > 1 && segments.some(segment => segment.includes('://'))) {
            return segments;
        }

        return normalized.trim();
    };

    const directResult = splitIfMultiple(trimmed);
    if (Array.isArray(directResult)) {
        return directResult;
    }
    if (typeof directResult === 'string' && directResult.includes('://')) {
        return directResult;
    }

    try {
        let decoded = decodeBase64(trimmed);
        if (decodeUriComponent && decoded.includes('%')) {
            const hasProtocolScheme = decoded.includes('://');
            if (!hasProtocolScheme) {
                try {
                    decoded = decodeURIComponent(decoded);
                } catch (_) {
                    // ignore URI decode errors
                }
            }
        }

        const decodedResult = splitIfMultiple(decoded);
        if (Array.isArray(decodedResult)) {
            return decodedResult;
        }
        if (typeof decodedResult === 'string' && decodedResult.includes('://')) {
            return decodedResult;
        }
    } catch (_) {
        // ignore decoding errors
    }

    return trimmed;
}

interface GroupOptions {
    getName?: (proxy: any) => string | undefined;
}

/**
 * Group proxies by country based on their names
 */
export function groupProxiesByCountry(proxies: any[], { getName }: GroupOptions = {}): Record<string, any> {
    const extractor = typeof getName === 'function'
        ? getName
        : (proxy: any) => {
            if (proxy == null) return undefined;
            if (typeof proxy === 'string') {
                return proxy;
            }
            if (typeof proxy === 'object') {
                return proxy.name ?? proxy.tag ?? proxy.id ?? proxy.ps;
            }
            return undefined;
        };

    const normalizeName = (value: string | undefined): string | undefined => {
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > -1) {
            const beforeEq = trimmed.slice(0, eqIndex).trim();
            if (beforeEq) {
                return beforeEq;
            }
        }
        return trimmed;
    };

    const grouped: Record<string, any> = {};
    if (!Array.isArray(proxies) || proxies.length === 0) {
        return grouped;
    }

    proxies.forEach(proxy => {
        const rawName = extractor(proxy);
        const proxyName = normalizeName(rawName);
        if (!proxyName) {
            return;
        }
        const countryInfo = parseCountryFromNodeName(proxyName);
        if (!countryInfo) {
            return;
        }
        const { name } = countryInfo;
        if (!grouped[name]) {
            grouped[name] = { ...countryInfo, proxies: [] as string[] };
        }
        grouped[name].proxies.push(proxyName);
    });

    return grouped;
}

/**
 * Deep copy an object
 */
export function deepCopy<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepCopy(item)) as any;
    }
    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = deepCopy((obj as any)[key]);
        }
    }
    return newObj as T;
}

/**
 * Generate a random web path
 */
export function generateWebPath(length: number = PATH_LENGTH): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Parse host and port from a server string
 */
export function parseServerInfo(serverInfo: string | null | undefined): { host: string | null; port: number | null } {
    if (!serverInfo || typeof serverInfo !== 'string') {
        return { host: null, port: null };
    }
    let host: string, port: string;
    if (serverInfo.startsWith('[')) {
        const closeBracketIndex = serverInfo.indexOf(']');
        host = serverInfo.slice(1, closeBracketIndex);
        port = serverInfo.slice(closeBracketIndex + 2); // +2 to skip ']:'
    } else {
        const lastColonIndex = serverInfo.lastIndexOf(':');
        host = serverInfo.slice(0, lastColonIndex);
        port = serverInfo.slice(lastColonIndex + 1);
    }
    return { host, port: parseInt(port) };
}

/**
 * Parse URL parts and parameters
 */
export function parseUrlParams(url: string): { addressPart: string; params: Record<string, string>; name: string } {
    const parts = url.split('://');
    const rest = parts.length > 1 ? parts[1] : parts[0];
    const [addressPart, ...remainingParts] = rest.split('?');
    const paramsPart = remainingParts.join('?');

    const [paramsOnly, ...fragmentParts] = paramsPart.split('#');
    const searchParams = new URLSearchParams(paramsOnly);
    const params = Object.fromEntries(searchParams.entries());

    let name = fragmentParts.length > 0 ? fragmentParts.join('#') : '';
    try {
        name = decodeURIComponent(name);
    } catch (error) {
        // ignore
    }

    return { addressPart, params, name };
}

/**
 * Create TLS configuration from parameters
 */
export function createTlsConfig(params: Record<string, string>): TlsConfig {
    let tls: TlsConfig = { enabled: false };
    if (params.security && params.security !== 'none') {
        tls = {
            enabled: true,
            server_name: params.sni || params.host,
            insecure: !!params?.allowInsecure || !!params?.insecure || !!params?.allow_insecure,
        };
        if (params.security === 'reality') {
            tls.reality = {
                enabled: true,
                public_key: params.pbk,
                short_id: params.sid,
            };
        }
    }
    return tls;
}

/**
 * Create transport configuration from parameters
 */
export function createTransportConfig(params: Record<string, string>): TransportConfig | undefined {
    const type = params.type as any;
    if (!type) return undefined;
    
    const config: any = { type };
    if (params.path) config.path = params.path;
    if (params.host) config.headers = { 'host': params.host };
    
    if (type === 'grpc' && params.serviceName) {
        config.service_name = params.serviceName;
    }
    
    return config as TransportConfig;
}

/**
 * Parse boolean value safely
 */
export function parseBool(value: any, fallback: any = undefined): any {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    const lowered = String(value).toLowerCase();
    if (lowered === 'true' || lowered === '1') return true;
    if (lowered === 'false' || lowered === '0') return false;
    return fallback;
}

/**
 * Parse numeric value safely
 */
export function parseMaybeNumber(value: any): number | undefined {
    if (value === undefined || value === null) return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
}

/**
 * Parse comma-separated string to array
 */
export function parseArray(value: any): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return String(value)
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);
}

interface CountryInfo {
    name: string;
    emoji: string;
    aliases: string[];
}

export const COUNTRY_DATA: Record<string, CountryInfo> = {
    'HK': { name: 'Hong Kong', emoji: '🇭🇰', aliases: ['香港', 'Hong Kong', 'HK'] },
    'TW': { name: 'Taiwan', emoji: '🇹🇼', aliases: ['台湾', 'Taiwan', 'TW'] },
    'JP': { name: 'Japan', emoji: '🇯🇵', aliases: ['日本', 'Japan', 'JP'] },
    'KR': { name: 'Korea', emoji: '🇰🇷', aliases: ['韩国', 'Korea', 'KR'] },
    'SG': { name: 'Singapore', emoji: '🇸🇬', aliases: ['新加坡', 'Singapore', 'SG'] },
    'US': { name: 'United States', emoji: '🇺🇸', aliases: ['美国', 'United States', 'US'] },
    'GB': { name: 'United Kingdom', emoji: '🇬🇧', aliases: ['英国', 'United Kingdom', 'UK', 'GB'] },
    'DE': { name: 'Germany', emoji: '🇩🇪', aliases: ['德国', 'Germany'] },
    'FR': { name: 'France', emoji: '🇫🇷', aliases: ['法国', 'France'] },
    'RU': { name: 'Russia', emoji: '🇷🇺', aliases: ['俄罗斯', 'Russia'] },
    'CA': { name: 'Canada', emoji: '🇨🇦', aliases: ['加拿大', 'Canada'] },
    'AU': { name: 'Australia', emoji: '🇦🇺', aliases: ['澳大利亚', 'Australia'] },
    'IN': { name: 'India', emoji: '🇮🇳', aliases: ['印度', 'India'] },
    'BR': { name: 'Brazil', emoji: '🇧🇷', aliases: ['巴西', 'Brazil'] },
    'ZA': { name: 'South Africa', emoji: '🇿🇦', aliases: ['南非', 'South Africa'] },
    'AR': { name: 'Argentina', emoji: '🇦🇷', aliases: ['阿根廷', 'Argentina'] },
    'TR': { name: 'Turkey', emoji: '🇹🇷', aliases: ['土耳其', 'Turkey'] },
    'NL': { name: 'Netherlands', emoji: '🇳🇱', aliases: ['荷兰', 'Netherlands'] },
    'CH': { name: 'Switzerland', emoji: '🇨🇭', aliases: ['瑞士', 'Switzerland'] },
    'SE': { name: 'Sweden', emoji: '🇸🇪', aliases: ['瑞典', 'Sweden'] },
    'IT': { name: 'Italy', emoji: '🇮🇹', aliases: ['意大利', 'Italy'] },
    'ES': { name: 'Spain', emoji: '🇪🇸', aliases: ['西班牙', 'Spain'] },
    'IE': { name: 'Ireland', emoji: '🇮🇪', aliases: ['爱尔兰', 'Ireland'] },
    'MY': { name: 'Malaysia', emoji: '🇲🇾', aliases: ['马来西亚', 'Malaysia'] },
    'TH': { name: 'Thailand', emoji: '🇹🇭', aliases: ['泰国', 'Thailand'] },
    'VN': { name: 'Vietnam', emoji: '🇻🇳', aliases: ['越南', 'Vietnam'] },
    'PH': { name: 'Philippines', emoji: '🇵🇭', aliases: ['菲律宾', 'Philippines'] },
    'ID': { name: 'Indonesia', emoji: '🇮🇩', aliases: ['印度尼西亚', 'Indonesia'] },
    'NZ': { name: 'New Zealand', emoji: '🇳🇿', aliases: ['新西兰', 'New Zealand'] },
    'AE': { name: 'United Arab Emirates', emoji: '🇦🇪', aliases: ['阿联酋', 'United Arab Emirates'] },
};

/**
 * Parse country information from node name
 */
export function parseCountryFromNodeName(nodeName: string): (CountryInfo & { code: string }) | null {
    const allEntries = Object.entries(COUNTRY_DATA).flatMap(([code, c]) =>
        c.aliases.map(alias => ({ code, alias, escaped: alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') }))
    );
    allEntries.sort((a, b) => b.alias.length - a.alias.length);

    const patterns = allEntries.map(({ alias, escaped }) => {
        if (alias.length <= 3 && /^[A-Za-z]+$/.test(alias)) {
            return `\\b${escaped}\\b`;
        }
        return escaped;
    });

    const regex = new RegExp(patterns.join('|'), 'i');
    const match = nodeName.match(regex);

    if (match) {
        const matchedAlias = match[0];
        for (const code in COUNTRY_DATA) {
            if (COUNTRY_DATA[code].aliases.some(alias => alias.toLowerCase() === matchedAlias.toLowerCase())) {
                return { code, ...COUNTRY_DATA[code] };
            }
        }
    }

    return null;
}
