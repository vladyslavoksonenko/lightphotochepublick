// Мінімальний статичний сервер для локального перегляду.
// Використання: node scripts/serve.mjs <папка> [порт]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'src');
const port = Number(process.argv[3] ?? 5173);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
    }
    try {
        if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
        const body = await readFile(file);
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
    }
}).listen(port, () => {
    console.log(`Сервер: http://localhost:${port}  (папка ${path.relative(process.cwd(), root) || '.'})`);
});
