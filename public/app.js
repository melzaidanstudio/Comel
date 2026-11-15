// ================= util =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('id-ID');

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Belum login'); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show${isErr ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, isErr ? 7000 : 3500);
}

function ago(ts) {
  if (!ts) return '—';
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 0) return `dalam ${fmtDur(-s)}`;
  if (s < 60) return 'baru saja';
  return `${fmtDur(s)} lalu`;
}
function fmtDur(s) {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} mnt`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} jam`;
  return `${Math.round(s / 86400)} hari`;
}
function statusBadge(st) {
  const map = { sent: ['ok', 'terkirim'], failed: ['err', 'gagal'], dry_run: ['info', 'dry-run'], skipped: ['', 'skip'] };
  const [cls, label] = map[st] || ['', st];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function lastStatusBadge(s) {
  if (!s) return '<span class="badge">belum jalan</span>';
  const cls = /^ERROR|gagal [1-9]/.test(s) ? 'err' : /^dilewati|luar jam/.test(s) ? 'warn' : 'ok';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

async function withBusy(btn, fn) {
  const old = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }
  try { return await fn(); } catch (e) { toast(e.message, true); return undefined; } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

// ================= form builder =================
function fieldHtml(f, v) {
  const val = v ?? f.default ?? '';
  const help = f.help ? `<span class="help">${f.help}</span>` : '';
  const cls = f.full ? 'full' : '';
  const when = f.when ? ' data-when="1"' : '';
  if (f.type === 'activehours') return activeHoursHtml(f, val, cls, when, help);
  if (f.type === 'section') return `<div class="section"${when} data-key="${f.key || ''}">${esc(f.label)}</div>`;
  if (f.type === 'checkbox') {
    return `<label class="check ${cls}" data-key="${f.key}"${when}><input type="checkbox" name="${f.key}" ${Number(val) ? 'checked' : ''}><span>${esc(f.label)}${help}</span></label>`;
  }
  let input;
  if (f.type === 'select') {
    const opts = (typeof f.options === 'function' ? f.options() : f.options)
      .map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(val ?? '') ? 'selected' : ''}>${esc(ol)}</option>`).join('');
    input = `<select name="${f.key}">${opts}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea name="${f.key}" placeholder="${esc(f.placeholder || '')}" rows="${f.rows || 3}">${esc(val)}</textarea>`;
  } else {
    input = `<input name="${f.key}" type="${f.type || 'text'}" value="${esc(f.type === 'password' ? '' : val)}" placeholder="${esc(f.placeholder || '')}" ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''} ${f.type === 'password' ? 'autocomplete="new-password"' : ''}>`;
  }
  return `<label class="field ${cls}" data-key="${f.key}"${when}>${esc(f.label)}${input}${help}</label>`;
}

function defaultHoursLabel() {
  const s = state.settings || {};
  return s.active_start && s.active_end && s.active_start !== s.active_end ? `${s.active_start}–${s.active_end}` : '24 jam';
}
function activeHoursHtml(f, val, cls, when, help) {
  const v = String(val || '').trim();
  const mode = !v || v === 'default' ? 'default' : v === '24h' ? '24h' : 'custom';
  const [start = '06:00', end = '22:00'] = mode === 'custom' ? v.split(',')[0].split('-').map((x) => x.trim()) : [];
  return `<div class="field activehours ${cls}" data-key="${f.key}"${when}>${esc(f.label)}
    <select name="${f.key}__mode">
      <option value="default" ${mode === 'default' ? 'selected' : ''}>Ikuti default (${esc(defaultHoursLabel())})</option>
      <option value="custom" ${mode === 'custom' ? 'selected' : ''}>Atur sendiri</option>
      <option value="24h" ${mode === '24h' ? 'selected' : ''}>24 jam (selalu aktif)</option>
    </select>
    <div class="ah-range ${mode === 'custom' ? '' : 'hidden'}">
      <label>Mulai <input type="time" name="${f.key}__start" value="${esc(start)}"></label>
      <label>Selesai <input type="time" name="${f.key}__end" value="${esc(end)}"></label>
    </div>${help}</div>`;
}
function activeHoursLabel(v) {
  const s = String(v || '').trim();
  if (!s || s === 'default') return `${defaultHoursLabel()} (default)`;
  if (s === '24h') return '24 jam';
  return s.replace(/-/g, '–');
}

function readForm(fields, root) {
  const out = {};
  for (const f of fields) {
    if (!f.key || f.type === 'section') continue;
    if (f.type === 'activehours') {
      const mode = root.querySelector(`[name="${f.key}__mode"]`)?.value;
      if (!mode) continue;
      const a = root.querySelector(`[name="${f.key}__start"]`).value;
      const b = root.querySelector(`[name="${f.key}__end"]`).value;
      out[f.key] = mode === 'default' ? '' : mode === '24h' ? '24h' : (a && b ? `${a}-${b}` : '');
      continue;
    }
    const el = root.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    if (f.type === 'checkbox') out[f.key] = el.checked ? 1 : 0;
    else if (f.type === 'number') out[f.key] = el.value === '' ? (f.nullable ? null : 0) : Number(el.value);
    else if (f.type === 'select' && f.numeric) out[f.key] = el.value === '' ? null : Number(el.value);
    else out[f.key] = el.value;
  }
  return out;
}

function applyWhen(fields, root) {
  $$('.activehours', root).forEach((el) => {
    el.querySelector('.ah-range').classList.toggle('hidden', el.querySelector('select').value !== 'custom');
  });
  const vals = readForm(fields, root);
  for (const f of fields) {
    if (!f.when) continue;
    const el = f.type === 'section' ? root.querySelector(`.section[data-key="${f.key}"]`) : root.querySelector(`[data-key="${f.key}"]`);
    if (el) el.classList.toggle('hidden', !f.when(vals));
  }
}

/** Modal form umum. onSubmit(values) → bila resolve, modal ditutup. */
function openForm({ title, fields, values = {}, submitLabel = 'Simpan', onSubmit, extraHtml = '', onMount }) {
  const modal = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = `${extraHtml}<div class="form">${fields.map((f) => fieldHtml(f, values[f.key])).join('')}</div>`;
  $('#modalFoot').innerHTML = `<button class="btn ghost" value="cancel" formnovalidate>Batal</button><button class="btn primary" value="ok" id="modalSubmit">${esc(submitLabel)}</button>`;
  const body = $('#modalBody');
  applyWhen(fields, body);
  body.addEventListener('change', () => applyWhen(fields, body));
  onMount?.(body);
  $('#modalSubmit').onclick = async (ev) => {
    ev.preventDefault();
    if (!$('#modalForm').reportValidity()) return;
    const btn = ev.currentTarget;
    const ok = await withBusy(btn, async () => { await onSubmit(readForm(fields, body)); return true; });
    if (ok) modal.close();
  };
  modal.showModal();
}

function openInfo(title, html, footHtml = '') {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalFoot').innerHTML = footHtml || '<button class="btn" value="cancel" formnovalidate>Tutup</button>';
  $('#modal').showModal();
}

// ================= state =================
const state = { providers: [], accounts: [], triggers: [], presets: [], settings: {} };
async function loadRefs() {
  [state.providers, state.accounts, state.triggers, state.settings] = await Promise.all([
    api('/providers'), api('/accounts'), api('/triggers'), api('/settings'),
  ]);
  updatePauseBtn();
}
const providerOptions = () => [['', '— default —'], ...state.providers.map((p) => [p.id, `${p.name} (${p.model})`])];
const accountOptions = () => state.accounts.map((a) => [a.id, `${a.name}${a.username ? ` (@${a.username})` : ''}`]);
const accountName = (id) => state.accounts.find((a) => a.id === id)?.name || `#${id}`;

// ================= pages =================
const pages = {};
let refreshTimer;

pages.dashboard = async (main) => {
  const [stats, actions, logs] = await Promise.all([api('/stats'), api('/actions?limit=12'), api('/logs?limit=60')]);
  main.innerHTML = `
    <div class="page-head"><div><h1>Dasbor</h1><p class="muted">Ringkasan 24 jam terakhir</p></div>
      <button class="btn" id="refreshBtn">Muat ulang</button></div>
    ${stats.paused ? '<div class="callout warn" style="margin-bottom:14px">⏸ Aplikasi sedang di-PAUSE. Penjadwal tidak akan mengirim komentar sampai dilanjutkan.</div>' : ''}
    <div class="grid stats">
      <div class="stat"><div class="n">${num(stats.sent24)}</div><div class="l">Terkirim (24 jam)</div></div>
      <div class="stat"><div class="n">${num(stats.failed24)}</div><div class="l">Gagal (24 jam)</div></div>
      <div class="stat"><div class="n">${num(stats.skipped24)}</div><div class="l">Skip / dry-run (24 jam)</div></div>
      <div class="stat"><div class="n">${num(stats.accounts)}</div><div class="l">Akun aktif</div></div>
      <div class="stat"><div class="n">${num(stats.triggers)}</div><div class="l">Trigger aktif</div></div>
    </div>
    <div class="card"><h2>Trigger</h2>${triggerMiniTable()}</div>
    <div class="card"><h2>Aktivitas terbaru</h2>${actionsTable(actions)}</div>
    <div class="card"><h2>Log sistem</h2><div>${logs.map(logLine).join('') || '<div class="empty">Belum ada log</div>'}</div></div>`;
  $('#refreshBtn').onclick = () => render();
  bindTriggerButtons(main);
  refreshTimer = setTimeout(() => location.hash.slice(1) === 'dashboard' && !$('#modal').open && render(), 15000);
};

function logLine(l) {
  const t = new Date(l.ts * 1000).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
  return `<div class="log-line"><span class="muted">${t}</span> <span class="lv-${l.level}">${l.level.toUpperCase()}</span> <b>${esc(l.source)}</b> ${esc(l.message)}</div>`;
}

function triggerMiniTable() {
  if (!state.triggers.length) return '<div class="empty">Belum ada trigger. <a href="#triggers">Buat trigger</a></div>';
  return `<div class="table-wrap"><table><thead><tr><th>Nama</th><th>Akun</th><th>Jadwal</th><th>Terakhir</th><th>Berikutnya</th><th></th></tr></thead><tbody>
    ${state.triggers.map((t) => `<tr>
      <td><b>${esc(t.name)}</b> ${t.enabled ? '' : '<span class="badge">nonaktif</span>'} ${t.dry_run ? '<span class="badge info">dry-run</span>' : ''}</td>
      <td>${esc(accountName(t.account_id))}</td>
      <td>${t.actions_per_run}× / ${t.interval_minutes} mnt<div class="sub">${esc(activeHoursLabel(t.active_hours))}</div></td>
      <td>${lastStatusBadge(t.last_status)}<div class="sub">${ago(t.last_run_at)}</div></td>
      <td>${t.enabled ? ago(t.next_run_at) : '—'}</td>
      <td class="row-actions"><button class="btn small" data-run="${t.id}">Jalankan</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function bindTriggerButtons(root) {
  $$('[data-run]', root).forEach((b) => { b.onclick = () => withBusy(b, async () => {
    const r = await api(`/triggers/${b.dataset.run}/run`, { method: 'POST' });
    toast(`Selesai: ${r.status}`);
    await loadRefs(); render();
  }); });
  $$('[data-preview]', root).forEach((b) => { b.onclick = () => withBusy(b, () => previewTrigger(Number(b.dataset.preview))); });
}

function actionTag(a) {
  try { const t = JSON.parse(a.metrics || '{}').tag; return t ? ` <span class="badge tag">#${esc(t)}</span>` : ''; } catch { return ''; }
}

function actionsTable(rows) {
  if (!rows.length) return '<div class="empty">Belum ada aktivitas</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Status</th><th>Target</th><th>Komentar kita</th></tr></thead><tbody>
  ${rows.map((a) => `<tr>
    <td>${ago(a.created_at)}<div class="sub">${esc(a.account_name || '')} · ${a.kind === 'reply' ? 'balas komentar' : esc(a.trigger_name || 'komentar')}</div></td>
    <td>${statusBadge(a.status)}</td>
    <td><a href="${esc(a.target_url)}" target="_blank" rel="noopener">@${esc(a.target_user)}</a>${actionTag(a)}<div class="sub clip">${esc(a.target_text)}</div></td>
    <td><div class="clip">${esc(a.reply_text || '')}</div>${a.error ? `<div class="sub" style="color:var(--err)">${esc(a.error)}${/screenshot: (\S+)\)/.test(a.error) ? ` <a href="/api/screenshots/${esc(a.error.match(/screenshot: (\S+)\)/)[1])}" target="_blank">lihat</a>` : ''}</div>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

// ---------- triggers ----------
const TRIGGER_FIELDS = [
  { type: 'section', label: 'Umum' },
  { key: 'name', label: 'Nama trigger', required: true, placeholder: 'Kuliner Bogor viral' },
  { key: 'account_id', label: 'Akun Threads', type: 'select', numeric: true, options: accountOptions },
  { key: 'provider_id', label: 'AI provider', type: 'select', numeric: true, options: providerOptions, help: 'Kosong = pakai provider akun / default' },
  { key: 'enabled', label: 'Aktif (jalan otomatis sesuai jadwal)', type: 'checkbox', default: 1 },
  { type: 'section', label: 'Kata kunci' },
  { key: 'queries', label: 'Kata pencarian di Threads (satu per baris)', type: 'textarea', full: true, rows: 3, placeholder: 'kuliner bogor\nmakanan enak bogor\njajanan bogor', help: 'Tiap baris dicari di Threads (±20 postingan teratas per kata). Kosong = diambil dari ekspresi di bawah.' },
  { key: 'match_expr', label: 'Ekspresi kata kunci (filter teks)', full: true, placeholder: 'kuliner AND (bogor OR "kota hujan") -promo', help: 'Operator: AND/DAN, OR/ATAU, NOT/BUKAN atau -kata, tanda kurung, "frasa". Kosong = semua hasil pencarian.' },
  { key: 'exclude_words', label: 'Kata yang dihindari', placeholder: 'giveaway, judi, slot', help: 'Dipisah koma' },
  { key: 'exclude_users', label: 'User yang dihindari', placeholder: '@akunpesaing, @spammer', help: 'Dipisah koma' },
  { key: 'include_replies', label: 'Ikutkan postingan yang berupa balasan (bukan utas utama)', type: 'checkbox', full: true },
  { type: 'section', label: 'Topic tag' },
  { key: 'topic_tags', label: 'Topic tag (wajib salah satu)', type: 'textarea', full: true, rows: 2, placeholder: 'Kuliner Bogor, Food Threads', help: 'Hanya postingan dengan topic tag ini yang dikomentari. Pisahkan dengan koma atau baris baru. Kosong = tanpa filter tag. Klik saran di bawah untuk menambah.' },
  { key: 'tag_match', label: 'Cara mencocokkan tag', type: 'select', options: [['exact', 'Sama persis ("Kuliner Bogor" = "kulinerbogor")'], ['contains', 'Mengandung kata ("bogor" cocok dengan "Kuliner Bogor", "Bogor")']] },
  { key: 'exclude_tags', label: 'Tag yang dihindari', placeholder: 'Politik, Giveaway', help: 'Dipisah koma' },
  { key: 'tag_as_source', label: 'Cari juga lewat halaman topic tag (trigger by tag)', type: 'checkbox', default: 1, full: true, help: 'Membuka halaman tag di Threads untuk tiap tag di atas, selain kata pencarian. Kata pencarian boleh dikosongkan.' },
  { type: 'section', label: 'Filter viralitas (0 = tidak dipakai)' },
  { key: 'min_likes', label: 'Minimal suka', type: 'number', default: 100 },
  { key: 'min_replies', label: 'Minimal balasan/komentar', type: 'number', default: 50 },
  { key: 'min_reposts', label: 'Minimal repost', type: 'number', default: 0 },
  { key: 'min_shares', label: 'Minimal share', type: 'number', default: 50 },
  { key: 'min_quotes', label: 'Minimal quote', type: 'number', default: 0 },
  { key: 'metric_logic', label: 'Logika syarat viralitas', type: 'select', options: [['all', 'Semua syarat harus terpenuhi (AND)'], ['any', 'Salah satu cukup (OR)']] },
  { type: 'section', label: 'Filter waktu' },
  { key: 'max_age_hours', label: 'Umur postingan maksimal (jam)', type: 'number', default: 72, help: '0 = tanpa batas. Contoh 24 = hanya postingan 24 jam terakhir.' },
  { key: 'min_age_minutes', label: 'Umur postingan minimal (menit)', type: 'number', default: 0 },
  { key: 'active_hours', label: 'Jam aktif', type: 'activehours', help: 'Di luar jam ini trigger tidak berjalan. Default bisa diubah di Pengaturan.' },
  { key: 'sort_by', label: 'Prioritas', type: 'select', options: [['engagement', 'Paling viral dulu'], ['newest', 'Paling baru dulu']] },
  { type: 'section', label: 'Jadwal' },
  { key: 'actions_per_run', label: 'Jumlah komentar per putaran', type: 'number', default: 3 },
  { key: 'interval_minutes', label: 'Setiap (menit)', type: 'number', default: 15 },
  { key: 'author_cooldown_hours', label: 'Jeda per penulis (jam)', type: 'number', default: 24, help: 'Tidak mengomentari orang yang sama lebih dari sekali dalam rentang ini' },
  { type: 'section', label: 'AI' },
  { key: 'instruction', label: 'Instruksi khusus untuk trigger ini', type: 'textarea', full: true, rows: 4, placeholder: 'Komentari pengalaman kuliner di postingan. Kalau relevan, sebut dengan halus bahwa kamu juga suka kulineran di Bogor. Jangan promosi.' },
  { key: 'dry_run', label: 'Dry run: buat komentar tapi JANGAN kirim (untuk uji coba)', type: 'checkbox', full: true },
];

pages.triggers = async (main) => {
  main.innerHTML = `
    <div class="page-head"><div><h1>Trigger</h1><p class="muted">Kata kunci + filter viralitas/waktu + jadwal → komentar AI otomatis</p></div>
      <button class="btn primary" id="addTrigger">+ Trigger baru</button></div>
    ${!state.accounts.length ? '<div class="callout warn" style="margin-bottom:14px">Tambahkan akun Threads dulu di menu <a href="#accounts">Akun Threads</a>.</div>' : ''}
    ${!state.providers.length ? '<div class="callout warn" style="margin-bottom:14px">Tambahkan AI provider dulu di menu <a href="#providers">AI Provider</a>.</div>' : ''}
    <div id="triggerList">${state.triggers.map(triggerCard).join('') || '<div class="card empty">Belum ada trigger</div>'}</div>`;
  $('#addTrigger').onclick = () => {
    if (!state.accounts.length) return toast('Tambahkan akun Threads dulu', true);
    editTrigger(null);
  };
  bindTriggerButtons(main);
  $$('[data-edit-trigger]', main).forEach((b) => { b.onclick = () => editTrigger(Number(b.dataset.editTrigger)); });
  $$('[data-dup-trigger]', main).forEach((b) => { b.onclick = () => editTrigger(Number(b.dataset.dupTrigger), true); });
  $$('[data-del-trigger]', main).forEach((b) => { b.onclick = async () => {
    if (!confirm('Hapus trigger ini?')) return;
    await api(`/triggers/${b.dataset.delTrigger}`, { method: 'DELETE' });
    await loadRefs(); render();
  }; });
  $$('[data-toggle-trigger]', main).forEach((b) => { b.onclick = async () => {
    const t = state.triggers.find((x) => x.id === Number(b.dataset.toggleTrigger));
    await api(`/triggers/${t.id}`, { method: 'PUT', body: { enabled: t.enabled ? 0 : 1 } });
    await loadRefs(); render();
  }; });
};

function triggerCard(t) {
  const q = JSON.parse(t.queries || '[]');
  const metrics = [['suka', t.min_likes], ['balasan', t.min_replies], ['repost', t.min_reposts], ['share', t.min_shares], ['quote', t.min_quotes]]
    .filter(([, v]) => v > 0).map(([n, v]) => `${n} ≥ ${num(v)}`).join(t.metric_logic === 'any' ? ' atau ' : ' & ');
  return `<div class="card"><div class="item">
    <div>
      <h3>${esc(t.name)} ${t.enabled ? '<span class="badge ok">aktif</span>' : '<span class="badge">nonaktif</span>'} ${t.dry_run ? '<span class="badge info">dry-run</span>' : ''}</h3>
      <div class="kv">
        <span>Akun: <b>${esc(accountName(t.account_id))}</b></span>
        <span>Cari: <b>${esc(q.join(' · ') || (t.topic_tags && t.tag_as_source ? '(halaman tag)' : '(dari ekspresi)'))}</b></span>
        ${t.match_expr ? `<span>Filter: <b class="mono">${esc(t.match_expr)}</b></span>` : ''}
        ${t.topic_tags ? `<span>Tag: <b>${esc(t.topic_tags.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((x) => `#${x.replace(/^#/, '')}`).join(' '))}</b>${t.tag_match === 'contains' ? ' (mengandung)' : ''}</span>` : ''}
        <span>Viral: <b>${metrics || 'tanpa syarat'}</b></span>
        <span>Umur: <b>${t.max_age_hours ? `≤ ${t.max_age_hours} jam` : 'bebas'}</b></span>
        <span>Jadwal: <b>${t.actions_per_run}× tiap ${t.interval_minutes} menit</b></span>
        <span>Jam aktif: <b>${esc(activeHoursLabel(t.active_hours))}</b></span>
      </div>
      <div style="margin-top:8px">${lastStatusBadge(t.last_status)} <span class="muted">· terakhir ${ago(t.last_run_at)} · berikutnya ${t.enabled ? ago(t.next_run_at) : '—'}</span></div>
    </div>
    <div class="row-actions">
      <button class="btn small" data-preview="${t.id}">Preview</button>
      <button class="btn small" data-run="${t.id}">Jalankan</button>
      <button class="btn small" data-toggle-trigger="${t.id}">${t.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button>
      <button class="btn small" data-edit-trigger="${t.id}">Edit</button>
      <button class="btn small" data-dup-trigger="${t.id}">Duplikat</button>
      <button class="btn small danger" data-del-trigger="${t.id}">Hapus</button>
    </div>
  </div></div>`;
}

async function mountTagChips(body) {
  const field = body.querySelector('[data-key="topic_tags"]');
  if (!field) return;
  const box = document.createElement('div');
  box.className = 'chips';
  box.innerHTML = '<span class="muted">Memuat saran tag…</span>';
  field.appendChild(box);
  let tags = [];
  try { tags = await api('/tags?limit=40'); } catch { /* abaikan */ }
  if (!tags.length) { box.innerHTML = '<span class="muted">Belum ada saran — tag terkumpul otomatis setiap kali Preview/trigger berjalan.</span>'; return; }
  box.innerHTML = `<span class="muted">Tag yang pernah terlihat:</span> ${tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t.name)}" title="terlihat ${t.seen_count}×">#${esc(t.name)}${t.is_community ? ' ★' : ''}</button>`).join('')}`;
  box.querySelectorAll('[data-tag]').forEach((b) => { b.onclick = () => {
    const ta = body.querySelector('[name="topic_tags"]');
    const cur = ta.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (!cur.some((x) => x.toLowerCase() === b.dataset.tag.toLowerCase())) cur.push(b.dataset.tag);
    ta.value = cur.join(', ');
  }; });
}

function editTrigger(id, duplicate = false) {
  const t = id ? { ...state.triggers.find((x) => x.id === id) } : { account_id: state.accounts[0]?.id, tag_as_source: 1 };
  if (t.queries) t.queries = JSON.parse(t.queries).join('\n');
  if (duplicate) t.name = `${t.name} (salinan)`;
  openForm({
    title: id && !duplicate ? `Edit trigger: ${t.name}` : 'Trigger baru',
    fields: TRIGGER_FIELDS,
    values: t,
    onMount: mountTagChips,
    onSubmit: async (v) => {
      if (id && !duplicate) await api(`/triggers/${id}`, { method: 'PUT', body: v });
      else await api('/triggers', { method: 'POST', body: v });
      toast('Trigger disimpan');
      await loadRefs(); render();
    },
  });
}

async function previewTrigger(id) {
  const t = state.triggers.find((x) => x.id === id);
  const r = await api(`/triggers/${id}/preview`, { method: 'POST' });
  const ok = r.posts.filter((p) => p.ok);
  const rows = r.posts.map((p, i) => `<tr>
    <td>${p.ok ? '<span class="badge ok">lolos</span>' : `<span class="badge">${esc(p.reason)}</span>`}</td>
    <td><a href="${esc(p.url)}" target="_blank" rel="noopener">@${esc(p.username)}</a><div class="sub">${ago(p.takenAt)}</div></td>
    <td>${p.tag ? `<span class="badge tag">#${esc(p.tag.name)}</span> ` : ''}<div class="clip">${esc(p.text)}</div><div class="gen sub" id="gen-${i}"></div></td>
    <td class="mono">❤ ${num(p.likes)}<br>💬 ${num(p.replies)}<br>🔁 ${num(p.reposts)}<br>↗ ${num(p.shares)}</td>
    <td><button class="btn small" data-gen="${i}">Tes komentar</button></td>
  </tr>`).join('');
  const tagCount = {};
  for (const p of r.posts) if (p.tag) tagCount[p.tag.name] = (tagCount[p.tag.name] || 0) + 1;
  const tagSummary = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([n, c]) => `<span class="badge tag">#${esc(n)} · ${c}</span>`).join(' ');
  openInfo(`Preview: ${t.name}`, `
    <p class="muted">Dicari: ${r.queries.map(esc).join(' · ')} — <b>${r.posts.length}</b> postingan, <b>${ok.length}</b> lolos filter. Tidak ada yang dikirim dari halaman ini.</p>
    ${tagSummary ? `<p class="muted">Topic tag di hasil: ${tagSummary}</p>` : ''}
    ${r.errors.length ? `<div class="callout warn">${r.errors.map(esc).join('<br>')}</div>` : ''}
    <div class="table-wrap"><table><thead><tr><th>Status</th><th>Penulis</th><th>Teks</th><th>Metrik</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">Tidak ada postingan</td></tr>'}</tbody></table></div>`);
  $$('[data-gen]').forEach((b) => { b.onclick = (ev) => { ev.preventDefault(); withBusy(b, async () => {
    const p = r.posts[Number(b.dataset.gen)];
    const g = await api(`/triggers/${id}/test-generate`, { method: 'POST', body: { post: p } });
    $(`#gen-${b.dataset.gen}`).innerHTML = `<span class="badge info">AI</span> ${esc(g.text)}`;
  }); }; });
}

// ---------- accounts ----------
const ACCOUNT_FIELDS = [
  { type: 'section', label: 'Umum' },
  { key: 'name', label: 'Nama (label)', required: true, placeholder: 'Akun utama' },
  { key: 'username', label: 'Username Threads (tanpa @)', placeholder: 'namakamu', help: 'Wajib untuk metode browser; otomatis terisi untuk metode API setelah "Tes koneksi".' },
  { key: 'method', label: 'Metode kirim', type: 'select', options: [['api', 'API resmi Threads (disarankan)'], ['browser', 'Browser + cookie login']] },
  { key: 'daily_limit', label: 'Batas komentar per 24 jam', type: 'number', default: 50, help: 'Komentar + balasan. Terlalu banyak = risiko dianggap spam.' },
  { key: 'provider_id', label: 'AI provider akun', type: 'select', numeric: true, options: providerOptions },
  { key: 'enabled', label: 'Akun aktif', type: 'checkbox', default: 1 },

  { type: 'section', key: 'sec_api', label: 'API resmi Threads', when: (v) => v.method === 'api' },
  { key: 'access_token', label: 'Access token', type: 'password', full: true, when: (v) => v.method === 'api', help: 'Long-lived token dari Meta for Developers (lihat README). Kosongkan bila tidak ingin mengganti. Token diperbarui otomatis tiap minggu.' },

  { type: 'section', key: 'sec_login', label: 'Login otomatis (username & password)', when: (v) => v.method === 'browser' },
  { key: 'login_username', label: 'Username / email / no. HP', when: (v) => v.method === 'browser', placeholder: 'username Instagram/Threads', help: 'Akun yang dipakai login di threads.com' },
  { key: 'login_password', label: 'Password', type: 'password', when: (v) => v.method === 'browser', help: 'Disimpan terenkripsi (AES-256) di server, tidak pernah ditampilkan lagi.' },
  { key: 'totp_secret', label: 'Kunci 2FA authenticator (opsional)', type: 'password', when: (v) => v.method === 'browser', placeholder: 'JBSWY3DPEHPK3PXP', help: 'Isi jika 2FA pakai aplikasi authenticator → kode dibuat otomatis. Jika 2FA via SMS, kosongkan (kode diminta saat "Login sekarang").' },
  { key: 'login_engine', label: 'Browser untuk login', type: 'select', when: (v) => v.method === 'browser', options: [['lightpanda', 'Lightpanda (default)'], ['chromium', 'Chromium']] },
  { key: 'auto_login', label: 'Login ulang otomatis bila sesi kedaluwarsa', type: 'checkbox', default: 1, when: (v) => v.method === 'browser', help: 'Maks 1 percobaan per 30 menit; berhenti otomatis bila password salah / diminta verifikasi.' },
  { key: 'clear_login_password', label: 'Hapus password & kunci 2FA tersimpan', type: 'checkbox', when: (v) => v.method === 'browser' && v._has_login },

  { type: 'section', key: 'sec_browser', label: 'Sesi browser', when: (v) => v.method === 'browser' },
  { key: 'browser_engine', label: 'Browser untuk kirim komentar', type: 'select', when: (v) => v.method === 'browser', options: [['chromium', 'Chromium (paling andal)'], ['lightpanda', 'Lightpanda (ringan, eksperimental)']] },
  { key: 'cookies', label: 'Cookie threads.com (opsional)', type: 'textarea', full: true, rows: 3, when: (v) => v.method === 'browser', placeholder: '[{"name":"sessionid","value":"...","domain":".threads.com"}, ...]   atau   sessionid=...; csrftoken=...', help: 'Alternatif tanpa password. Terisi otomatis setelah login berhasil. Kosongkan bila tidak ingin mengganti.' },
  { key: 'scrape_with_cookies', label: 'Scrape juga pakai cookie akun ini', type: 'checkbox', when: (v) => v.method === 'browser', help: 'Default scrape tanpa login (lebih aman untuk akun).' },

  { type: 'section', label: 'Balas komentar otomatis' },
  { key: 'reply_enabled', label: 'Aktifkan balas komentar otomatis', type: 'checkbox', full: true },
  { key: 'reply_scope', label: 'Balas komentar di', type: 'select', options: [['both', 'Postingan saya + komentar saya'], ['own_posts', 'Postingan saya saja'], ['my_comments', 'Balasan untuk komentar saya saja']] },
  { key: 'reply_interval_minutes', label: 'Cek setiap (menit)', type: 'number', default: 30 },
  { key: 'reply_per_run', label: 'Maks balasan per putaran', type: 'number', default: 5 },
  { key: 'reply_max_age_hours', label: 'Hanya komentar ≤ (jam)', type: 'number', default: 48 },
  { key: 'reply_active_hours', label: 'Jam aktif balas komentar', type: 'activehours' },
  { key: 'reply_instruction', label: 'Instruksi membalas', type: 'textarea', full: true, rows: 3, placeholder: 'Balas dengan ramah dan nyambung. Kalau ditanya lokasi/harga, jawab sesuai memory.md. Kalau komentarnya negatif, tetap sopan.' },
  { key: 'reply_dry_run', label: 'Dry run balasan (buat tapi jangan kirim)', type: 'checkbox', full: true },
];

pages.accounts = async (main) => {
  main.innerHTML = `
    <div class="page-head"><div><h1>Akun Threads</h1><p class="muted">Login via API resmi atau cookie browser</p></div>
      <button class="btn primary" id="addAccount">+ Akun baru</button></div>
    ${state.accounts.map(accountCard).join('') || '<div class="card empty">Belum ada akun</div>'}`;
  $('#addAccount').onclick = () => editAccount(null);
  $$('[data-edit-account]', main).forEach((b) => { b.onclick = () => editAccount(Number(b.dataset.editAccount)); });
  $$('[data-verify]', main).forEach((b) => { b.onclick = () => withBusy(b, async () => {
    const r = await api(`/accounts/${b.dataset.verify}/verify`, { method: 'POST' });
    toast(r.username ? `Berhasil terhubung sebagai @${r.username}` : 'Cookie valid, sudah login');
  }).then(() => loadRefs()).then(render); });
  $$('[data-login]', main).forEach((b) => { b.onclick = () => withBusy(b, async () => {
    const id = Number(b.dataset.login);
    const r = await api(`/accounts/${id}/login`, { method: 'POST' });
    if (r.needs2fa) ask2fa(id, r.message); else toast('Login berhasil, sesi disimpan');
  }).then(() => loadRefs()).then(() => !$('#modal').open && render()); });
  $$('[data-run-replies]', main).forEach((b) => { b.onclick = () => withBusy(b, async () => {
    const r = await api(`/accounts/${b.dataset.runReplies}/run-replies`, { method: 'POST' });
    toast(`Balas komentar: ${r.status}`);
    await loadRefs(); render();
  }); });
  $$('[data-persona]', main).forEach((b) => { b.onclick = () => editAccountPersona(Number(b.dataset.persona)); });
  $$('[data-del-account]', main).forEach((b) => { b.onclick = async () => {
    if (!confirm('Hapus akun ini beserta trigger-triggernya?')) return;
    await api(`/accounts/${b.dataset.delAccount}`, { method: 'DELETE' });
    await loadRefs(); render();
  }; });
};

function accountCard(a) {
  const auth = a.method === 'api'
    ? (a.has_token ? `token ${esc(a.token_masked)}` : '<span style="color:var(--err)">token belum diisi</span>')
    : [
      a.has_login_password ? `password tersimpan ✓${a.has_totp ? ' · 2FA otomatis ✓' : ''}${a.login_paused ? ' · <span style="color:var(--warn)">login otomatis dijeda</span>' : ''}` : '',
      a.cookie_info.hasSession ? 'sesi aktif ✓' : '<span style="color:var(--err)">belum ada sesi</span>',
    ].filter(Boolean).join(' · ');
  const note = a.status_note ? `<span class="badge ${/^ERROR/.test(a.status_note) ? 'err' : 'ok'}">${esc(a.status_note)}</span>` : '<span class="badge">belum dites</span>';
  return `<div class="card"><div class="item">
    <div>
      <h3>${esc(a.name)} ${a.username ? `<span class="muted">@${esc(a.username)}</span>` : ''} ${a.enabled ? '' : '<span class="badge">nonaktif</span>'}</h3>
      <div class="kv">
        <span>Metode: <b>${a.method === 'api' ? 'API resmi' : 'Browser + cookie'}</b></span>
        <span>Login: <b>${auth}</b></span>
        <span>Terkirim 24 jam: <b>${a.sent_24h} / ${a.daily_limit}</b></span>
        <span>Balas komentar: <b>${a.reply_enabled ? `aktif, tiap ${a.reply_interval_minutes} mnt` : 'nonaktif'}</b></span>
      </div>
      <div style="margin-top:8px">${note} ${a.reply_enabled && a.last_reply_status ? lastStatusBadge(`balas: ${a.last_reply_status}`) : ''}</div>
    </div>
    <div class="row-actions">
      ${a.method === 'browser' && a.has_login_password ? `<button class="btn small" data-login="${a.id}">Login sekarang</button>` : ''}
      <button class="btn small" data-verify="${a.id}">Tes koneksi</button>
      <button class="btn small" data-run-replies="${a.id}">Balas komentar sekarang</button>
      <button class="btn small" data-persona="${a.id}">Persona</button>
      <button class="btn small" data-edit-account="${a.id}">Edit</button>
      <button class="btn small danger" data-del-account="${a.id}">Hapus</button>
    </div>
  </div></div>`;
}

function ask2fa(id, message) {
  openForm({
    title: 'Kode 2FA',
    fields: [{ key: 'code', label: 'Kode verifikasi', required: true, placeholder: '123456', full: true, help: esc(message || 'Masukkan kode dari SMS / aplikasi authenticator. Berlaku 5 menit.') }],
    submitLabel: 'Kirim kode',
    onSubmit: async (v) => {
      await api(`/accounts/${id}/login/2fa`, { method: 'POST', body: { code: v.code } });
      toast('Login berhasil, sesi disimpan');
      await loadRefs(); render();
    },
  });
}

function editAccount(id) {
  const a = id ? { ...state.accounts.find((x) => x.id === id) } : { method: 'api', auto_login: 1, login_engine: 'lightpanda' };
  a._has_login = a.has_login_password;
  const fields = ACCOUNT_FIELDS.map((f) => {
    if (f.key === 'login_password' && a.has_login_password) return { ...f, placeholder: '•••••••• (tersimpan — isi untuk mengganti)' };
    if (f.key === 'totp_secret' && a.has_totp) return { ...f, placeholder: '•••••••• (tersimpan — isi untuk mengganti)' };
    if (f.key === 'access_token' && a.has_token) return { ...f, placeholder: `${a.token_masked} (tersimpan — isi untuk mengganti)` };
    if (f.key === 'clear_login_password') return { ...f, when: (v) => v.method === 'browser' && a.has_login_password };
    return f;
  });
  openForm({
    title: id ? `Edit akun: ${a.name}` : 'Akun baru',
    fields,
    values: a,
    extraHtml: id ? '' : '<div class="callout" style="margin-bottom:12px">Panduan mendapatkan access token / cookie ada di README proyek.</div>',
    onSubmit: async (v) => {
      if (v.clear_login_password) v.clear_totp_secret = 1;
      if (id) await api(`/accounts/${id}`, { method: 'PUT', body: v });
      else await api('/accounts', { method: 'POST', body: v });
      toast(v.method === 'browser' && v.login_password ? 'Akun disimpan. Klik "Login sekarang" untuk login.' : 'Akun disimpan. Klik "Tes koneksi" untuk memeriksa login.');
      await loadRefs(); render();
    },
  });
}

async function editAccountPersona(id) {
  const a = state.accounts.find((x) => x.id === id);
  const p = await api(`/accounts/${id}/persona`);
  const fields = [
    { key: 'soul', label: 'soul.md khusus akun ini', type: 'textarea', full: true, rows: 10, help: 'Kosong = pakai soul.md global' },
    { key: 'memory', label: 'memory.md khusus akun ini', type: 'textarea', full: true, rows: 10, help: 'Kosong = pakai memory.md global' },
  ];
  openForm({
    title: `Persona akun: ${a.name}`, fields, values: p,
    onSubmit: async (v) => { await api(`/accounts/${id}/persona`, { method: 'PUT', body: v }); toast('Persona akun disimpan'); },
  });
}

// ---------- providers ----------
const PROVIDER_FIELDS = [
  { key: 'name', label: 'Nama', required: true, placeholder: '9router' },
  { key: 'kind', label: 'Format API', type: 'select', options: [['openai', 'OpenAI-compatible (/chat/completions)'], ['anthropic', 'Anthropic Messages API']] },
  { key: 'base_url', label: 'Base URL', required: true, full: true, placeholder: 'http://localhost:20128/v1' },
  { key: 'api_key', label: 'API key', type: 'password', full: true, help: 'Kosongkan bila tidak ingin mengganti.' },
  { key: 'model', label: 'Model', required: true, placeholder: 'nama model' },
  { key: 'temperature', label: 'Temperature', type: 'number', step: '0.1', default: 0.8 },
  { key: 'max_tokens', label: 'Max tokens', type: 'number', default: 400 },
  { key: 'is_default', label: 'Jadikan default', type: 'checkbox' },
];

pages.providers = async (main) => {
  if (!state.presets.length) state.presets = await api('/presets');
  main.innerHTML = `
    <div class="page-head"><div><h1>AI Provider</h1><p class="muted">9router, OpenRouter, OpenAI, Claude, Gemini, Ollama, atau endpoint OpenAI-compatible lain</p></div>
      <button class="btn primary" id="addProvider">+ Provider baru</button></div>
    ${state.providers.map((p) => `<div class="card"><div class="item">
      <div><h3>${esc(p.name)} ${p.is_default ? '<span class="badge ok">default</span>' : ''}</h3>
        <div class="kv"><span>Model: <b>${esc(p.model)}</b></span><span>URL: <b class="mono">${esc(p.base_url)}</b></span><span>Key: <b>${p.has_key ? esc(p.api_key_masked) : '—'}</b></span><span>Format: <b>${esc(p.kind)}</b></span></div>
        <div class="sub muted" id="ptest-${p.id}"></div></div>
      <div class="row-actions">
        <button class="btn small" data-test-provider="${p.id}">Tes</button>
        <button class="btn small" data-edit-provider="${p.id}">Edit</button>
        <button class="btn small danger" data-del-provider="${p.id}">Hapus</button>
      </div></div></div>`).join('') || '<div class="card empty">Belum ada provider</div>'}`;
  $('#addProvider').onclick = () => editProvider(null);
  $$('[data-edit-provider]', main).forEach((b) => { b.onclick = () => editProvider(Number(b.dataset.editProvider)); });
  $$('[data-test-provider]', main).forEach((b) => { b.onclick = () => withBusy(b, async () => {
    const r = await api(`/providers/${b.dataset.testProvider}/test`, { method: 'POST' });
    $(`#ptest-${b.dataset.testProvider}`).innerHTML = `<span class="badge ok">OK ${r.ms} ms</span> ${esc(r.reply)}`;
  }); });
  $$('[data-del-provider]', main).forEach((b) => { b.onclick = async () => {
    if (!confirm('Hapus provider ini?')) return;
    await api(`/providers/${b.dataset.delProvider}`, { method: 'DELETE' });
    await loadRefs(); render();
  }; });
};

function editProvider(id) {
  const p = id ? state.providers.find((x) => x.id === id) : { kind: 'openai', ...state.presets[0], name: state.presets[0]?.label };
  const presetSelect = id ? '' : `<label class="field" style="margin-bottom:12px">Preset
    <select id="presetSel">${state.presets.map((x, i) => `<option value="${i}">${esc(x.label)}</option>`).join('')}</select>
    <span class="help" id="presetHint">${esc(state.presets[0]?.hint || '')}</span></label>`;
  openForm({
    title: id ? `Edit provider: ${p.name}` : 'Provider baru',
    fields: PROVIDER_FIELDS,
    values: p,
    extraHtml: presetSelect,
    onMount: (body) => {
      const sel = $('#presetSel', body);
      if (!sel) return;
      sel.onchange = () => {
        const x = state.presets[Number(sel.value)];
        $('[name=name]', body).value = x.label.replace(/\s*\(.*\)/, '');
        $('[name=kind]', body).value = x.kind;
        $('[name=base_url]', body).value = x.base_url;
        $('[name=model]', body).value = x.model;
        $('#presetHint', body).textContent = x.hint || '';
      };
    },
    onSubmit: async (v) => {
      if (id) await api(`/providers/${id}`, { method: 'PUT', body: v });
      else await api('/providers', { method: 'POST', body: v });
      toast('Provider disimpan');
      await loadRefs(); render();
    },
  });
}

// ---------- persona ----------
pages.persona = async (main) => {
  const p = await api('/persona');
  let tab = sessionStorage.getItem('personaTab') || 'soul';
  main.innerHTML = `
    <div class="page-head"><div><h1>Soul &amp; Memory</h1><p class="muted">Kepribadian & pengetahuan AI saat menulis komentar (global; bisa di-override per akun)</p></div>
      <button class="btn primary" id="savePersona">Simpan</button></div>
    <div class="tabs"><button class="btn" data-tab="soul">soul.md</button><button class="btn" data-tab="memory">memory.md</button></div>
    <div class="card">
      <p class="muted" id="personaHelp"></p>
      <textarea class="editor" id="ed-soul">${esc(p.soul)}</textarea>
      <textarea class="editor" id="ed-memory">${esc(p.memory)}</textarea>
    </div>`;
  const helps = {
    soul: '<b>soul.md</b> — siapa "kamu": kepribadian, gaya bahasa, nada, panjang komentar, batasan. Dipakai sebagai system prompt.',
    memory: '<b>memory.md</b> — fakta yang boleh dipakai AI: info tentang kamu/bisnis kamu, produk, lokasi, harga, FAQ, hal yang harus/tidak boleh disebut.',
  };
  const show = (t) => {
    tab = t; sessionStorage.setItem('personaTab', t);
    $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $('#ed-soul').classList.toggle('hidden', t !== 'soul');
    $('#ed-memory').classList.toggle('hidden', t !== 'memory');
    $('#personaHelp').innerHTML = helps[t];
  };
  $$('[data-tab]').forEach((b) => { b.onclick = () => show(b.dataset.tab); });
  show(tab);
  $('#savePersona').onclick = (ev) => withBusy(ev.currentTarget, async () => {
    await api('/persona', { method: 'PUT', body: { soul: $('#ed-soul').value, memory: $('#ed-memory').value } });
    toast('soul.md & memory.md disimpan');
  });
};

// ---------- history ----------
pages.history = async (main) => {
  const params = new URLSearchParams(sessionStorage.getItem('histFilter') || '');
  const rows = await api(`/actions?limit=300&${params}`);
  main.innerHTML = `
    <div class="page-head"><div><h1>Riwayat</h1><p class="muted">Semua komentar & balasan yang dibuat</p></div>
      <div class="row-actions">
        <select id="fStatus"><option value="">Semua status</option><option value="sent">Terkirim</option><option value="failed">Gagal</option><option value="dry_run">Dry-run</option><option value="skipped">Skip</option></select>
        <select id="fKind"><option value="">Semua jenis</option><option value="comment">Komentar (trigger)</option><option value="reply">Balas komentar</option></select>
      </div></div>
    <div class="card">${actionsTable(rows)}</div>`;
  $('#fStatus').value = params.get('status') || '';
  $('#fKind').value = params.get('kind') || '';
  const onF = () => {
    const p = new URLSearchParams();
    if ($('#fStatus').value) p.set('status', $('#fStatus').value);
    if ($('#fKind').value) p.set('kind', $('#fKind').value);
    sessionStorage.setItem('histFilter', p.toString());
    render();
  };
  $('#fStatus').onchange = onF; $('#fKind').onchange = onF;
};

// ---------- settings ----------
const SETTINGS_FIELDS = [
  { key: 'active_start', label: 'Jam aktif default — mulai', type: 'time', help: 'Dipakai trigger & balas komentar yang memilih "Ikuti default"' },
  { key: 'active_end', label: 'Jam aktif default — selesai', type: 'time', help: 'Mulai = selesai berarti 24 jam. Bisa lewat tengah malam (mis. 20:00–02:00).' },
  { key: 'timezone', label: 'Zona waktu', type: 'select', options: [['Asia/Jakarta', 'WIB (Asia/Jakarta)'], ['Asia/Makassar', 'WITA (Asia/Makassar)'], ['Asia/Jayapura', 'WIT (Asia/Jayapura)'], ['UTC', 'UTC']] },
  { key: 'max_chars', label: 'Panjang maksimal komentar (karakter)', type: 'number', help: 'Threads membatasi 500 karakter' },
  { key: 'delay_min_seconds', label: 'Jeda antar komentar minimal (detik)', type: 'number' },
  { key: 'delay_max_seconds', label: 'Jeda antar komentar maksimal (detik)', type: 'number' },
  { key: 'skip_sensitive', label: 'AI melewati postingan sensitif (duka, SARA, politik, dewasa)', type: 'checkbox', full: true },
];

pages.settings = async (main) => {
  const s = state.settings;
  main.innerHTML = `
    <div class="page-head"><div><h1>Pengaturan</h1></div><button class="btn primary" id="saveSettings">Simpan</button></div>
    <div class="card"><div class="form" id="settingsForm">${SETTINGS_FIELDS.map((f) => fieldHtml(f, typeof s[f.key] === 'boolean' ? (s[f.key] ? 1 : 0) : s[f.key])).join('')}</div></div>`;
  $('#saveSettings').onclick = (ev) => withBusy(ev.currentTarget, async () => {
    const v = readForm(SETTINGS_FIELDS, $('#settingsForm'));
    v.skip_sensitive = Boolean(v.skip_sensitive);
    state.settings = await api('/settings', { method: 'PUT', body: v });
    toast('Pengaturan disimpan');
  });
};

// ================= router & boot =================
async function render() {
  clearTimeout(refreshTimer);
  const page = location.hash.slice(1) || 'dashboard';
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  const main = $('#main');
  try {
    await (pages[page] || pages.dashboard)(main);
  } catch (e) {
    if (e.message !== 'Belum login') main.innerHTML = `<div class="card"><p class="error">${esc(e.message)}</p></div>`;
  }
}

function updatePauseBtn() {
  const b = $('#pauseBtn');
  b.textContent = state.settings.paused ? '▶ Lanjutkan' : '⏸ Pause semua';
  b.classList.toggle('warn', Boolean(state.settings.paused));
}

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginPassword').focus();
}

async function boot() {
  try {
    await api('/me');
  } catch { showLogin(); return; }
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadRefs();
  render();
}

$('#loginForm').onsubmit = async (ev) => {
  ev.preventDefault();
  try {
    await api('/login', { method: 'POST', body: { password: $('#loginPassword').value } });
    $('#loginError').textContent = '';
    boot();
  } catch (e) { $('#loginError').textContent = e.message; }
};
$('#logoutBtn').onclick = async () => { await api('/logout', { method: 'POST' }); showLogin(); };
$('#pauseBtn').onclick = async () => {
  state.settings = await api('/settings', { method: 'PUT', body: { paused: !state.settings.paused } });
  updatePauseBtn();
  toast(state.settings.paused ? 'Semua aksi otomatis di-pause' : 'Aksi otomatis dilanjutkan');
  render();
};
window.addEventListener('hashchange', render);
boot();
