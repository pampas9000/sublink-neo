import * as v from 'valibot';

/**
 * TLS Configuration Schema
 */
export const TlsSchema = v.object({
    enabled: v.boolean(),
    server_name: v.optional(v.string()),
    insecure: v.optional(v.boolean()),
    alpn: v.optional(v.array(v.string())),
    reality: v.optional(v.object({
        enabled: v.boolean(),
        public_key: v.string(),
        short_id: v.string()
    })),
    utls: v.optional(v.object({
        enabled: v.boolean(),
        fingerprint: v.string()
    }))
});

export type TlsConfig = v.InferOutput<typeof TlsSchema>;

/**
 * Transport Configuration Schema
 */
export const TransportSchema = v.union([
    v.object({
        type: v.literal('ws'),
        path: v.string(),
        headers: v.optional(v.record(v.string(), v.string())),
        max_early_data: v.optional(v.number()),
        early_data_header_name: v.optional(v.string())
    }),
    v.object({
        type: v.literal('grpc'),
        service_name: v.string(),
        idle_timeout: v.optional(v.string()),
        ping_timeout: v.optional(v.string()),
        health_check_timeout: v.optional(v.string()),
        permit_without_stream: v.optional(v.boolean())
    }),
    v.object({
        type: v.literal('quic')
    }),
    v.object({
        type: v.literal('http'),
        host: v.optional(v.array(v.string())),
        path: v.optional(v.string()),
        method: v.optional(v.string()),
        headers: v.optional(v.record(v.string(), v.array(v.string())))
    }),
    v.object({
        type: v.literal('h2'),
        host: v.optional(v.array(v.string())),
        path: v.optional(v.string())
    })
]);

export type TransportConfig = v.InferOutput<typeof TransportSchema>;

/**
 * Base Proxy Properties
 */
const BaseProxySchema = v.object({
    tag: v.string(),
    server: v.string(),
    server_port: v.number(),
    tcp_fast_open: v.optional(v.boolean()),
    udp: v.optional(v.boolean()),
    network: v.optional(v.string())
});

/**
 * Protocol Specific Schemas
 */
export const ShadowsocksSchema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('shadowsocks'),
        method: v.string(),
        password: v.string(),
        plugin: v.optional(v.string()),
        plugin_opts: v.optional(v.record(v.string(), v.any()))
    })
]);

export const VmessSchema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('vmess'),
        uuid: v.string(),
        alter_id: v.number(),
        security: v.string(),
        tls: v.optional(TlsSchema),
        transport: v.optional(TransportSchema)
    })
]);

export const VlessSchema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('vless'),
        uuid: v.string(),
        flow: v.optional(v.string()),
        tls: v.optional(TlsSchema),
        transport: v.optional(TransportSchema)
    })
]);

export const TrojanSchema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('trojan'),
        password: v.string(),
        flow: v.optional(v.string()),
        tls: v.optional(TlsSchema),
        transport: v.optional(TransportSchema)
    })
]);

export const Hysteria2Schema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('hysteria2'),
        password: v.optional(v.string()),
        tls: v.optional(TlsSchema),
        obfs: v.optional(v.object({
            type: v.string(),
            password: v.string()
        })),
        up: v.optional(v.union([v.string(), v.number()])),
        down: v.optional(v.union([v.string(), v.number()]))
    })
]);

export const TuicSchema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('tuic'),
        uuid: v.string(),
        password: v.string(),
        congestion_control: v.optional(v.string()),
        udp_relay_mode: v.optional(v.string()),
        tls: v.optional(TlsSchema)
    })
]);

export const AnyTLSSchema = v.intersect([
    BaseProxySchema,
    v.object({
        type: v.literal('anytls'),
        password: v.optional(v.string()),
        tls: v.optional(TlsSchema),
        'idle-session-check-interval': v.optional(v.number()),
        'idle-session-timeout': v.optional(v.number()),
        'min-idle-session': v.optional(v.number())
    })
]);

/**
 * Master Proxy Schema
 */
export const ProxySchema = v.union([
    ShadowsocksSchema,
    VmessSchema,
    VlessSchema,
    TrojanSchema,
    Hysteria2Schema,
    TuicSchema,
    AnyTLSSchema
]);

export type ProxyConfig = v.InferOutput<typeof ProxySchema>;
