// Tema dari ?t=pop|neon|tropis (default tropis), dipasang sebelum render.
(function () {
  const t = new URLSearchParams(location.search).get('t');
  if (t) document.documentElement.setAttribute('data-t', t);
})();

// Logo comel (anak ayam chibi, sumber: assets/comel-chick.svg) di pojok sejak detik 0
const CHICK = '<svg viewBox="0 0 64 64"> <g stroke="#f08a24" stroke-width="2.6" stroke-linecap="round" fill="none"> <path d="M25 55 l-3.5 4.5 M25 55 v5.5 M25 55 l3.5 4.5"/> <path d="M39 55 l-3.5 4.5 M39 55 v5.5 M39 55 l3.5 4.5"/> </g> <path d="M31 13 C 27 5, 33 2, 32.5 9.5 C 35 3.5, 41 6, 35 12.5 Z" fill="#ffd23f" stroke="#e8a317" stroke-width="1.6" stroke-linejoin="round"/> <ellipse cx="32" cy="35" rx="23.5" ry="22" fill="#ffd23f" stroke="#e8a317" stroke-width="2"/> <ellipse cx="32" cy="44" rx="13" ry="9" fill="#ffe68a"/> <path d="M9.5 37 C 4 36.5, 3.5 44, 9 45.5 C 11.5 46, 13 44, 12.5 42" fill="#ffc21f" stroke="#e8a317" stroke-width="1.6" stroke-linejoin="round"/> <path d="M54.5 37 C 60 36.5, 60.5 44, 55 45.5 C 52.5 46, 51 44, 51.5 42" fill="#ffc21f" stroke="#e8a317" stroke-width="1.6" stroke-linejoin="round"/> <ellipse cx="23" cy="31" rx="4.3" ry="5.2" fill="#2b1d12"/> <ellipse cx="41" cy="31" rx="4.3" ry="5.2" fill="#2b1d12"/> <circle cx="24.6" cy="28.8" r="1.7" fill="#fff"/><circle cx="42.6" cy="28.8" r="1.7" fill="#fff"/> <circle cx="21.8" cy="33.2" r=".9" fill="#fff"/><circle cx="39.8" cy="33.2" r=".9" fill="#fff"/> <ellipse cx="16.5" cy="39" rx="3.8" ry="2.3" fill="#ff8fa3" opacity=".8"/> <ellipse cx="47.5" cy="39" rx="3.8" ry="2.3" fill="#ff8fa3" opacity=".8"/> <path d="M28.6 36.6 Q32 33.6 35.4 36.6 Q32 40.6 28.6 36.6 Z" fill="#ff9f1c" stroke="#e07b0f" stroke-width="1" stroke-linejoin="round"/> </svg>';
document.addEventListener('DOMContentLoaded', () => {
  const l = document.createElement('div'); l.className = 'logo'; l.innerHTML = CHICK + 'comel'; document.body.appendChild(l);
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
