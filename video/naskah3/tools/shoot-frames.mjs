// Render style frame HTML → PNG 1080×1920.
// Pakai: NODE_PATH=$(npm root -g) node video/naskah3/tools/shoot-frames.mjs [--theme=tropis|pop|neon] [--out=dir] [--safe]
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'frames');
const theme = arg('theme') || 'tropis';
const out = resolve(arg('out') || dir);
const safe = process.argv.includes('--safe');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const f of readdirSync(dir).filter((n) => /^f\d.*\.html$/.test(n)).sort()) {
  await page.goto(`file://${join(dir, f)}?t=${theme}`);
  await page.evaluate(async (s) => { if (s) document.body.classList.add('show-safe'); await document.fonts.ready; }, safe);
  const file = join(out, f.replace('.html', safe ? '.safe.png' : '.png'));
  await page.screenshot({ path: file });
  console.log('ok', file);
}
await browser.close();
