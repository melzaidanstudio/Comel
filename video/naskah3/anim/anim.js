// Animasi Naskah 3 (90 dtk, 1080×1920). Deterministik: window.renderAt(t) menggambar frame pada detik t.
// Waktu adegan berasal dari window.TIMELINE.anchors (S01..S17, detik) + end; render.mjs mengisinya dari stempel waktu VO.

const DEFAULT_TIMELINE = {
  anchors: { S01: 0, S02: 2.5, S03: 5, S04: 8, S05: 17, S06: 23, S07: 28, S08: 34, S09: 40, S10: 47, S11: 51, S12: 55, S13: 60, S14: 67, S15: 73, S16: 77, S17: 80 },
  end: 90,
};
window.TIMELINE = window.TIMELINE || DEFAULT_TIMELINE;

// ---------- util ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x) => { const c1 = 1.70158, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  in: (x) => x * x * x,
};
const lerp = (a, b, x) => a + (b - a) * x;
const bump = (x) => Math.sin(Math.PI * clamp(x)); // 0→1→0
function h(tag, cls, parent, html, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (style) e.setAttribute('style', style);
  if (parent) parent.appendChild(e);
  return e;
}
const css = (el, o) => { for (const k in o) el.style[k] = o[k]; };
const tf = (el, x = 0, y = 0, s = 1, r = 0) => { el.style.transform = `translate(${x}px,${y}px) scale(${s}) rotate(${r}deg)`; };
const show = (el, o) => { el.style.opacity = o; el.style.visibility = o <= 0.001 ? 'hidden' : 'visible'; };

const ICON = {
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="shackle" d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
};
const PANDA_BIG = '<svg viewBox="0 0 64 64"><circle cx="16" cy="16" r="10" fill="currentColor"/><circle cx="48" cy="16" r="10" fill="currentColor"/><circle cx="32" cy="36" r="24" fill="#fff" stroke="currentColor" stroke-width="3"/><ellipse cx="23" cy="34" rx="6" ry="8" fill="#141414" transform="rotate(-20 23 34)"/><ellipse cx="41" cy="34" rx="6" ry="8" fill="#141414" transform="rotate(20 41 34)"/><circle cx="32" cy="46" r="3.5" fill="#141414"/></svg>';

// Teks layar: spans [{cls, text}], muncul bertahap, keluar cepat
function makeCap(parent, spans) {
  const c = h('div', 'cap', parent);
  c._spans = spans.map((s) => h('span', s.cls || '', c, s.text));
  return c;
}
function capAt(c, lt, tin, tout) {
  if (lt < tin || lt > tout) { show(c, 0); return; }
  show(c, 1);
  const outP = tout === Infinity ? 0 : P(lt, tout - 0.18, tout);
  c._spans.forEach((s, i) => {
    const p = E.back(P(lt, tin + i * 0.12, tin + i * 0.12 + 0.35));
    s.style.opacity = clamp(p * 1.4) * (1 - outP);
    s.style.transform = `translateY(${(1 - p) * 30}px) scale(${0.92 + 0.08 * p})`;
  });
}
function avatar(parent, hue, extra = '') {
  return h('div', 'av', parent, null, `background: conic-gradient(from ${hue}deg, var(--rival), var(--card-line), var(--reply), var(--you), var(--rival)); ${extra}`);
}
function postCard(parent, style) {
  const c = h('div', 'post', parent, null, style);
  const who = h('div', 'who', c);
  c._av = avatar(who, 40);
  const col = h('div', 'col', who, null, 'display:flex;flex-direction:column;gap:14px');
  h('div', 'bar', col, null, 'width:260px');
  h('div', 'bar', col, null, 'width:160px;height:20px');
  const lines = h('div', 'lines', c);
  ['100%', '88%', '54%'].forEach((w) => h('div', 'bar', lines, null, `width:${w}`));
  const m = h('div', 'metrics', c);
  c._like = h('div', 'm', m, ICON.heart + '<b>14</b>');
  c._rep = h('div', 'm hot', m, ICON.reply + '<b>0</b>');
  return c;
}
function clockSvg(parent, style) {
  const s = h('div', 'abs', parent, `<svg viewBox="0 0 100 100" width="150" height="150">
    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="10"/>
    <circle class="arc" cx="50" cy="50" r="44" fill="none" stroke="var(--label-bg)" stroke-width="10" stroke-dasharray="276.5" stroke-dashoffset="276.5" transform="rotate(-90 50 50)" stroke-linecap="round"/>
    <line class="hand" x1="50" y1="50" x2="50" y2="16" stroke="var(--story-fg)" stroke-width="6" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="5" fill="var(--story-fg)"/></svg>`, style);
  s._arc = s.querySelector('.arc'); s._hand = s.querySelector('.hand');
  s.set = (f) => { s._arc.setAttribute('stroke-dashoffset', 276.5 * (1 - f)); s._hand.setAttribute('transform', `rotate(${f * 360} 50 50)`); };
  return s;
}

// ---------- adegan ----------
// Tiap layer: from/to = anchor; A(id) = waktu anchor relatif ke awal layer; d = durasi layer.
const LAYERS = [];
const layer = (from, to, bg, build, update) => LAYERS.push({ from, to, bg, build, update });

// L1 Hook: S01–S02
layer('S01', 'S03', 's-hook', (el) => {
  const o = {};
  o.mapw = h('div', 'abs', el, '<svg class="map" width="1080" height="1920"></svg>', 'inset:0;transform-origin:50% 55%');
  drawMap(o.mapw.querySelector('svg'));
  o.trail = h('div', 'abs', el, `<svg width="1080" height="1920" viewBox="0 0 1080 1920" style="position:absolute;inset:0">
    <path class="ty" d="M225 1250 C 260 1130, 340 1090, 420 1080" style="stroke:var(--you);stroke-width:14;stroke-dasharray:2 26;stroke-linecap:round;fill:none"/>
    <path class="tr" d="M835 1300 C 820 1190, 740 1120, 660 1100" style="stroke:var(--rival);stroke-width:14;stroke-dasharray:2 26;stroke-linecap:round;fill:none"/></svg>`, 'inset:0');
  o.q = h('div', 'abs', el, '<b style="display:block;font-family:var(--display);font-weight:800;font-size:120px;line-height:.8">?</b><div class="bar" style="margin-top:22px;height:22px"></div><div class="bar" style="margin-top:14px;height:22px;width:70%"></div>',
    'left:330px;top:900px;width:420px;padding:34px 38px 40px;background:var(--card);color:var(--ink);border-radius:40px 40px 40px 8px;box-shadow:0 24px 60px rgba(0,0,0,.2);transform-origin:20% 100%');
  o.ring = h('div', 'abs', el, null, 'left:304px;top:874px;width:472px;border:6px solid var(--you);border-radius:60px 60px 60px 24px');
  const runner = (cls, bg, lblBg, lblFg, txt) => {
    const r = h('div', 'abs', el, `<div style="width:150px;height:150px;border-radius:50%;display:grid;place-items:center;border:8px solid var(--card);box-shadow:0 16px 40px rgba(0,0,0,.22);background:${bg}"><div style="width:78px;height:78px">${ICON.store}</div></div><label style="font-family:var(--mono);font-weight:800;font-size:34px;letter-spacing:.1em;padding:6px 14px;border-radius:4px;background:${lblBg};color:${lblFg}">${txt}</label>`,
      'display:flex;flex-direction:column;align-items:center;gap:12px');
    return r;
  };
  o.you = runner('you', 'var(--you)', 'var(--cap-bg)', 'var(--cap-fg)', 'KAMU');
  o.riv = runner('riv', 'var(--rival)', 'var(--card)', 'var(--ink)', 'SAINGAN');
  o.c1 = makeCap(el, [{ text: 'MAKAN ENAK DI MANA?' }]);
  o.c2 = makeCap(el, [{ cls: 'sm ghost', text: 'MAKAN ENAK DI MANA?' }, { text: 'KAMU ATAU SAINGANMU?' }]);
  return o;
}, (o, lt, d, A) => {
  const a2 = A('S02');
  o.mapw.style.transform = `scale(${1.12 - 0.12 * E.out(P(lt, 0, 4))})`;
  const qp = E.back(P(lt, 0.35, 0.8));
  o.q.style.transform = `scale(${qp})`; show(o.q, clamp(qp * 2));
  const rp = P(lt, 0.8, 1.2);
  show(o.ring, rp * (0.45 + 0.25 * Math.sin(lt * 5)));
  capAt(o.c1, lt, 0.5, a2);
  capAt(o.c2, lt, a2, Infinity);
  // pelari: masuk dari bawah, lalu berlomba ke gelembung (KAMU sedikit lebih cepat)
  const ent = E.out(P(lt, a2, a2 + 0.5));
  const run = E.inOut(P(lt, a2 + 0.3, d + 0.4));
  const yp = { x: lerp(150, 300, run), y: lerp(1250, 1110, run) };
  const rv = { x: lerp(760, 650, run * 0.8), y: lerp(1300, 1150, run * 0.8) };
  tf(o.you, yp.x, yp.y + (1 - ent) * 500); tf(o.riv, rv.x, rv.y + (1 - ent) * 500);
  o.you.style.left = o.riv.style.left = '0px'; o.you.style.top = o.riv.style.top = '0px';
  show(o.trail, ent); show(o.you, lt >= a2 ? 1 : 0); show(o.riv, lt >= a2 ? 1 : 0);
  o.trail.querySelectorAll('path').forEach((p) => p.style.strokeDashoffset = -lt * 60);
});

// L2 Story: S03–S04
layer('S03', 'S05', 's-story', (el) => {
  const o = {};
  o.glow = h('div', 'abs', el, null, 'left:90px;top:730px;width:900px;height:900px;background:radial-gradient(closest-side, rgba(255,255,255,.22), transparent)');
  o.card = postCard(el, 'left:72px;right:120px;top:790px;transform-origin:50% 50%');
  o.clock = clockSvg(el, 'right:150px;top:720px;z-index:2');
  o.plus = [0, 1, 2].map(() => h('div', 'plus', el, '+1'));
  o.tag = makeCap(el, [{ cls: 'sm', text: 'CONTOH NYATA:' }]);
  o.cap = makeCap(el, [{ cls: 'sm', text: 'CONTOH NYATA:' }, { text: '14 LIKE · 28 BALASAN' }]);
  return o;
}, (o, lt, d, A) => {
  const a4 = A('S04');
  const cp = E.back(P(lt, 0, 0.6));
  o.card.style.transform = `scale(${0.6 + 0.4 * cp})`; show(o.card, clamp(cp * 1.5));
  show(o.clock, P(lt, 0.4, 0.8));
  capAt(o.tag, lt, 0.3, a4);
  capAt(o.cap, lt, a4, Infinity);
  const c0 = a4 + 0.4, c1 = a4 + (d - a4) * 0.6;
  const f = E.inOut(P(lt, c0, c1));
  o.card._rep.querySelector('b').textContent = Math.round(28 * f);
  o.clock.set(0.96 * f);
  const pulse = bump(P(lt, d - (d - a4) * 0.28, d - (d - a4) * 0.28 + 0.5));
  o.card._rep.style.transform = `scale(${1 + 0.18 * pulse})`;
  const counting = lt > c0 && lt < c1 + 0.3;
  o.plus.forEach((p, i) => {
    const k = ((lt * 1.4 + i / 3) % 1);
    css(p, { left: `${700 + i * 80}px`, top: `${1340 - k * 160 - i * 30}px` });
    show(p, counting ? (1 - k) : 0);
  });
});

// L3 Story kartu 2: S05
layer('S05', 'S06', 's-story', (el) => {
  const o = {};
  o.ghost = postCard(el, 'left:72px;right:120px;top:790px;transform-origin:0 50%');
  o.ghost._rep.querySelector('b').textContent = '28';
  o.card = postCard(el, 'left:72px;right:120px;top:790px');
  o.card._like.style.visibility = 'hidden';
  o.clock = clockSvg(el, 'right:150px;top:720px;z-index:2');
  o.cap = makeCap(el, [{ cls: 'sm', text: 'CONTOH NYATA:' }, { text: '23 BALASAN / 5 JAM' }]);
  return o;
}, (o, lt, d) => {
  const g = E.inOut(P(lt, 0, 0.6));
  o.ghost.style.transform = `translate(${-g * 120}px, ${g * 560}px) scale(${1 - g * 0.5})`;
  show(o.ghost, 1 - g * 0.55);
  const c = E.out(P(lt, 0.15, 0.7));
  o.card.style.transform = `translateX(${(1 - c) * 900}px)`;
  capAt(o.cap, lt, 0.3, Infinity);
  const f = E.inOut(P(lt, 0.7, d * 0.7));
  o.card._rep.querySelector('b').textContent = Math.round(23 * f);
  o.clock.set((5 / 24) * f);
  o.card._rep.style.transform = `scale(${1 + 0.15 * bump(P(lt, d * 0.7, d * 0.7 + 0.5))})`;
});

// L4 Penanya cari jawaban: S06
layer('S06', 'S07', 's-story', (el) => {
  const o = {};
  o.q = h('div', 'post', el, null, 'left:72px;right:120px;top:520px;padding:30px 36px');
  const who = h('div', 'who', o.q); avatar(who, 40);
  const col = h('div', '', who, null, 'display:flex;flex-direction:column;gap:14px'); h('div', 'bar', col, null, 'width:260px'); h('div', 'bar', col, null, 'width:420px;height:20px');
  o.eye = h('div', 'abs', el, ICON.eye, 'left:118px;top:470px;width:70px;height:70px;color:var(--label-bg)');
  o.rows = [0, 1, 2, 3].map((i) => {
    const r = h('div', 'row' + (i === 2 ? ' me' : ''), el);
    avatar(r, 90 * i + 20);
    const b = h('div', 'bars', r); h('div', 'bar', b); h('div', 'bar', b);
    return r;
  });
  return o;
}, (o, lt, d) => {
  show(o.q, 1);
  const order = [0, 1, 2, 3];
  const rise = E.inOut(P(lt, 1.0, 1.9));
  o.rows.forEach((r, i) => {
    const appear = E.out(P(lt, 0.1 + i * 0.12, 0.5 + i * 0.12));
    let slot = order[i];
    if (i === 2) slot = lerp(2, 0, rise); else if (i < 2) slot = i + rise;
    r.style.top = `${800 + slot * 160}px`;
    r.style.transform = `translateY(${(1 - appear) * 80}px) scale(${i === 2 ? 1 + 0.04 * rise : 1})`;
    show(r, i === 2 ? appear : appear * (1 - 0.35 * rise));
    if (i === 2) r.style.boxShadow = `0 0 ${40 + 30 * Math.sin(lt * 4)}px ${10 * rise}px color-mix(in srgb, var(--you) ${Math.round(55 * rise)}%, transparent)`;
  });
  const ep = E.back(P(lt, d * 0.55, d * 0.55 + 0.4));
  o.eye.style.transform = `scale(${ep})`; show(o.eye, clamp(ep));
});

// L5 Pain: S07
layer('S07', 'S08', '', (el) => {
  el.style.background = 'var(--pain-bg)'; el.style.color = 'var(--ink)';
  const o = {};
  h('div', 'shape', el, null, 'left:60px;top:1230px;width:960px;height:60px;border-radius:18px;background:#c9b48c');
  h('div', 'shape', el, null, 'left:90px;top:1290px;width:900px;height:330px;border-radius:0 0 28px 28px;background:#0fa3a3;opacity:.55');
  h('div', 'shape', el, null, 'left:110px;top:1110px;width:170px;height:120px;border-radius:16px;background:var(--ink)');
  h('div', 'shape', el, null, 'left:130px;top:1130px;width:130px;height:40px;border-radius:8px;background:#7fd6c9');
  // pemilik usaha (kiri) & pelanggan (kanan)
  h('div', 'shape', el, null, 'left:300px;top:820px;width:150px;height:150px;border-radius:50%;background:var(--ink)');
  h('div', 'shape', el, null, 'left:250px;top:990px;width:250px;height:250px;border-radius:110px 110px 20px 20px;background:var(--reply)');
  o.arm = h('div', 'shape', el, null, 'left:440px;top:1050px;width:200px;height:56px;border-radius:28px;background:var(--reply);transform-origin:0 50%');
  o.bag = h('div', 'shape', el, null, 'left:610px;top:990px;width:110px;height:130px;border-radius:14px;background:var(--label-bg)');
  h('div', 'shape', el, null, 'left:760px;top:840px;width:140px;height:140px;border-radius:50%;background:#7a8f8e');
  h('div', 'shape', el, null, 'left:720px;top:1000px;width:230px;height:240px;border-radius:110px 110px 20px 20px;background:var(--rival)');
  // ponsel tertelungkup
  o.phone = h('div', 'shape', el, null, 'left:470px;top:1180px;width:190px;height:50px;border-radius:14px;background:#2a3b3c');
  o.buzz = h('div', 'abs', el, '<svg width="260" height="90" viewBox="0 0 260 90"><path d="M20 20 l-14 -14 M20 70 l-14 14 M240 20 l14 -14 M240 70 l14 14" stroke="var(--alarm)" stroke-width="6" stroke-linecap="round"/></svg>', 'left:435px;top:1160px');
  o.notes = [0, 1, 2, 3, 4].map(() => h('div', 'shape', el, null, 'left:470px;width:240px;height:46px;border-radius:23px;background:var(--card);box-shadow:0 6px 14px rgba(0,0,0,.12)'));
  // jam dinding
  o.clock = h('div', 'abs', el, `<svg width="200" height="200" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="var(--card)" stroke="var(--ink)" stroke-width="5"/>
    ${[...Array(12)].map((_, i) => `<line x1="50" y1="8" x2="50" y2="15" stroke="var(--ink)" stroke-width="3" transform="rotate(${i * 30} 50 50)"/>`).join('')}
    <line class="hh" x1="50" y1="50" x2="50" y2="28" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>
    <line class="mh" x1="50" y1="50" x2="50" y2="16" stroke="var(--alarm)" stroke-width="4" stroke-linecap="round"/></svg>`, 'left:780px;top:600px');
  o.cap = makeCap(el, [{ text: 'TIAP 15 MENIT' }]);
  return o;
}, (o, lt, d) => {
  capAt(o.cap, lt, 0.3, Infinity);
  const cyc = 1.25; // satu “15 menit” per 1,25 dtk
  const k = (lt % cyc) / cyc;
  o.clock.querySelector('.mh').setAttribute('transform', `rotate(${(lt / cyc) * 90} 50 50)`);
  o.clock.querySelector('.hh').setAttribute('transform', `rotate(${(lt / cyc) * 7.5 + 300} 50 50)`);
  const vib = k < 0.25 ? Math.sin(lt * 90) * 6 : 0;
  o.phone.style.transform = `translateX(${vib}px)`;
  show(o.buzz, k < 0.25 ? 1 : 0);
  const n = Math.floor(lt / cyc);
  o.notes.forEach((e, i) => {
    const idx = n - i; // tumpukan notifikasi, yang lama naik dan pudar
    if (idx < 0) { show(e, 0); return; }
    const age = (lt - idx * cyc);
    e.style.top = `${1110 - i * 60 - Math.min(age, 0.3) * 0}px`;
    show(e, i === 0 ? E.out(P(age, 0, 0.25)) : 0.9 - i * 0.18);
  });
  o.arm.style.transform = `rotate(${-6 + 6 * Math.sin(lt * 2)}deg)`;
  o.bag.style.transform = `translateY(${3 * Math.sin(lt * 2)}px)`;
});

// L6 Comel + kata kunci: S08
layer('S08', 'S09', 's-gain', (el) => {
  const o = {};
  o.phone = h('div', 'phone', el);
  o.screen = h('div', 'screen', o.phone);
  o.panda = h('div', 'bigpanda', o.screen, PANDA_BIG);
  o.field = h('div', 'field', o.screen, ICON.search + '<span class="t"></span><i class="caret"></i>');
  o.back = h('div', 'back', o.phone);
  return o;
}, (o, lt, d) => {
  const flip = E.inOut(P(lt, 0, 0.7));
  const sx = Math.abs(Math.cos(flip * Math.PI));
  o.phone.style.transform = `scaleX(${Math.max(0.02, sx)}) translateY(${(1 - E.out(P(lt, 0, 0.4))) * 200}px)`;
  show(o.back, flip < 0.5 ? 1 : 0);
  const pp = E.back(P(lt, 0.7, 1.1));
  o.panda.style.transform = `scale(${pp})`;
  show(o.field, E.out(P(lt, 1.1, 1.4)));
  const word = 'Bogor';
  const tStart = d * 0.5;
  const nChars = Math.floor(clamp((lt - tStart) / 0.12, 0, word.length));
  o.field.querySelector('.t').textContent = word.slice(0, nChars);
  o.field.querySelector('.caret').style.opacity = Math.floor(lt * 2.4) % 2 ? 0 : 1;
});

// L7 Corong: S09–S11 (syarat, kata yang dihindari, komentar)
layer('S09', 'S12', 's-gain', (el) => {
  const o = {};
  o.funnel = h('div', 'abs', el, `<svg width="1080" height="520" viewBox="0 0 1080 520"><path class="body" d="M150 70 H930 L630 360 V470 H450 V360 Z" fill="var(--card)" stroke="var(--gain-fg)" stroke-width="8" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path class="rim" d="M200 100 H880" stroke="var(--reply)" stroke-width="6" stroke-dasharray="18 14"/></svg>`, 'left:0;top:820px');
  o.body = o.funnel.querySelector('.body');
  o.kw = h('div', 'chip', el, 'Bogor', 'left:72px;top:700px');
  o.x = h('div', 'chip x', el, 'loker', 'left:230px;top:696px');
  o.cards = [...Array(9)].map(() => { const c = h('div', 'in', el); h('div', 'bar', c); h('div', 'bar', c); return c; });
  o.bad = h('div', 'bad', el, 'loker<i></i>');
  o.reply = h('div', 'reply', el); o.rbars = [0, 1, 2].map(() => h('div', 'bar', o.reply, null, 'width:0'));
  o.caret = h('div', 'abs', o.reply, null, 'right:40px;bottom:30px;width:6px;height:40px;background:#fff');
  o.dot = h('div', 'storeDot', el, ICON.store, 'left:110px;top:1330px');
  o.c1 = makeCap(el, [{ cls: 'md', text: 'CONTOH: &lt; 24 JAM · MIN 5 BALASAN' }]);
  o.c2 = makeCap(el, [{ cls: 'sm', text: 'KATA YANG KAMU HINDARI, CONTOH:' }, { text: 'LOKER' }]);
  return o;
}, (o, lt, d, A) => {
  const a10 = A('S10'), a11 = A('S11');
  o.body.setAttribute('stroke-dashoffset', 1 - E.inOut(P(lt, 0, 0.9)));
  o.body.style.fillOpacity = P(lt, 0.5, 1);
  show(o.funnel.querySelector('.rim'), P(lt, 0.8, 1.1));
  show(o.kw, E.out(P(lt, 0.2, 0.5)));
  const xp = E.back(P(lt, a10 + 0.2, a10 + 0.6));
  o.x.style.transform = `scale(${xp})`; show(o.x, clamp(xp));
  capAt(o.c1, lt, 0.3, a10);
  capAt(o.c2, lt, a10, a11);
  // kartu berjatuhan masuk corong (sampai S11); tiap ke-3 terlalu lama/sepi → terpental keluar
  o.cards.forEach((c, i) => {
    const t0 = 0.9 + i * 0.75;
    const age = lt - t0;
    if (age < 0 || age > 1.6 || t0 > a11) { show(c, 0); return; }
    const xs = [200, 445, 690][i % 3];
    const rejected = i % 3 === 2 && t0 < a10;
    const fall = E.in(P(age, 0, 0.7));
    let x = xs, y = lerp(560, 860, fall), s = 1, r = 0, op = 1;
    if (age > 0.7) {
      const q = E.out(P(age, 0.7, 1.4));
      if (rejected) { x = lerp(xs, xs + 420, q); y = lerp(860, 700, q); r = 25 * q; op = 1 - q; }
      else { x = lerp(xs, 445, q); y = lerp(860, 1120, q); s = 1 - 0.5 * q; op = 1 - P(age, 1.1, 1.5); }
    }
    css(c, { left: '0px', top: '0px' }); tf(c, x, y, s, r); show(c, op);
  });
  // kartu “loker” dicoret & dibuang
  const b0 = a10 + 0.5;
  const ba = lt - b0;
  if (ba < 0 || lt > a11 + 0.2) show(o.bad, 0);
  else {
    const fall = E.out(P(ba, 0, 0.5));
    const fly = E.in(P(ba, 1.2, 2.0));
    css(o.bad, { left: '0px', top: '0px' });
    tf(o.bad, lerp(420, -420, fly), lerp(560, 860, fall) - 120 * fly, 1, -30 * fly);
    o.bad.querySelector('i').style.width = `${E.out(P(ba, 0.6, 0.95)) * 150}px`;
    show(o.bad, 1 - P(ba, 1.7, 2.0));
  }
  // komentar ditulis
  const rp = E.back(P(lt, a11, a11 + 0.45));
  o.reply.style.transform = `scale(${rp})`; show(o.reply, clamp(rp * 2));
  o.rbars.forEach((b, i) => { b.style.width = `${[100, 82, 46][i] * E.out(P(lt, a11 + 0.5 + i * 0.7, a11 + 1.1 + i * 0.7))}%`; });
  o.caret.style.opacity = Math.floor(lt * 2.4) % 2 ? 0 : 1;
  const dp = P(lt, a11 + 0.2, a11 + 1.0);
  show(o.dot, lt > a11 ? 1 - P(lt, a11 + 1.0, a11 + 1.3) : 0);
  tf(o.dot, 160 * E.inOut(dp), -20 * Math.sin(Math.PI * dp), 1 - 0.4 * dp);
});

// L8 Kalender jeda 7 hari: S12
layer('S12', 'S13', 's-gain', (el) => {
  const o = {};
  o.cells = [...Array(8)].map((_, i) => {
    const c = h('div', 'cell', el, null, `left:${72 + (i % 4) * 224}px;top:${780 + Math.floor(i / 4) * 240}px`);
    if (i === 0) { avatar(c, 200); h('div', 'tick', c, ICON.check); }
    else if (i < 7) h('div', '', c, ICON.lock, 'color:var(--card-muted)');
    else { c._lock = h('div', '', c, ICON.lock, 'color:var(--you)'); c._av = avatar(c, 200, 'position:absolute'); }
    return c;
  });
  o.cap = makeCap(el, [{ cls: 'sm', text: 'BAWAAN:' }, { text: 'JEDA 7 HARI PER ORANG' }]);
  return o;
}, (o, lt, d) => {
  capAt(o.cap, lt, 0.3, Infinity);
  o.cells.forEach((c, i) => {
    const t = i === 0 ? 0.3 : i < 7 ? 0.6 + i * 0.25 : 0.6 + 7 * 0.25 + 0.2;
    const p = E.back(P(lt, t, t + 0.35));
    c.style.transform = `scale(${p})`; show(c, clamp(p * 1.5));
    if (i === 7) {
      const u = P(lt, d * 0.72, d * 0.72 + 0.5);
      const sh = c._lock.querySelector('.shackle');
      sh.setAttribute('transform', `translate(0 ${-3 * u}) rotate(${-25 * u} 16 7)`);
      show(c._lock, 1 - P(lt, d * 0.72 + 0.5, d * 0.72 + 0.8));
      const ap = E.back(P(lt, d * 0.72 + 0.6, d * 0.72 + 1.0));
      c._av.style.transform = `scale(${ap})`; show(c._av, clamp(ap));
      c.style.boxShadow = u > 0 ? `0 0 0 ${8 * u}px var(--you)` : '';
    }
  });
});

// L9 Statistik: S13
layer('S13', 'S14', 's-offer', (el) => {
  const o = {};
  o.panel = h('div', 'panel', el, null, 'top:780px;height:620px');
  o.num = h('div', 'big', o.panel, '0', 'font-size:250px');
  o.icon = h('div', 'abs', o.panel, ICON.reply, 'right:56px;top:60px;width:120px;height:120px;color:var(--reply)');
  o.minis = [...Array(6)].map((_, i) => {
    const m = h('div', 'mini', o.panel, null, `left:${48 + (i % 3) * 270}px;top:${300 + Math.floor(i / 3) * 170}px`);
    const top = h('div', 'top', m); avatar(top, 50 * i + 10, 'width:56px;height:56px;filter:blur(4px)');
    h('div', 'bar', top, null, 'width:110px');
    h('div', 'bar', m, null, 'width:90%'); h('div', 'cm', m);
    return m;
  });
  o.cap = makeCap(el, [{ cls: 'sm', text: 'CONTOH NYATA DARI DASHBOARD:' }, { cls: 'md', text: '43 KOMENTAR/24 JAM · SEMUA DI POSTINGAN ORANG LAIN' }]);
  return o;
}, (o, lt, d) => {
  capAt(o.cap, lt, 0.3, Infinity);
  const pp = E.out(P(lt, 0, 0.5));
  o.panel.style.transform = `translateY(${(1 - pp) * 160}px)`; show(o.panel, pp);
  o.num.textContent = Math.round(43 * E.inOut(P(lt, 0.5, d * 0.45)));
  o.minis.forEach((m, i) => {
    const p = E.back(P(lt, d * 0.5 + i * 0.18, d * 0.5 + i * 0.18 + 0.35));
    m.style.transform = `scale(${p}) rotate(${(i % 2 ? 1 : -1) * 2 * (1 - p)}deg)`; show(m, clamp(p * 1.5));
  });
});

// L10 Uji coba: S14
layer('S14', 'S15', 's-offer', (el) => {
  const o = {};
  o.panel = h('div', 'panel', el, null, 'top:720px;display:flex;flex-direction:column;gap:40px');
  const row = h('div', '', o.panel, null, 'display:flex;align-items:center;justify-content:space-between');
  h('span', '', row, 'Uji coba', 'font-weight:600;font-size:44px');
  o.sw = h('div', 'switch', row); o.knob = h('i', '', o.sw);
  const drafts = h('div', '', o.panel, null, 'display:flex;flex-direction:column;gap:18px');
  o.drafts = [0, 1, 2].map(() => { const d = h('div', 'd', drafts); const b = h('div', 'bars', d); h('div', 'bar', b); h('div', 'bar', b); h('span', 'dchip', d, 'DRAF'); return d; });
  const sent = h('div', '', o.panel, null, 'display:flex;align-items:baseline;justify-content:space-between;border-top:2px solid var(--card-line);padding-top:32px');
  h('span', '', sent, 'TERKIRIM', 'font-family:var(--mono);font-weight:800;font-size:40px;letter-spacing:.1em;color:var(--card-muted)');
  o.zero = h('span', 'big', sent, '0', 'font-size:220px');
  o.cap = makeCap(el, [{ cls: 'sm', text: 'UJI COBA:' }, { text: '0 TERKIRIM' }]);
  return o;
}, (o, lt, d) => {
  const pp = E.out(P(lt, 0, 0.45));
  o.panel.style.transform = `translateY(${(1 - pp) * 120}px)`; show(o.panel, pp);
  const on = E.inOut(P(lt, 0.6, 0.95));
  o.knob.style.left = `${10 + 76 * on}px`;
  o.sw.style.background = `color-mix(in srgb, var(--you) ${Math.round(on * 100)}%, var(--card-line))`;
  o.drafts.forEach((dd, i) => {
    const p = E.out(P(lt, d * 0.3 + i * 0.35, d * 0.3 + i * 0.35 + 0.4));
    dd.style.transform = `translateX(${(1 - p) * 140}px)`; show(dd, p * (i === 2 ? 0.6 : 1));
  });
  capAt(o.cap, lt, d * 0.62, Infinity);
  o.zero.style.transform = `scale(${1 + 0.12 * bump(P(lt, d * 0.75, d * 0.75 + 0.45))})`;
  o.zero.style.transformOrigin = '100% 80%';
});

// L11 Telat 5 jam: S15
layer('S15', 'S16', 's-offer', (el) => {
  const o = {};
  o.glass = h('div', 'abs', el, `<svg width="300" height="460" viewBox="0 0 100 150">
    <path d="M15 5 H85 M15 145 H85" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>
    <path d="M22 8 C 22 50, 48 60, 48 75 C 48 90, 22 100, 22 142 H78 C 78 100, 52 90, 52 75 C 52 60, 78 50, 78 8 Z" fill="var(--card)" stroke="var(--ink)" stroke-width="4"/>
    <clipPath id="top"><rect class="tsand" x="0" y="20" width="100" height="55"/></clipPath>
    <clipPath id="bot"><rect class="bsand" x="0" y="140" width="100" height="0"/></clipPath>
    <path clip-path="url(#top)" d="M25 12 C 25 50, 49 60, 49 75 H51 C 51 60, 75 50, 75 12 Z" fill="var(--label-bg)"/>
    <path clip-path="url(#bot)" d="M25 140 C 25 105, 49 92, 49 78 H51 C 51 92, 75 105, 75 140 Z" fill="var(--label-bg)"/>
    <line class="stream" x1="50" y1="75" x2="50" y2="138" stroke="var(--label-bg)" stroke-width="2.5"/></svg>`, 'left:100px;top:800px');
  o.box = h('div', 'panel', el, null, 'left:470px;right:120px;top:860px;padding:40px;display:flex;align-items:center;gap:20px;color:var(--reply)');
  h('div', '', o.box, ICON.reply, 'width:110px;height:110px');
  o.n = h('div', 'big', o.box, '0', 'font-size:200px;color:var(--reply)');
  o.you = h('div', 'storeDot', el, ICON.store, 'left:0;top:0;width:150px;height:150px');
  o.cap = makeCap(el, [{ cls: 'sm', text: 'CONTOH NYATA:' }, { cls: 'md', text: 'TELAT 5 JAM = 23 BALASAN DULUAN' }]);
  return o;
}, (o, lt, d) => {
  capAt(o.cap, lt, 0.3, Infinity);
  show(o.glass, E.out(P(lt, 0, 0.4))); show(o.box, E.out(P(lt, 0.2, 0.6)));
  const f = E.inOut(P(lt, 0.4, d * 0.75));
  o.glass.querySelector('.tsand').setAttribute('y', 20 + 55 * f);
  o.glass.querySelector('.bsand').setAttribute('y', 140 - 62 * f);
  o.glass.querySelector('.bsand').setAttribute('height', 62 * f);
  show(o.glass.querySelector('.stream'), f > 0 && f < 1 ? 1 : 0);
  o.n.textContent = Math.round(23 * f);
  const yp = E.back(P(lt, d * 0.6, d * 0.85));
  tf(o.you, lerp(-200, 420, yp), 1360); show(o.you, lt > d * 0.6 ? 1 : 0);
});

// L12 Promo: S16
layer('S16', 'S17', '', (el) => {
  el.style.background = 'var(--label-bg)';
  const o = {};
  o.lines = ['UJI DULU,', 'KIRIM BELAKANGAN'].map((t, i) => h('span', '', null, t));
  o.box = h('div', 'promo', el); o.lines.forEach((l) => o.box.appendChild(l));
  o.note = h('div', 'abs', el, 'Pakai kunci AI sendiri', 'left:72px;top:1120px;font-family:var(--body);font-weight:600;font-size:44px;color:var(--ink);padding:10px 22px;border-radius:999px;border:3px solid var(--ink)');
  return o;
}, (o, lt) => {
  o.lines.forEach((l, i) => {
    const p = E.back(P(lt, 0.1 + i * 0.25, 0.5 + i * 0.25));
    l.style.transform = `translateY(${(1 - p) * 60}px) scale(${0.9 + 0.1 * p})`; l.style.opacity = clamp(p * 1.5);
  });
  show(o.note, E.out(P(lt, 0.8, 1.1)));
});

// L13 CTA: S17–akhir
layer('S17', null, 's-cta', (el) => {
  const o = {};
  o.mapw = h('div', 'abs', el, '<svg width="1080" height="1920"></svg>', 'inset:0;transform-origin:50% 56%');
  drawMap(o.mapw.querySelector('svg'), { prefix: 'cta' });
  h('div', 'abs', el, null, 'inset:0;background:linear-gradient(180deg, color-mix(in srgb, var(--cta-bg) 94%, transparent) 0%, color-mix(in srgb, var(--cta-bg) 30%, transparent) 42%, color-mix(in srgb, var(--cta-bg) 30%, transparent) 62%, color-mix(in srgb, var(--cta-bg) 95%, transparent) 86%)');
  o.pins = [[180, 780], [300, 1180], [760, 1220], [880, 820], [150, 1050], [640, 1360], [860, 1060], [260, 900]].map(([x, y]) => h('div', 'pin', el, null, `left:${x}px;top:${y}px`));
  o.me = h('div', 'mepin', el, ICON.store);
  o.q = h('div', 'q2', el, '?');
  o.cap = makeCap(el, [{ text: 'FOLLOW @jadi.kayaaa' }, { cls: 'sm', text: '· DEMO + INFO AKSES' }]);
  o.cap._spans[1].style.fontSize = '52px';
  o.rip = h('div', 'ripple', el);
  o.btn = h('div', 'btn follow', el, 'Follow');
  return o;
}, (o, lt, d, A) => {
  o.mapw.style.transform = `scale(${1.3 - 0.3 * E.out(P(lt, 0, 1.6))})`;
  o.pins.forEach((p, i) => show(p, 0.25 + 0.75 * E.out(P(lt, 0.3 + i * 0.15, 0.6 + i * 0.15))));
  const mp = E.back(P(lt, 0.5, 0.95));
  const glow = 0.5 + 0.5 * Math.sin(lt * 3);
  o.me.style.transform = `scale(${mp})`; show(o.me, clamp(mp * 2));
  o.me.style.boxShadow = `0 0 0 ${20 + 10 * glow}px color-mix(in srgb, var(--you) 30%, transparent), 0 0 0 ${60 + 16 * glow}px color-mix(in srgb, var(--you) 13%, transparent), 0 0 160px 40px color-mix(in srgb, var(--you) 45%, transparent)`;
  const qp = E.back(P(lt, 1.4, 1.8)); o.q.style.transform = `scale(${qp})`; show(o.q, clamp(qp * 2));
  capAt(o.cap, lt, 0.5, Infinity);
  const bp = E.out(P(lt, 1.0, 1.5));
  o.btn.style.transform = `translateY(${(1 - bp) * 300}px)`; show(o.btn, bp);
  const press = window.TIMELINE.anchors.FOLLOW != null ? A('FOLLOW') : (d - 2) * 0.62; // kata “Follow”
  const pr = bump(P(lt, press, press + 0.3));
  o.btn.style.transform += ` scale(${1 - 0.06 * pr})`;
  const rp = P(lt, press + 0.1, press + 0.9);
  show(o.rip, rp > 0 && rp < 1 ? 1 - rp : 0); o.rip.style.transform = `scale(${1 + 0.15 * rp}, ${1 + 0.6 * rp})`;
});

// ---------- mesin ----------
const stage = document.getElementById('stage');
let built = false;
function build() {
  LAYERS.forEach((L) => {
    L.el = h('div', 'layer ' + (L.bg || ''), stage);
    L.o = L.build(L.el);
    show(L.el, 0);
  });
  built = true;
}
function bounds(L) {
  const a = window.TIMELINE.anchors;
  const s = a[L.from];
  const e = L.to ? a[L.to] : window.TIMELINE.end;
  return [s, e];
}
const XF = 0.35; // lama crossfade antar adegan
window.renderAt = function (t) {
  if (!built) build();
  let active = -1;
  LAYERS.forEach((L, i) => { const [s, e] = bounds(L); if (t >= s && t < e) active = i; });
  if (active < 0) active = t <= 0 ? 0 : LAYERS.length - 1;
  LAYERS.forEach((L, i) => {
    const [s, e] = bounds(L);
    const d = e - s;
    const A = (id) => window.TIMELINE.anchors[id] - s;
    if (i === active) {
      L.update(L.o, t - s, d, A);
      const fin = i === 0 ? 1 : E.out(P(t - s, 0, XF));
      show(L.el, fin); L.el.style.zIndex = 2;
    } else if (i === active - 1 && t - bounds(LAYERS[active])[0] < XF) {
      L.update(L.o, Math.min(t - s, d), d, A);
      show(L.el, 1); L.el.style.zIndex = 1;
    } else show(L.el, 0);
  });
};
window.animReady = document.fonts.ready.then(() => { window.renderAt(0); return true; });
