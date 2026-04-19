/**
 * Config Module Index
 * Central export point for all configuration modules
 */

// Rule URLs
export {
	SITE_RULE_SET_BASE_URL,
	IP_RULE_SET_BASE_URL,
	CLASH_SITE_RULE_SET_BASE_URL,
	CLASH_IP_RULE_SET_BASE_URL,
	SURGE_SITE_RULE_SET_BASEURL,
	SURGE_IP_RULE_SET_BASEURL
} from './ruleUrls.ts';

// Rules
export {
	CUSTOM_RULES,
	UNIFIED_RULES,
	PREDEFINED_RULE_SETS,
	DIRECT_DEFAULT_RULES,
	SITE_RULE_SETS,
	IP_RULE_SETS,
	CLASH_SITE_RULE_SETS,
	CLASH_IP_RULE_SETS
} from './rules.ts';

// Rule Generators
export {
	getOutbounds,
	generateRules,
	generateRuleSets,
	generateClashRuleSets
} from './ruleGenerators.ts';

// Subconverter Config
export { generateSubconverterConfig } from './subconverterConfig.ts';

// Platform Configs
export { SING_BOX_CONFIG, SING_BOX_CONFIG_V1_11 } from './singboxConfig.ts';
export { CLASH_CONFIG } from './clashConfig.ts';
export { SURGE_CONFIG } from './surgeConfig.ts';
