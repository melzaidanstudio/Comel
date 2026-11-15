import { asc, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { providers, type Provider } from './db/schema';
import { getSettings } from './settings';
import type { Post } from './types';

export type ProviderPreset = { label: string; kind: 'openai' | 'anthropic'; baseUrl: string; model: string; hint?: string };

/** Semua kecuali anthropic memakai format OpenAI /chat/completions. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { label: '9router (lokal)', kind: 'openai', baseUrl: 'http://localhost:20128/v1', model: '', hint: 'Salin API key & nama model dari dashboard 9router (http://localhost:20128/dashboard). Jika Comel jalan di Docker, ganti localhost dengan host.docker.internal.' },
  { label: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5' },
  { label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5' },
  { label: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { label: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Ollama (lokal)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  { label: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: '', model: '' },
];

export async function resolveProvider(...ids: Array<number | null | undefined>): Promise<Provider> {
  for (const id of ids) {
    if (!id) continue;
    const [p] = await db.select().from(providers).where(eq(providers.id, id));
    if (p) return p;
  }
  const [def] = await db.select().from(providers).orderBy(desc(providers.isDefault), asc(providers.id)).limit(1);
  if (!def) throw new Error('Belum ada AI provider. Tambahkan di menu "AI Provider".');
  return def;
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 90_000) {
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
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text.slice(0, 300);
      throw new Error(`AI provider HTTP ${res.status}: ${msg}`);
    }
    if (!json) throw new Error(`Respons AI bukan JSON: ${text.slice(0, 200)}`);
    return json;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('AI provider timeout');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function chat(p: Provider, messages: Msg[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const base = p.baseUrl.replace(/\/+$/, '');
  const temperature = opts.temperature ?? p.temperature ?? 0.8;
  const maxTokens = opts.maxTokens ?? p.maxTokens ?? 400;

  if (p.kind === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const json = await postJson(`${base}/messages`, { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' },
      { model: p.model, system, messages: rest, max_tokens: maxTokens, temperature });
    return (json.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim();
  }

  const headers: Record<string, string> = {};
  if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
  const json = await postJson(`${base}/chat/completions`, headers, {
    model: p.model, messages, temperature, max_tokens: maxTokens, stream: false,
  });
  const content = json.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((c: { text?: string }) => c.text || '').join('') : (content || '');
  return String(text).trim();
}

/** Buang blok <think>, label "Balasan:", tanda kutip pembungkus; potong ke maxChars. */
export function cleanReply(text: string, maxChars: number): string {
  let t = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(balasan|komentar|reply|jawaban)\s*:\s*/i, '')
    .trim();
  if (/^["“'].*["”']$/s.test(t)) t = t.slice(1, -1).trim().replace(/^(balasan|komentar|reply|jawaban)\s*:\s*/i, '');
  if (/^SKIP\b/i.test(t)) return 'SKIP';
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '');
  }
  return t;
}

function fmtAge(sec: number) {
  const h = sec / 3600;
  if (h < 1) return `${Math.round(sec / 60)} menit`;
  if (h < 48) return `${Math.round(h)} jam`;
  return `${Math.round(h / 24)} hari`;
}

type GenerateInput = {
  provider: Provider;
  persona: { soul: string; memory: string };
  kind: 'comment' | 'reply';
  post: Pick<Post, 'username' | 'text' | 'takenAt' | 'likes' | 'replies' | 'reposts' | 'shares'> & { tag?: Post['tag'] };
  instruction?: string;
  recentTexts?: string[];
  context?: { label: string; parentText?: string } | null;
};

export async function generateReply({ provider, persona, kind, post, instruction, recentTexts = [], context = null }: GenerateInput) {
  const settings = await getSettings();
  const maxChars = Math.min(500, Number(settings.maxChars) || 280);
  const noun = kind === 'reply' ? 'balasan' : 'komentar';

  const system = [
    persona.soul,
    persona.memory ? `\n---\n## Memori (fakta yang kamu ketahui)\n${persona.memory}` : '',
    `\n---\n## Aturan output
- Tulis HANYA teks ${noun} yang akan diposting di Threads, tanpa pembuka, tanpa tanda kutip.
- Maksimal ${maxChars} karakter.
- Gunakan bahasa yang sama dengan postingan kecuali instruksi berkata lain.
- Jangan mengulang kalimat yang mirip dengan komentar-komentar kamu sebelumnya.`,
    settings.skipSensitive
      ? '- Jika postingan tidak relevan dengan instruksi, berisi duka/musibah, ujaran kebencian, konten dewasa, atau topik sensitif (politik/SARA), jawab persis: SKIP'
      : '- Jika postingan sama sekali tidak relevan dengan instruksi, jawab persis: SKIP',
  ].join('\n');

  const now = Math.floor(Date.now() / 1000);
  const lines: string[] = [];
  if (instruction) lines.push(`Instruksi:\n${instruction}\n`);
  if (kind === 'reply' && context) {
    lines.push(`Konteks: ini adalah ${context.label}.`);
    if (context.parentText) lines.push(`Teks milik kamu yang dibalas orang:\n"""${context.parentText}"""\n`);
  }
  lines.push(`${kind === 'reply' ? 'Komentar dari' : 'Postingan oleh'} @${post.username}${post.takenAt ? ` (${fmtAge(now - post.takenAt)} lalu)` : ''}${post.tag ? ` [topic tag: ${post.tag.name}]` : ''}:`);
  lines.push(`"""${post.text || '(tanpa teks)'}"""`);
  if (kind === 'comment') lines.push(`Statistik: ${post.likes} suka, ${post.replies} balasan, ${post.reposts} repost, ${post.shares} share.`);
  if (recentTexts.length) lines.push(`\nKomentar kamu sebelumnya (jangan diulang gayanya persis):\n${recentTexts.map((t) => `- ${t}`).join('\n')}`);
  lines.push(`\nTulis ${noun} kamu sekarang:`);

  const raw = await chat(provider, [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n') }]);
  return cleanReply(raw, maxChars);
}
