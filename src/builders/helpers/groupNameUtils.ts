/**
 * Group name normalization utilities
 * Handles various Unicode space characters and whitespace normalization
 */

/**
 * Normalize a group name for consistent comparison.
 */
export function normalizeGroupName(name: string): string {
    if (typeof name !== 'string') return name;
    // Replace all types of whitespace (including Unicode spaces) with regular space, then trim
    return name.replace(/[\s\u00A0\u2000-\u200B\u3000]+/g, ' ').trim();
}

/**
 * Check if two group names are equivalent after normalization.
 */
export function isSameGroupName(a: string, b: string): boolean {
    return normalizeGroupName(a) === normalizeGroupName(b);
}

/**
 * Find a group by name using normalized comparison.
 */
export function findGroupByName<T extends { name: string }>(groups: T[], name: string): T | undefined {
    if (!Array.isArray(groups)) return undefined;
    const normName = normalizeGroupName(name);
    return groups.find(g => g && normalizeGroupName(g.name) === normName);
}

/**
 * Find index of a group by name using normalized comparison.
 */
export function findGroupIndexByName(groups: { name: string }[], name: string): number {
    if (!Array.isArray(groups)) return -1;
    const normName = normalizeGroupName(name);
    return groups.findIndex(g => g && normalizeGroupName(g.name) === normName);
}
