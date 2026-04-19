/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import { Layout } from '../components/Layout.tsx';
import { Navbar } from '../components/Navbar.tsx';
import { Form } from '../components/Form.tsx';
import { Footer } from '../components/Footer.tsx';
import { UpdateChecker } from '../components/UpdateChecker.tsx';
import { SingboxConfigBuilder } from '../builders/SingboxConfigBuilder.ts';
import { ClashConfigBuilder } from '../builders/ClashConfigBuilder.ts';
import { SurgeConfigBuilder } from '../builders/SurgeConfigBuilder.ts';
import { createTranslator, resolveLanguage, Translator } from '../i18n/index.ts';
import { encodeBase64, tryDecodeSubscriptionLines } from '../utils.ts';
import { APP_NAME, APP_SUBTITLE } from '../constants.ts';
import { ShortLinkService } from '../services/shortLinkService.ts';
import { ConfigStorageService } from '../services/configStorageService.ts';
import { RuleSetService } from '../services/ruleSetService.ts';
import { UserConfigService } from '../services/userConfigService.ts';
import { ServiceError, MissingDependencyError } from '../services/errors.ts';
import { normalizeRuntime } from '../runtime/runtimeConfig.ts';
import { PREDEFINED_RULE_SETS, SING_BOX_CONFIG, SING_BOX_CONFIG_V1_11, generateSubconverterConfig } from '../config/index.ts';
import { DEFAULT_FETCH_USER_AGENT } from '../parsers/subscription/httpSubscriptionFetcher.ts';
import { HonoRequest } from 'hono';
import { Logger } from '../runtime/types.ts';

const DEFAULT_USER_AGENT = 'curl/7.74.0';

type AppContext = {
    Variables: {
        lang: string;
        t: Translator;
    };
};

export function createApp(bindings: any = {}) {
    const runtime = normalizeRuntime(bindings);
    const services = {
        shortLinks: runtime.kv ? new ShortLinkService(runtime.kv, { shortLinkTtlSeconds: runtime.config.shortLinkTtlSeconds }) : null,
        configStorage: runtime.kv ? new ConfigStorageService(runtime.kv, { configTtlSeconds: runtime.config.configTtlSeconds }) : null,
        ruleSets: runtime.d1 ? new RuleSetService(runtime.d1) : null,
        userConfigs: runtime.d1 ? new UserConfigService(runtime.d1) : null
    };

    const app = new Hono<AppContext>();

    app.use('*', async (c, next) => {
        const acceptLanguage = getRequestHeader(c.req, 'Accept-Language');
        const lang = c.req.query('lang') || acceptLanguage?.split(',')[0] || 'zh-CN';
        c.set('lang', lang);
        c.set('t', createTranslator(lang));
        await next();
    });

    app.get('/', (c) => {
        const t = c.get('t');
        const lang = resolveLanguage(c.get('lang'));
        const subtitle = APP_SUBTITLE[lang as keyof typeof APP_SUBTITLE] || APP_SUBTITLE['zh-CN'];

        return c.html(
            <Layout title={t('pageTitle')}>
                <div class="flex flex-col min-h-screen">
                    <Navbar />
                    <main class="flex-1">
                        <div class="container mx-auto px-4 py-8 pt-24">
                            <div class="max-w-4xl mx-auto">
                                <div class="text-center mb-12 pt-8">
                                    <h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                                        {APP_NAME}
                                    </h1>
                                    <p class="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                                        {subtitle}
                                    </p>
                                </div>
                                <Form t={t} lang={lang} />
                            </div>
                        </div>
                    </main>
                    <Footer />
                    <UpdateChecker />
                </div>
            </Layout>
        );
    });

    app.get('/singbox', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const fetchUa = c.req.query('fetch_ua');
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const rejectQuic = parseBooleanFlag(c.req.query('reject_quic'));
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            const requestedSingboxVersion = c.req.query('singbox_version') || c.req.query('sb_version') || c.req.query('sb_ver');
            const requestUserAgent = getRequestHeader(c.req, 'User-Agent');
            const singboxConfigVersion = resolveSingboxConfigVersion(requestedSingboxVersion, requestUserAgent);

            let baseConfig = singboxConfigVersion === '1.11' ? SING_BOX_CONFIG_V1_11 : SING_BOX_CONFIG;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                const storedConfig = await storage.getConfigById(configId);
                if (storedConfig) {
                    baseConfig = storedConfig;
                }
            }

            const builder = new SingboxConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                singboxConfigVersion as any,
                includeAutoSelect,
                rejectQuic,
                fetchUa as string | undefined
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.json(builder.config);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/clash', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const fetchUa = c.req.query('fetch_ua');
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const rejectQuic = parseBooleanFlag(c.req.query('reject_quic'));
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new ClashConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                includeAutoSelect,
                rejectQuic,
                fetchUa as string | undefined
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            const headers: Record<string, string> = { 'Content-Type': 'text/yaml; charset=utf-8' };
            if (userinfo) {
                headers['subscription-userinfo'] = userinfo;
            }
            return c.text(builder.formatConfig(), 200, headers);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/surge', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const fetchUa = c.req.query('fetch_ua');
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const rejectQuic = parseBooleanFlag(c.req.query('reject_quic'));
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new SurgeConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                includeAutoSelect,
                rejectQuic,
                fetchUa as string | undefined
            );
            builder.setSubscriptionUrl(c.req.url);
            await builder.build();

            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.text(builder.formatConfig());
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/subconverter', (c) => {
        try {
            const rawSelectedRules = c.req.query('selectedRules');
            let selectedRules;

            if (!rawSelectedRules) {
                selectedRules = PREDEFINED_RULE_SETS.balanced;
            } else if (PREDEFINED_RULE_SETS[rawSelectedRules as keyof typeof PREDEFINED_RULE_SETS]) {
                selectedRules = PREDEFINED_RULE_SETS[rawSelectedRules as keyof typeof PREDEFINED_RULE_SETS];
            } else {
                try {
                    const parsed = JSON.parse(rawSelectedRules);
                    if (Array.isArray(parsed)) {
                        selectedRules = parsed;
                    } else {
                        return c.text('Invalid selectedRules: must be a preset name (minimal, balanced, comprehensive) or a JSON array', 400);
                    }
                } catch {
                    return c.text(`Invalid selectedRules: "${rawSelectedRules}" is not a valid preset name or JSON array. Valid presets: minimal, balanced, comprehensive`, 400);
                }
            }

            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const lang = c.get('lang');

            const config = generateSubconverterConfig({
                selectedRules,
                customRules,
                lang,
                includeAutoSelect,
                groupByCountry
            });

            return c.text(config, 200, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/xray', async (c) => {
        const inputString = c.req.query('config');
        if (!inputString) {
            return c.text('Missing config parameter', 400);
        }

        const proxylist = inputString.split('\n');
        const finalProxyList: string[] = [];
        const userAgent = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
        const fetchUa = c.req.query('fetch_ua') || DEFAULT_FETCH_USER_AGENT;
        const headers = { 'User-Agent': fetchUa };

        for (const proxy of proxylist) {
            const trimmedProxy = proxy.trim();
            if (!trimmedProxy) continue;

            if (trimmedProxy.startsWith('http://') || trimmedProxy.startsWith('https://')) {
                try {
                    const response = await fetch(trimmedProxy, { method: 'GET', headers });
                    const text = await response.text();
                    let processed = tryDecodeSubscriptionLines(text, { decodeUriComponent: true });
                    if (!Array.isArray(processed)) processed = [processed];
                    finalProxyList.push(...(processed.filter((item: any) => typeof item === 'string' && item.trim() !== '') as string[]));
                } catch (e) {
                    runtime.logger.warn?.('Failed to fetch the proxy', e);
                }
            } else {
                let processed = tryDecodeSubscriptionLines(trimmedProxy);
                if (!Array.isArray(processed)) processed = [processed];
                finalProxyList.push(...(processed.filter((item: any) => typeof item === 'string' && item.trim() !== '') as string[]));
            }
        }

        const finalString = finalProxyList.join('\n');
        if (!finalString) {
            return c.text('Missing config parameter', 400);
        }

        return c.text(encodeBase64(finalString));
    });

    app.get('/shorten-v2', async (c) => {
        try {
            const url = c.req.query('url');
            if (!url) {
                return c.text('Missing URL parameter', 400);
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                return c.text('Invalid URL parameter', 400);
            }
            const queryString = parsedUrl.search;

            const shortLinks = requireShortLinkService(services.shortLinks);
            const code = await shortLinks.createShortLink(queryString, c.req.query('shortCode'));
            return c.text(code);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    const redirectHandler = (prefix: string) => async (c: any) => {
        try {
            const code = c.req.param('code');
            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(code);
            if (!originalParam) return c.text('Short URL not found', 404);

            const url = new URL(c.req.url);
            return c.redirect(`${url.origin}/${prefix}${originalParam}`);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    };

    app.get('/s/:code', redirectHandler('surge'));
    app.get('/b/:code', redirectHandler('singbox'));
    app.get('/c/:code', redirectHandler('clash'));
    app.get('/x/:code', redirectHandler('xray'));

    app.post('/config', async (c) => {
        try {
            const { type, content } = await c.req.json();
            const storage = requireConfigStorage(services.configStorage);
            const configId = await storage.saveConfig(type, content);
            return c.text(configId);
        } catch (error: any) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/resolve', async (c) => {
        try {
            const shortUrl = c.req.query('url');
            const t = c.get('t');
            if (!shortUrl) return c.text(t('missingUrl'), 400);

            let urlObj;
            try {
                urlObj = new URL(shortUrl);
            } catch {
                return c.text(t('invalidShortUrl'), 400);
            }
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length < 3) return c.text(t('invalidShortUrl'), 400);

            const prefix = pathParts[1];
            const shortCode = pathParts[2];
            if (!['b', 'c', 'x', 's'].includes(prefix!)) return c.text(t('invalidShortUrl'), 400);

            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(shortCode!);
            if (!originalParam) return c.text(t('shortUrlNotFound'), 404);

            const mapping: Record<string, string> = { b: 'singbox', c: 'clash', x: 'xray', s: 'surge' };
            const originalUrl = `${urlObj.origin}/${mapping[prefix!]}${originalParam}`;
            return c.json({ originalUrl });
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    // Rule Set API
    app.get('/api/rules', async (c) => {
        try {
            const ruleSets = requireRuleSetService(services.ruleSets);
            const results = await ruleSets.listRuleSets();
            return c.json(results);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/api/rules/:id', async (c) => {
        try {
            const id = c.req.param('id');
            const ruleSets = requireRuleSetService(services.ruleSets);
            const ruleSet = await ruleSets.getRuleSet(id);
            if (!ruleSet) return c.text('Rule set not found', 404);
            return c.json(ruleSet);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/api/rules', async (c) => {
        try {
            const ruleSet = await c.req.json();
            if (!ruleSet.id || !ruleSet.name || !Array.isArray(ruleSet.rules)) {
                return c.text('Invalid rule set format', 400);
            }
            const ruleSets = requireRuleSetService(services.ruleSets);
            const id = await ruleSets.saveRuleSet(ruleSet);
            return c.json({ id });
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    // User Config Sync API
    app.get('/api/user-config/:token', async (c) => {
        try {
            const token = c.req.param('token');
            if (!services.userConfigs) return c.json(null);
            const data = await services.userConfigs.getConfig(token);
            return c.json(data);
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/api/user-config', async (c) => {
        try {
            const { token, data } = await c.req.json();
            if (!token || !data) {
                return c.text('Missing token or data', 400);
            }
            if (!services.userConfigs) {
                throw new MissingDependencyError('User config storage is unavailable');
            }
            await services.userConfigs.saveConfig(token, data);
            return c.json({ success: true });
        } catch (error: any) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/favicon.ico', async (c) => {
        if (!runtime.assetFetcher) {
            return c.notFound();
        }
        try {
            return await runtime.assetFetcher(c.req.raw);
        } catch (error) {
            runtime.logger.warn?.('Asset fetch failed', error);
            return c.notFound();
        }
    });

    return app;
}

export function parseSelectedRules(raw: string | undefined): string[] {
    if (!raw) return [];

    if (typeof raw === 'string' && PREDEFINED_RULE_SETS[raw as keyof typeof PREDEFINED_RULE_SETS]) {
        return PREDEFINED_RULE_SETS[raw as keyof typeof PREDEFINED_RULE_SETS];
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        console.warn(`Failed to parse selectedRules: ${raw}, falling back to minimal`);
        return PREDEFINED_RULE_SETS.minimal;
    }
}

function parseJsonArray(raw: string | undefined): any[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseBooleanFlag(value: string | boolean | undefined): boolean {
    return value === 'true' || value === true;
}

function parseSemverLike(value: string) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const match = trimmed.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: match[3] ? Number(match[3]) : 0
    };
}

function isSingboxLegacyConfig(version: { major: number; minor: number; patch: number }) {
    if (!version || Number.isNaN(version.major) || Number.isNaN(version.minor)) {
        return false;
    }
    if (version.major !== 1) {
        return version.major < 1;
    }
    return version.minor < 12;
}

function resolveSingboxConfigVersion(requestedVersion: string | undefined, userAgent: string | undefined): string {
    const normalizedRequested = typeof requestedVersion === 'string' ? requestedVersion.trim().toLowerCase() : '';
    if (normalizedRequested && normalizedRequested !== 'auto') {
        if (normalizedRequested === 'legacy') return '1.11';
        if (normalizedRequested === 'latest') return '1.12';
        const parsed = parseSemverLike(normalizedRequested);
        if (parsed) {
            return isSingboxLegacyConfig(parsed) ? '1.11' : '1.12';
        }
    }

    if (typeof userAgent === 'string' && userAgent) {
        const uaMatch = userAgent.match(/sing-box\/(\d+\.\d+(?:\.\d+)?)/i) || userAgent.match(/sing-box\s+(\d+\.\d+(?:\.\d+)?)/i);
        const versionString = uaMatch?.[1];
        const parsed = versionString ? parseSemverLike(versionString) : null;
        if (parsed) {
            return isSingboxLegacyConfig(parsed) ? '1.11' : '1.12';
        }
    }

    return '1.12';
}

function getRequestHeader(request: HonoRequest, name: string): string | undefined {
    if (!request || !name) {
        return undefined;
    }

    try {
        const value = request.header(name);
        if (value !== undefined) {
            return value;
        }
    } catch {
    }

    const headers = request.raw?.headers;
    if (!headers) {
        return undefined;
    }

    if (typeof headers.get === 'function') {
        return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    }

    if (typeof headers === 'object') {
        const lowerName = name.toLowerCase();
        const headerValue = (headers as any)[lowerName] ?? (headers as any)[name];
        if (Array.isArray(headerValue)) {
            return headerValue[0];
        }
        return headerValue as string;
    }

    return undefined;
}

function requireShortLinkService(service: ShortLinkService | null): ShortLinkService {
    if (!service) {
        throw new MissingDependencyError('Short link functionality is unavailable');
    }
    return service;
}

function requireConfigStorage(service: ConfigStorageService | null): ConfigStorageService {
    if (!service) {
        throw new MissingDependencyError('Config storage functionality is unavailable');
    }
    return service;
}

function requireRuleSetService(service: RuleSetService | null): RuleSetService {
    if (!service) {
        throw new MissingDependencyError('Rule set storage is unavailable (D1 not configured)');
    }
    return service;
}

function handleError(c: any, error: any, logger: Logger) {
    if (error instanceof ServiceError) {
        return c.text(error.message, error.status);
    }
    logger.error?.('Unhandled error', error);
    return c.text(`Error: ${error.message}`, 500);
}
