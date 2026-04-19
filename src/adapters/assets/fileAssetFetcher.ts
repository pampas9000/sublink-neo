import { readFile } from 'fs/promises';
import path from 'path';
import { AssetFetcher } from '../../schemas/index.ts';

const MIME_TYPES: Record<string, string> = {
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.txt': 'text/plain'
};

export function createFileAssetFetcher(rootDirectory = 'public'): AssetFetcher {
    const root = path.resolve(rootDirectory);
    return async (request: Request) => {
        const url = new URL(request.url);
        let relativePath = url.pathname === '/' ? '/index.html' : url.pathname;
        relativePath = relativePath.replace(/^\/+/, '');
        const targetPath = path.resolve(root, relativePath);

        if (!targetPath.startsWith(root)) {
            return new Response('Not found', { status: 404 });
        }

        try {
            const fileBuffer = await readFile(targetPath);
            const extension = path.extname(targetPath).toLowerCase();
            const contentType = MIME_TYPES[extension] || 'application/octet-stream';
            return new Response(fileBuffer, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400'
                }
            });
        } catch {
            return new Response('Not found', { status: 404 });
        }
    };
}
