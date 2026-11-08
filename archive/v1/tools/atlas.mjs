// Dump the card atlas to out/atlas.png (node tools/atlas.mjs), via the cards bench.
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await launch(['--enable-webgl']);
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(root, 'dist/jokers_wild.html')).href + '?still=1&bench=cards&w=640&h=360');
await page.waitForFunction('window.__cardAtlas', { timeout: 60000 });
const data = await page.evaluate(() => window.__cardAtlas.toDataURL('image/png'));
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'out/atlas.png'), Buffer.from(data.split(',')[1], 'base64'));
console.log('out/atlas.png');
await browser.close();
