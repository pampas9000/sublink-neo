import { createApp } from './app/createApp.tsx';
import { createCloudflareRuntime } from './runtime/cloudflare.ts';
import { Hono } from 'hono';

let honoApp: Hono<any>;

function getApp(env: any) {
    if (!honoApp) {
        const runtime = createCloudflareRuntime(env);
        honoApp = createApp(runtime);
    }
    return honoApp;
}

export default {
    fetch(request: Request, env: any, ctx: any) {
        const app = getApp(env);
        return app.fetch(request, env, ctx);
    }
};
