import { expect, test } from "bun:test";
import { ClashConfigBuilder } from "../src/builders/ClashConfigBuilder.ts";

test("Clash: custom rule with rule_provider_url", () => {
    const input = "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNjpwYXNzd29yZEAxMjcuMC4wLjE6ODM4OQ#Test";
    const customRules = [
        {
            name: "MyRemoteRule",
            rule_provider_url: "https://example.com/rules.mrs"
        }
    ];
    
    const builder = new ClashConfigBuilder(
        input,
        {},
        customRules,
        null, // baseConfig
        'en'
    );
    
    const output = builder.formatConfig();
    
    // Check rule-providers
    expect(output).toContain("rule-providers:");
    expect(output).toContain("MyRemoteRule:");
    expect(output).toContain("type: http");
    expect(output).toContain("format: mrs");
    expect(output).toContain("url: https://example.com/rules.mrs");
    
    // Check rules
    expect(output).toContain("RULE-SET,MyRemoteRule,MyRemoteRule");
});
