// Продакшн-збірка: src/ -> dist/
//   - CSS: склеює @import, мінімізує, додає префікси під browserslist
//   - JS: бандлить модулі через esbuild і мінімізує
//   - Фото: ресайз до IMAGE.maxWidth, стиснення JPEG/PNG + генерація WebP,
//           видалення EXIF/GPS-метаданих
//   - HTML: підставляє хешовані імена файлів, обгортає <img> у <picture> з WebP, мінімізує
//   - src/public/ копіюється в корінь dist/ як є (favicon, robots.txt, CNAME тощо)
import { readFile, writeFile, mkdir, rm, readdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { bundleAsync, browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import sharp from 'sharp';
import { minify as minifyHtml } from 'html-minifier-terser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const IMAGE = {
    maxWidth: 2000,     // ширші фото зменшуються (пропорції зберігаються)
    jpegQuality: 78,
    webpQuality: 75,
};

const RASTER_EXT = new Set(['.jpg', '.jpeg', '.png']);

const stats = { css: [0, 0], js: [0, 0], html: [0, 0], images: [0, 0], webp: 0 };

const hash = (content) => createHash('sha1').update(content).digest('hex').slice(0, 8);
const toPosix = (p) => p.split(path.sep).join('/');

async function* walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (!entry.name.startsWith('.')) yield full;
    }
}

async function dirSize(dir, filter = () => true) {
    let total = 0;
    for await (const file of walk(dir)) if (filter(file)) total += (await stat(file)).size;
    return total;
}

async function writeOut(relPath, content) {
    const out = path.join(DIST, relPath);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, content);
}

async function buildCss() {
    const entry = path.join(SRC, 'css', 'main.css');
    const { code } = await bundleAsync({
        filename: entry,
        minify: true,
        targets: browserslistToTargets(browserslist('defaults')),
    });
    const rel = `css/main.${hash(code)}.css`;
    await writeOut(rel, code);
    stats.css = [await dirSize(path.join(SRC, 'css')), code.length];
    return rel;
}

async function buildJs() {
    const result = await esbuild.build({
        entryPoints: [path.join(SRC, 'js', 'main.js')],
        bundle: true,
        minify: true,
        format: 'esm',
        target: 'es2018',
        write: false,
        legalComments: 'none',
    });
    const code = result.outputFiles[0].contents;
    const rel = `js/main.${hash(code)}.js`;
    await writeOut(rel, code);
    stats.js = [await dirSize(path.join(SRC, 'js')), code.length];
    return rel;
}

// Повертає множину шляхів (відносно src/), для яких створено .webp-версію
async function buildImages() {
    const withWebp = new Set();
    const tasks = [];

    for await (const file of walk(path.join(SRC, 'images'))) {
        const rel = path.relative(SRC, file);
        const out = path.join(DIST, rel);
        const ext = path.extname(file).toLowerCase();
        const srcSize = (await stat(file)).size;
        stats.images[0] += srcSize;

        tasks.push((async () => {
            await mkdir(path.dirname(out), { recursive: true });

            if (!RASTER_EXT.has(ext)) {
                await copyFile(file, out);
                stats.images[1] += srcSize;
                return;
            }

            // rotate() застосовує EXIF-орієнтацію; метадані sharp за замовчуванням не зберігає
            const base = sharp(file).rotate().resize({ width: IMAGE.maxWidth, withoutEnlargement: true });

            const optimized = ext === '.png'
                ? await base.clone().png({ compressionLevel: 9, effort: 10 }).toBuffer()
                : await base.clone().jpeg({ quality: IMAGE.jpegQuality, mozjpeg: true }).toBuffer();
            const webp = await base.clone().webp({ quality: IMAGE.webpQuality, effort: 6 }).toBuffer();

            // Якщо оригінал уже стиснутий краще — залишаємо його
            let finalSize = srcSize;
            if (optimized.length < srcSize) {
                await writeFile(out, optimized);
                finalSize = optimized.length;
            } else {
                await copyFile(file, out);
            }
            stats.images[1] += finalSize;

            // WebP має сенс лише тоді, коли він менший за звичайну версію
            if (webp.length >= finalSize) return;
            const webpRel = rel.replace(/\.[^.]+$/, '.webp');
            await writeOut(webpRel, webp);
            stats.webp += webp.length;
            withWebp.add(toPosix(rel));
        })());
    }

    await Promise.all(tasks);
    return withWebp;
}

async function copyPublic() {
    const publicDir = path.join(SRC, 'public');
    for await (const file of walk(publicDir)) {
        const out = path.join(DIST, path.relative(publicDir, file));
        await mkdir(path.dirname(out), { recursive: true });
        await copyFile(file, out);
    }
}

// <img src="images/x.jpg" ...> -> <picture><source srcset="images/x.webp" type="image/webp"><img ...></picture>
function addWebpSources(html, withWebp) {
    return html.replace(/(<picture\b[\s\S]*?<\/picture>)|<img\b[^>]*>/gi, (match, picture) => {
        if (picture) return match; // <picture>, написаний вручну, не чіпаємо
        const src = match.match(/\bsrc="([^"]+)"/i)?.[1];
        if (!src || !withWebp.has(src.replace(/^\.?\//, ''))) return match;
        const webp = src.replace(/\.[^.]+$/, '.webp');
        return `<picture><source srcset="${webp}" type="image/webp">${match}</picture>`;
    });
}

async function buildHtml(cssPath, jsPath, withWebp) {
    for (const entry of await readdir(SRC)) {
        if (!entry.endsWith('.html')) continue;
        const source = await readFile(path.join(SRC, entry), 'utf8');

        let html = source
            .replace(/href="css\/main\.css"/g, `href="${cssPath}"`)
            .replace(/src="js\/main\.js"/g, `src="${jsPath}"`);
        html = addWebpSources(html, withWebp);

        html = await minifyHtml(html, {
            collapseWhitespace: true,
            conservativeCollapse: false,
            removeComments: true,
            removeRedundantAttributes: true,
            useShortDoctype: true,
            minifyCSS: true,
            minifyJS: true,
        });

        await writeOut(entry, html);
        stats.html[0] += Buffer.byteLength(source);
        stats.html[1] += Buffer.byteLength(html);
    }
}

function report() {
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`.padStart(11);
    const pct = (a, b) => (a ? `-${Math.round((1 - b / a) * 100)}%` : '').padStart(6);
    console.log('\n            вихідні       dist   економія');
    for (const key of ['html', 'css', 'js', 'images']) {
        const [before, after] = stats[key];
        console.log(`  ${key.padEnd(7)} ${kb(before)} ${kb(after)} ${pct(before, after)}`);
    }
    if (stats.webp) console.log(`  webp            ${kb(stats.webp)} (додаткові WebP-версії)`);
}

const started = Date.now();
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

const [cssPath, jsPath, withWebp] = await Promise.all([buildCss(), buildJs(), buildImages(), copyPublic()]);
await buildHtml(cssPath, jsPath, withWebp);

report();
console.log(`\nГотово за ${((Date.now() - started) / 1000).toFixed(1)} с -> ${path.relative(ROOT, DIST)}/`);
