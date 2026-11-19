// Render style frame HTML → PNG 1080×1920. Pakai: node video/naskah3/tools/shoot-frames.mjs [--safe]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'frames');
const safe = process.argv.includes('--safe');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const f of readdirSync(dir).filter((n) => /^f\d.*\.html$/.test(n)).sort()) {
  await page.goto('file://' + join(dir, f));
  await page.evaluate(async (s) => { if (s) document.body.classList.add('show-safe'); await document.fonts.ready; }, safe);
  const out = join(dir, f.replace('.html', safe ? '.safe.png' : '.png'));
  await page.screenshot({ path: out });
  console.log('ok', out);
}
await browser.close();
