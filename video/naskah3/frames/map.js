// Peta kota generik (bukan peta asli): blok, jalan, sungai, taman. Seed tetap agar tiap frame sama.
function drawMap(svg, opt = {}) {
    const W = 1080, H = 1920, NS = 'http://www.w3.org/2000/svg';
  let s = opt.seed || 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const pink = opt.theme === 'pink';
  const block = pink ? '#ffd3e2' : '#e8e2ff';
  const park = '#d3f1e3';
  const road = pink ? '#ffeef4' : '#fbf9ff';
  const river = '#cfe4ff';
  el('rect', { x: 0, y: 0, width: W, height: H, fill: road });
  const cell = 120;
  for (let y = -40; y < H; y += cell) {
    for (let x = -30; x < W; x += cell) {
      const ox = (rnd() - .5) * 14, oy = (rnd() - .5) * 14;
      const w = cell - 22 - rnd() * 16, h = cell - 22 - rnd() * 16;
      el('rect', { x: x + ox, y: y + oy, width: w, height: h, rx: 10, fill: rnd() < .1 ? park : block });
    }
  }
  // jalan utama
  const main = '#ffffff';
  el('path', { d: 'M-20 620 C 300 560, 640 720, 1100 640', stroke: main, 'stroke-width': 34, fill: 'none' });
  el('path', { d: 'M380 -20 C 420 600, 300 1200, 470 1940', stroke: main, 'stroke-width': 30, fill: 'none' });
  el('path', { d: 'M-20 1380 C 360 1300, 760 1460, 1100 1340', stroke: main, 'stroke-width': 28, fill: 'none' });
  // sungai
  el('path', { d: 'M820 -20 C 700 420, 980 760, 760 1120 S 640 1700, 880 1940', stroke: river, 'stroke-width': 54, fill: 'none', 'stroke-linecap': 'round' });
  return { el };
}
