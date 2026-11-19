/**
 * "Rekomendasi" trigger — aturan yang terbukti menghasilkan kandidat pada data Threads asli
 * (simulasi kuliner Bogor, Nov 2026, lihat commit a90be38):
 *  - postingan niche lokal dalam 72 jam jarang lewat 20 suka → syarat viral ringan dengan logika ATAU;
 *  - pencarian Repliz longgar (kota lain ikut) → ekspresi teks wajib memuat kata utama;
 *  - topic tag beragam ("Kota Bogor", "BogoR Kuliner") → cocokkan "mengandung kata";
 *  - ditambah trigger "Komentator awal" tanpa syarat viral untuk postingan ≤ 24 jam.
 * Modul ini murni (tanpa DB) supaya bisa dipakai di form (pratinjau) dan di server.
 */

type TriggerLike = { name: string; queries: string[]; topicTags: string; matchExpr: string; excludeTags: string };

const STOP = new Set(['kuliner', 'makanan', 'jajanan', 'food', 'threads', 'kota', 'kabupaten', 'di', 'enak', 'viral', 'murah', 'the', 'dan']);
const FOOD = /kuliner|makan|jajan|food|resto|kafe|cafe|kopi|warung/i;
/** Kata yang menandakan iklan/lowongan/jual-beli — bukan postingan yang ingin dikomentari. */
const NOISE = ['loker', 'lowongan', 'dijual'];

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** Huruf besar di awal tiap kata (aman untuk huruf non-ASCII). */
export const title = (s: string) => s.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/** Tebak kata utama (biasanya lokasi) dari topic tag, kata pencarian, atau nama trigger: "Kuliner Bogor" → "bogor". */
export function guessKeyword(t: TriggerLike): string {
  const sources = [t.topicTags, ...t.queries, t.name];
  for (const src of sources) {
    const w = words(src || '').filter((x) => !STOP.has(x) && x.length > 2 && !/^\d+$/.test(x));
    if (w.length) return w[w.length - 1];
  }
  return '';
}

/** Kata yang menandakan postingan memang soal makanan (cocok sebagai awalan: "makan" ⊂ "makanan"). */
const FOOD_TERMS = ['kuliner', 'makan', 'jajan', 'kopi', 'resto', 'cafe', 'kafe', 'warung', 'enak', 'menu', 'kedai'];
export const isFood = (t: TriggerLike) => FOOD.test([t.name, t.topicTags, ...t.queries].join(' '));

/**
 * Ekspresi teks: wajib memuat kata utama, tanpa lowongan/jual-beli. Untuk tema kuliner juga wajib
 * memuat kata makanan — kalau tidak, "Bogor hujan guys" atau "CRV 2 Ciomas Bogor" ikut lolos.
 */
export function keywordExpr(kw: string, food = false) {
  // selalu dikutip: kata seperti "atau", "not", atau "-bogor" tetap dibaca sebagai kata, bukan operator
  const main = `"${kw.replace(/"/g, '')}"`;
  return [main, ...(food ? [`(${FOOD_TERMS.join(' OR ')})`] : []), ...NOISE.map((n) => `-${n}`)].join(' ');
}

/** Aturan untuk trigger yang sudah ada ("ramai"): hanya filter & jadwal yang diubah. */
export function viralRules(t: TriggerLike, kw: string) {
  const exclude = new Set(t.excludeTags.split(/[,\n]/).map((x) => x.trim()).filter(Boolean));
  exclude.add(`Loker ${title(kw)}`);
  return {
    topicTags: kw,
    tagMatch: 'contains' as const,
    tagAsSource: true,
    excludeTags: [...exclude].join(', '),
    matchExpr: keywordExpr(kw, isFood(t)),
    minLikes: 20, minReplies: 5, minReposts: 0, minShares: 0, minQuotes: 0, metricLogic: 'any' as const,
    maxAgeHours: 72, minAgeMinutes: 0, sortBy: 'newest' as const,
    actionsPerRun: 3, intervalMinutes: 15, authorCooldownHours: 168,
  };
}

/** Kata pencarian untuk "Komentator awal": kata pencarian trigger + variasi kuliner bila temanya kuliner. */
export function earlyQueries(t: TriggerLike, kw: string): string[] {
  const out = t.queries.map((q) => q.trim()).filter(Boolean);
  if (isFood(t)) out.push(`kuliner ${kw}`, `makanan ${kw}`, `jajanan ${kw}`);
  else if (!out.length) out.push(kw);
  return [...new Set(out.map((q) => q.toLowerCase()))].slice(0, 8);
}

/** Aturan trigger baru "Komentator awal": postingan baru (≤ 24 jam) tanpa syarat viral. */
export function earlyRules(t: TriggerLike, kw: string, queries: string[]) {
  return {
    name: `Komentator awal ${title(kw)}`.slice(0, 100),
    queries,
    topicTags: '',
    tagMatch: 'contains' as const,
    tagAsSource: false,
    excludeTags: '',
    matchExpr: keywordExpr(kw, isFood(t)),
    minLikes: 0, minReplies: 0, minReposts: 0, minShares: 0, minQuotes: 0, metricLogic: 'any' as const,
    maxAgeHours: 24, minAgeMinutes: 0, sortBy: 'newest' as const,
    actionsPerRun: 3, intervalMinutes: 15, authorCooldownHours: 168,
    dryRun: true, // selalu mulai dengan uji coba
  };
}

/** Minimal postingan yang dicek metrik viralnya per putaran (Pengaturan). */
export const RECOMMENDED_METRIC_LOOKUP = 30;

/** Trigger yang dibuat oleh rekomendasi "Komentator awal" (jangan buat salinannya lagi). */
export const isEarlyTrigger = (t: { name: string }) => /^komentator awal\b/i.test(t.name);
