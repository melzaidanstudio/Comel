/**
 * Filter bahasa postingan.
 *
 * Repliz/Threads tidak memberi bahasa maupun negara postingan, jadi bahasa ditebak dari teksnya:
 * kata khas Indonesia/Melayu (termasuk bahasa gaul) + detektor n-gram `tinyld`.
 * Sengaja longgar: postingan hanya ditolak bila bahasanya jelas lain. Teks pendek, hanya link/emoji,
 * atau yang meragukan tetap lolos.
 *
 * Modul ini khusus server: `tinyld` memakai ±20 MB memori, jadi baru dimuat saat ada trigger yang memakainya.
 */
type DetectAll = (text: string) => { lang: string; accuracy: number }[];

/** Bahasa Melayu hampir tidak bisa dibedakan dari bahasa Indonesia, jadi dianggap satu kelompok. */
const SAME: Record<string, string> = { ms: 'id' };
const group = (lang: string) => SAME[lang] || lang;

const NAMES: Record<string, string> = {
  id: 'Indonesia', ms: 'Melayu', en: 'Inggris', jv: 'Jawa', su: 'Sunda', tl: 'Tagalog', vi: 'Vietnam', th: 'Thai',
  es: 'Spanyol', pt: 'Portugis', fr: 'Prancis', de: 'Jerman', it: 'Italia', nl: 'Belanda', tr: 'Turki', ru: 'Rusia',
  ar: 'Arab', hi: 'Hindi', ja: 'Jepang', ko: 'Korea', zh: 'Mandarin',
};
export const langName = (code: string) => NAMES[code] || code;

/** "id, en" → ["id", "en"] (kode ISO 639-1; "ms" digabung ke "id"). */
export function parseLangList(s: string | null | undefined): string[] {
  const codes = String(s || '').toLowerCase().split(/[,\s]+/).filter((x) => /^[a-z]{2}$/.test(x)).map(group);
  return [...new Set(codes)];
}

/**
 * Kata yang sangat khas bahasa Indonesia/Melayu, termasuk singkatan & gaul. Kata yang juga umum di
 * bahasa lain sengaja tidak dipakai (mis. "di" Italia, "ya" Spanyol, "dia"/"mau" Portugis, "lagi"/"kami" Tagalog).
 */
const ID_WORDS = new Set(`
  yang dan dari ini itu ada tidak gak ga nggak enggak engga aja saja banget dong sih nih deh kok lho loh
  gue gw aku kamu kalian kita mereka buat untuk utk juga tapi tetapi udah udh sudah sdh bisa apa gimana bagaimana
  kenapa mengapa kalau kalo karena krn akan dengan dgn tau tahu orang banyak emang memang yg jadi jd biar cuma
  lebih belum masih harus pengen ingin nya dulu semua permisi tanya makasih terima kasih mohon silakan silahkan
  kak kakak bang gan sis min bun bunda
  tak boleh kat dah nak sangat jom korang ni
`.trim().split(/\s+/));
const LAUGH = /^(wk|kw){2,}/; // wkwk, wkwkwk, kwkw

/** Buang link, mention, hashtag, angka & emoji agar detektor hanya membaca kata. */
export function wordsOf(text: string): string[] {
  return text.toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[@#][\p{L}\p{N}_.]+/gu, ' ')
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => /\p{L}{2,}/u.test(w));
}

const MIN_WORDS = 3; // kurang dari ini → terlalu pendek untuk ditebak, diloloskan
const MIN_ID_WORDS = 2; // ≥ 2 kata khas Indonesia berbeda → dianggap berbahasa Indonesia
const ALT_ACCURACY = 0.25; // bahasa target muncul sebagai kandidat kedua dengan skor ≥ ini → diloloskan

export type LangVerdict = { ok: boolean; lang: string | null; reason?: string };

export function judgeLanguage(text: string, wanted: string[], detectAll: DetectAll): LangVerdict {
  if (!wanted.length) return { ok: true, lang: null };
  const words = wordsOf(text || '');
  if (words.length < MIN_WORDS) return { ok: true, lang: null };

  if (wanted.includes('id')) {
    const hits = new Set(words.filter((w) => ID_WORDS.has(w) || LAUGH.test(w)));
    if (hits.size >= MIN_ID_WORDS) return { ok: true, lang: 'id' };
  }

  let all: { lang: string; accuracy: number }[];
  try { all = detectAll(words.join(' ')); } catch { return { ok: true, lang: null }; }
  if (!all.length) return { ok: true, lang: null };

  const top = group(all[0].lang);
  if (wanted.includes(top)) return { ok: true, lang: top };
  const alt = all.find((x) => wanted.includes(group(x.lang)) && x.accuracy >= ALT_ACCURACY);
  if (alt) return { ok: true, lang: group(alt.lang) };
  return { ok: false, lang: top, reason: `bahasa ${langName(top)}, bukan ${wanted.map(langName).join('/')}` };
}

let detector: Promise<DetectAll> | null = null;

/** Pemeriksa bahasa untuk satu trigger; null bila trigger tidak menyaring bahasa. */
export async function languageFilter(spec: string | null | undefined): Promise<((text: string) => LangVerdict) | null> {
  const wanted = parseLangList(spec);
  if (!wanted.length) return null;
  detector ??= import('tinyld').then((m) => (text: string) => m.detectAll(text));
  const detectAll = await detector;
  return (text) => judgeLanguage(text, wanted, detectAll);
}
