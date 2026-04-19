import http from 'http';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Hono } from 'hono';
import { Logger } from '../runtime/types.ts';

interface ServerOptions {
    port?: number;
    logger?: Logger;
}

export function startNodeHttpServer(app: Hono<any>, { port = 8787, logger = console }: ServerOptions = {}) {
    const server = http.createServer(async (req, res) => {
        try {
            const request = toRequest(req);
            const response = await app.fetch(request);
            await sendResponse(res, response);
        } catch (error: any) {
            logger.error?.('Node server error', error);
            res.statusCode = 500;
            res.end('Internal Server Error');
        }
    });

    server.listen(port, () => {
        logger.info?.(`Sublink worker running on http://0.0.0.0:${port}`);
    });

    return server;
}

function toRequest(req: http.IncomingMessage): Request {
    const protocol = req.headers['x-forwarded-proto'] as string || 'http';
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;
    const method = req.method || 'GET';
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            value.forEach(v => headers.append(key, v));
        } else {
            headers.set(key, value);
        }
    }

    if (method === 'GET' || method === 'HEAD') {
        return new Request(url, { method, headers });
    }

    const body = Readable.toWeb(req as any) as any;
    return new Request(url, {
        method,
        headers,
        body,
        // @ts-ignore
        duplex: 'half'
    });
}

async function sendResponse(res: http.ServerResponse, response: Response) {
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
            const existing = res.getHeader('Set-Cookie');
            const cookies = Array.isArray(existing) ? existing : existing ? [existing as string] : [];
            const nextValues = Array.isArray(value) ? value : [value];
            res.setHeader('Set-Cookie', [...cookies, ...nextValues]);
        } else {
            res.setHeader(key, value);
        }
    });

    if (!response.body) {
        res.end();
        return;
    }

    const readable = Readable.fromWeb(response.body as any);
    try {
        await pipeline(readable, res);
    } catch (error: any) {
        res.destroy(error);
        throw error;
    }
}
