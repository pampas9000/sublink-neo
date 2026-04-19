import { ProxyConfig } from '../../schemas/index.ts';

function defaultGetName(item: any): string {
    return item?.name || item?.tag || '';
}

function defaultSetName(item: any, name: string): any {
    if (item) {
        if ('name' in item) {
            item.name = name;
        } else if ('tag' in item) {
            item.tag = name;
        }
    }
    return item;
}

function defaultIsSame(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

interface DedupOptions {
    getName?: (item: any) => string;
    setName?: (item: any, name: string) => any;
    isSame?: (a: any, b: any) => boolean;
}

/**
 * Add a proxy to a collection with deduplication and name conflict resolution
 */
export function addProxyWithDedup(
    collection: any[],
    proxy: any,
    { getName = defaultGetName, setName = defaultSetName, isSame = defaultIsSame }: DedupOptions = {}
): void {
    if (!proxy) return;
    if (!Array.isArray(collection)) {
        throw new Error('addProxyWithDedup expects the target collection to be an array');
    }

    let candidate = proxy;
    const targetName = getName(candidate) || '';
    const similarProxies = collection.filter(item => {
        const name = getName(item) || '';
        return targetName && name.includes(targetName);
    });

    const hasIdentical = collection.some(item => isSame(item, candidate));
    if (hasIdentical) {
        return;
    }

    if (similarProxies.length > 0 && typeof setName === 'function' && targetName) {
        const updated = setName(candidate, `${targetName} ${similarProxies.length + 1}`);
        if (typeof updated !== 'undefined') {
            candidate = updated;
        }
    }

    collection.push(candidate);
}
