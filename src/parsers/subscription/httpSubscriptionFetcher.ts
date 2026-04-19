import { decodeBase64 } from '../../utils.ts';
import { parseSubscriptionContent } from './subscriptionContentParser.ts';

/**
 * Decode content, trying Base64 first, then URL decoding if needed.
 */
function decodeContent(text: string): string {
    let decodedText: string;
    try {
        decodedText = decodeBase64(text.trim());
    } catch (e) {
        decodedText = text;
        if (decodedText.includes('%')) {
            try {
                decodedText = decodeURIComponent(decodedText);
            } catch (urlError) {
                console.warn('Failed to URL decode the text:', urlError);
            }
        }
    }
    return decodedText;
}

type ContentFormat = 'clash' | 'singbox' | 'unknown';

/**
 * Detect the format of subscription content.
 */
function detectFormat(content: string): ContentFormat {
    const trimmed = content.trim();

    // Try JSON (Sing-Box format)
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.outbounds || parsed.inbounds || parsed.route) {
                return 'singbox';
            }
        } catch {
            // Not valid JSON
        }
    }

    // Try YAML (Clash format) - check for proxies: key
    if (trimmed.includes('proxies:')) {
        return 'clash';
    }

    return 'unknown';
}

/**
 * Fetch subscription content from a URL and parse it.
 */
export async function fetchSubscription(url: string, userAgent?: string): Promise<any | string[] | null> {
    try {
        const headers = new Headers();
        if (userAgent) {
            headers.set('User-Agent', userAgent);
        }
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const decodedText = decodeContent(text);

        return parseSubscriptionContent(decodedText);
    } catch (error) {
        console.error('Error fetching or parsing HTTP(S) content:', error);
        return null;
    }
}

export interface SubscriptionFetchResult {
    content: string;
    format: ContentFormat;
    url: string;
    subscriptionUserinfo?: string;
}

/**
 * Fetch subscription content and detect its format without parsing.
 */
export async function fetchSubscriptionWithFormat(url: string, userAgent?: string): Promise<SubscriptionFetchResult | null> {
    try {
        const headers = new Headers();
        if (userAgent) {
            headers.set('User-Agent', userAgent);
        }
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const content = decodeContent(text);
        const format = detectFormat(content);

        const subscriptionUserinfo = response.headers.get('subscription-userinfo') || undefined;

        return { content, format, url, subscriptionUserinfo };
    } catch (error) {
        console.error('Error fetching subscription:', error);
        return null;
    }
}
