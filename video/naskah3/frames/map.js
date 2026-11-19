// Tema dari ?t=pop|neon|tropis (default tropis), dipasang sebelum render.
(function () {
  const t = new URLSearchParams(location.search).get('t');
  if (t) document.documentElement.setAttribute('data-t', t);
})();

// Logo kecil comel di pojok (sejak detik 0)
const PANDA = '<svg viewBox="0 0 64 64"><circle cx="16" cy="16" r="10" fill="currentColor"/><circle cx="48" cy="16" r="10" fill="currentColor"/><circle cx="32" cy="36" r="24" fill="#fff" stroke="currentColor" stroke-width="3"/><ellipse cx="23" cy="34" rx="6" ry="8" fill="#141414" transform="rotate(-20 23 34)"/><ellipse cx="41" cy="34" rx="6" ry="8" fill="#141414" transform="rotate(20 41 34)"/><circle cx="32" cy="46" r="3.5" fill="#141414"/></svg>';
document.addEventListener('DOMContentLoaded', () => {
  const l = document.createElement('div'); l.className = 'logo'; l.innerHTML = PANDA + 'comel'; document.body.appendChild(l);
});

// Peta kota generik (bukan peta asli): blok, jalan, sungai, taman. Seed tetap agar tiap frame sama.
function drawMap(svg, opt = {}) {
  const W = 1080, H = 1920, NS = 'http://www.w3.org/2000/svg';
  const pre = opt.prefix || 'map';
  const cs = getComputedStyle(document.documentElement);
  const c = (k) => cs.getPropertyValue(`--${pre}-${k}`).trim();
  let s = opt.seed || 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: c('road') });
  const cell = 120;
  for (let y = -40; y < H; y += cell) {
    for (let x = -30; x < W; x += cell) {
      const ox = (rnd() - .5) * 14, oy = (rnd() - .5) * 14;
      const w = cell - 22 - rnd() * 16, h = cell - 22 - rnd() * 16;
      el('rect', { x: x + ox, y: y + oy, width: w, height: h, rx: 10, fill: rnd() < .1 ? c('park') : c('block') });
    }
  }
  const main = c('main');
  el('path', { d: 'M-20 620 C 300 560, 640 720, 1100 640', stroke: main, 'stroke-width': 34, fill: 'none' });
  el('path', { d: 'M380 -20 C 420 600, 300 1200, 470 1940', stroke: main, 'stroke-width': 30, fill: 'none' });
  el('path', { d: 'M-20 1380 C 360 1300, 760 1460, 1100 1340', stroke: main, 'stroke-width': 28, fill: 'none' });
  el('path', { d: 'M820 -20 C 700 420, 980 760, 760 1120 S 640 1700, 880 1940', stroke: c('river'), 'stroke-width': 54, fill: 'none', 'stroke-linecap': 'round' });
}
