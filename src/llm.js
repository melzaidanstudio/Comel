import { db, getById, getSettings } from './db.js';

/** Preset yang ditampilkan di UI. Semua kecuali anthropic memakai format OpenAI /chat/completions. */
export const PROVIDER_PRESETS = [
  { label: '9router (lokal)', kind: 'openai', base_url: 'http://localhost:20128/v1', model: '', hint: 'Salin API key & nama model dari dashboard 9router (http://localhost:20128/dashboard). Jika Comel jalan di Docker, ganti localhost dengan host.docker.internal.' },
  { label: 'OpenRouter', kind: 'openai', base_url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5' },
  { label: 'OpenAI', kind: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Anthropic (Claude)', kind: 'anthropic', base_url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5' },
  { label: 'Google Gemini', kind: 'openai', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { label: 'Groq', kind: 'openai', base_url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'DeepSeek', kind: 'openai', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Ollama (lokal)', kind: 'openai', base_url: 'http://localhost:11434/v1', model: 'llama3.1' },
  { label: 'Custom (OpenAI-compatible)', kind: 'openai', base_url: '', model: '' },
];

export function resolveProvider(...ids) {
  for (const id of ids) {
    if (id) {
      const p = getById('providers', id);
      if (p) return p;
    }
  }
  const def = db.prepare('SELECT * FROM providers ORDER BY is_default DESC, id ASC LIMIT 1').get();
  if (!def) throw new Error('Belum ada AI provider. Tambahkan di menu "AI Provider".');
  return def;
}

async function postJson(url, headers, body, timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text.slice(0, 300);
      throw new Error(`AI provider HTTP ${res.status}: ${msg}`);
    }
    if (!json) throw new Error(`Respons AI bukan JSON: ${text.slice(0, 200)}`);
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('AI provider timeout');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Kirim chat ke provider. messages: [{role:'system'|'user'|'assistant', content}] */
export async function chat(provider, messages, opts = {}) {
  const base = provider.base_url.replace(/\/+$/, '');
  const temperature = opts.temperature ?? provider.temperature ?? 0.8;
  const maxTokens = opts.max_tokens ?? provider.max_tokens ?? 400;

  if (provider.kind === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const json = await postJson(`${base}/messages`, {
      'x-api-key': provider.api_key,
      'anthropic-version': '2023-06-01',
    }, { model: provider.model, system, messages: rest, max_tokens: maxTokens, temperature });
    return (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  }

  const headers = {};
  if (provider.api_key) headers.authorization = `Bearer ${provider.api_key}`;
  const json = await postJson(`${base}/chat/completions`, headers, {
    model: provider.model, messages, temperature, max_tokens: maxTokens, stream: false,
  });
  const content = json.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((c) => c.text || '').join('') : (content || '');
  return text.trim();
}

/** Bersihkan output model: buang blok <think>, tanda kutip pembungkus, label "Balasan:". */
export function cleanReply(text, maxChars) {
  let t = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(balasan|komentar|reply|jawaban)\s*:\s*/i, '')
    .trim();
  if (/^["“'].*["”']$/s.test(t)) t = t.slice(1, -1).trim();
  if (/^SKIP\b/i.test(t)) return 'SKIP';
  if (t.length > maxChars) {
    // potong di batas kalimat/kata terdekat
    const cut = t.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '');
  }
  return t;
}

function fmtAge(sec) {
  const h = sec / 3600;
  if (h < 1) return `${Math.round(sec / 60)} menit`;
  if (h < 48) return `${Math.round(h)} jam`;
  return `${Math.round(h / 24)} hari`;
}

/**
 * Buat teks komentar/balasan.
 * kind: 'comment' (komentar ke postingan orang) | 'reply' (balas komentar orang di postingan/komentar kita)
 */
export async function generateReply({ provider, persona, kind, post, instruction, recentTexts = [], context = null }) {
  const settings = getSettings();
  const maxChars = Math.min(500, Number(settings.max_chars) || 280);

  const system = [
    persona.soul,
    persona.memory ? `\n---\n## Memori (fakta yang kamu ketahui)\n${persona.memory}` : '',
    `\n---\n## Aturan output
- Tulis HANYA teks ${kind === 'reply' ? 'balasan' : 'komentar'} yang akan diposting di Threads, tanpa pembuka, tanpa tanda kutip.
- Maksimal ${maxChars} karakter.
- Gunakan bahasa yang sama dengan postingan kecuali instruksi berkata lain.
- Jangan mengulang kalimat yang mirip dengan komentar-komentar kamu sebelumnya.`,
    settings.skip_sensitive
      ? `- Jika postingan tidak relevan dengan instruksi, berisi duka/musibah, ujaran kebencian, konten dewasa, atau topik sensitif (politik/SARA), jawab persis: SKIP`
      : `- Jika postingan sama sekali tidak relevan dengan instruksi, jawab persis: SKIP`,
  ].join('\n');

  const now = Math.floor(Date.now() / 1000);
  const lines = [];
  if (instruction) lines.push(`Instruksi:\n${instruction}\n`);
  if (kind === 'reply' && context) {
    lines.push(`Konteks: ini adalah ${context.label}.`);
    if (context.parentText) lines.push(`Teks milik kamu yang dibalas orang:\n"""${context.parentText}"""\n`);
  }
  lines.push(`${kind === 'reply' ? 'Komentar dari' : 'Postingan oleh'} @${post.username}${post.takenAt ? ` (${fmtAge(now - post.takenAt)} lalu)` : ''}:`);
  lines.push(`"""${post.text || '(tanpa teks)'}"""`);
  if (kind === 'comment') {
    lines.push(`Statistik: ${post.likes} suka, ${post.replies} balasan, ${post.reposts} repost, ${post.shares} share.`);
  }
  if (recentTexts.length) {
    lines.push(`\nKomentar kamu sebelumnya (jangan diulang gayanya persis):\n${recentTexts.map((t) => `- ${t}`).join('\n')}`);
  }
  lines.push(`\nTulis ${kind === 'reply' ? 'balasan' : 'komentar'} kamu sekarang:`);

  const raw = await chat(provider, [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ]);
  return cleanReply(raw, maxChars);
}
