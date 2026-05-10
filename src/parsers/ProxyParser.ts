import { parseShadowsocks } from './protocols/shadowsocksParser.ts';
import { parseVmess } from './protocols/vmessParser.ts';
import { parseVless } from './protocols/vlessParser.ts';
import { parseHysteria2 } from './protocols/hysteria2Parser.ts';
import { parseTrojan } from './protocols/trojanParser.ts';
import { parseTuic } from './protocols/tuicParser.ts';
import { parseAnyTLS } from './protocols/anytlsParser.ts';
import { fetchSubscription } from './subscription/httpSubscriptionFetcher.ts';
import { ProxyConfig } from '../schemas/index.ts';

type ParserFn = (url: string, userAgent?: string) => Promise<any> | any;

const protocolParsers: Record<string, ParserFn> = {
    ss: parseShadowsocks,
    vmess: parseVmess,
    vless: parseVless,
    hysteria: parseHysteria2,
    hysteria2: parseHysteria2,
    hy2: parseHysteria2,
    http: fetchSubscription,
    https: fetchSubscription,
    trojan: parseTrojan,
    tuic: parseTuic,
    anytls: parseAnyTLS
};

export class ProxyParser {
    /**
     * Parse a proxy URL or subscription URL and return the proxy objects or config
     */
    static async parse(url: string, userAgent?: string): Promise<ProxyConfig | ProxyConfig[] | any | undefined> {
        if (!url || typeof url !== 'string') {
            return undefined;
        }
        const trimmed = url.trim();
        const type = trimmed.split('://')[0];
        if (!type) return undefined;
        
        const parser = protocolParsers[type];
        if (!parser) {
            return undefined;
        }
        return parser(trimmed, userAgent);
    }
}
