/**
 * Ekspresi kata kunci:  kuliner AND (bogor OR "kota hujan") -promo
 * Operator: AND/DAN/&, OR/ATAU/|, NOT/BUKAN/TANPA atau -kata, kurung, "frasa".
 * Dua kata berdampingan = AND.
 */
import type { Post, PostTag } from './types';

type Token = { t: 'AND' | 'OR' | 'NOT' | '(' | ')' } | { t: 'term'; v: string };
export type Ast =
  | { op: 'TERM'; v: string }
  | { op: 'AND' | 'OR'; a: Ast; b: Ast }
  | { op: 'NOT'; a: Ast };

function normalizeText(s: string | null | undefined): string {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  const re = /(-?)"([^"]*)"|\(|\)|[^\s()"]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(expr || '')))) {
    const w = m[0];
    if (m[2] !== undefined) {
      if (m[1]) tokens.push({ t: 'NOT' });
      if (m[2].trim()) tokens.push({ t: 'term', v: m[2] });
    } else if (w === '(' || w === ')') {
      tokens.push({ t: w });
    } else {
      const up = w.toUpperCase();
      if (['AND', 'DAN', '&', '&&'].includes(up)) tokens.push({ t: 'AND' });
      else if (['OR', 'ATAU', '|', '||'].includes(up)) tokens.push({ t: 'OR' });
      else if (['NOT', 'BUKAN', 'TANPA'].includes(up)) tokens.push({ t: 'NOT' });
      else if (w.startsWith('-') && w.length > 1) { tokens.push({ t: 'NOT' }); tokens.push({ t: 'term', v: w.slice(1) }); }
      else tokens.push({ t: 'term', v: w });
    }
  }
  return tokens;
}

export function parseExpr(expr: string | null | undefined): Ast | null {
  const tokens = tokenize(expr || '');
  if (!tokens.length) return null;
  let i = 0;
  const peek = () => tokens[i];

  function parseOr(): Ast {
    let left = parseAnd();
    while (peek()?.t === 'OR') { i++; left = { op: 'OR', a: left, b: parseAnd() }; }
    return left;
  }
  function parseAnd(): Ast {
    let left = parseNot();
    for (;;) {
      const p = peek();
      if (p?.t === 'AND') { i++; left = { op: 'AND', a: left, b: parseNot() }; }
      else if (p && (p.t === 'term' || p.t === '(' || p.t === 'NOT')) left = { op: 'AND', a: left, b: parseNot() };
      else break;
    }
    return left;
  }
  function parseNot(): Ast {
    if (peek()?.t === 'NOT') { i++; return { op: 'NOT', a: parseNot() }; }
    return parseAtom();
  }
  function parseAtom(): Ast {
    const p = tokens[i++];
    if (!p) throw new Error('Ekspresi kata kunci terpotong di akhir');
    if (p.t === '(') {
      const e = parseOr();
      if (tokens[i++]?.t !== ')') throw new Error('Kurung tutup ")" hilang di ekspresi kata kunci');
      return e;
    }
    if (p.t === 'term') return { op: 'TERM', v: normalizeText(p.v) };
    throw new Error(`Posisi operator "${p.t}" tidak valid di ekspresi kata kunci`);
  }

  const ast = parseOr();
  if (i < tokens.length) throw new Error('Ada sisa token yang tidak terbaca di ekspresi kata kunci (cek tanda kurung)');
  return ast;
}

export function evalExpr(ast: Ast | null, text: string): boolean {
  if (!ast) return true;
  const hay = normalizeText(text);
  const ev = (n: Ast): boolean => {
    switch (n.op) {
      case 'TERM': return hay.includes(n.v);
      case 'AND': return ev(n.a) && ev(n.b);
      case 'OR': return ev(n.a) || ev(n.b);
      case 'NOT': return !ev(n.a);
    }
  };
  return ev(ast);
}

export function positiveTerms(ast: Ast | null, neg = false, out: string[] = []): string[] {
  if (!ast) return out;
  if (ast.op === 'TERM') { if (!neg) out.push(ast.v); }
  else if (ast.op === 'NOT') positiveTerms(ast.a, !neg, out);
  else { positiveTerms(ast.a, neg, out); positiveTerms(ast.b, neg, out); }
  return out;
}

// ---------- topic tag ----------
/** "Kuliner Bogor", "#kulinerbogor", "kuliner-bogor" → "kulinerbogor" */
export function normTag(s: string | null | undefined): string {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export function parseTagList(s: string | null | undefined): string[] {
  return String(s || '').split(/[,\n]/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean);
}

export function tagMatches(postTag: PostTag | null | undefined, wanted: string[], mode = 'exact'): boolean {
  if (!postTag) return false;
  const names = [normTag(postTag.name), normTag(postTag.display)].filter(Boolean);
  return wanted.map(normTag).filter(Boolean)
    .some((w) => names.some((n) => (mode === 'contains' ? n.includes(w) : n === w)));
}

function splitList(s: string | null | undefined): string[] {
  return String(s || '').split(/[,\n]/).map((x) => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
}

/** Bagian trigger yang dipakai untuk menyaring postingan. */
type PostFilter = Partial<{
  includeReplies: boolean;
  maxAgeHours: number;
  minAgeMinutes: number;
  minLikes: number;
  minReplies: number;
  minReposts: number;
  minShares: number;
  minQuotes: number;
  metricLogic: string;
  topicTags: string;
  excludeTags: string;
  tagMatch: string;
  excludeUsers: string;
  excludeWords: string;
}>;

export function checkPost(
  post: Post,
  f: PostFilter,
  { ast = null, now = Math.floor(Date.now() / 1000), ownUsername = '', skipMetrics = false }:
    { ast?: Ast | null; now?: number; ownUsername?: string; skipMetrics?: boolean } = {},
): { ok: boolean; reason?: string } {
  if (ownUsername && post.username.toLowerCase() === ownUsername.toLowerCase()) return { ok: false, reason: 'postingan sendiri' };
  if (!f.includeReplies && post.isReply) return { ok: false, reason: 'postingan berupa balasan' };

  const age = now - (post.takenAt || now);
  if ((f.maxAgeHours ?? 0) > 0 && age > f.maxAgeHours! * 3600) return { ok: false, reason: 'terlalu lama' };
  if ((f.minAgeMinutes ?? 0) > 0 && age < f.minAgeMinutes! * 60) return { ok: false, reason: 'terlalu baru' };

  const conds = ([
    ['suka', post.likes, f.minLikes],
    ['balasan', post.replies, f.minReplies],
    ['repost', post.reposts, f.minReposts],
    ['share', post.shares, f.minShares],
    ['quote', post.quotes, f.minQuotes],
  ] as const).filter(([, , min]) => Number(min) > 0);
  if (conds.length && !skipMetrics) {
    const pass = conds.map(([, val, min]) => val >= Number(min));
    const ok = f.metricLogic === 'any' ? pass.some(Boolean) : pass.every(Boolean);
    if (!ok) {
      const failed = conds.filter((_, idx) => !pass[idx]).map(([n, v, min]) => `${n} ${v}<${min}`);
      return { ok: false, reason: `viralitas kurang (${failed.join(', ')})` };
    }
  }

  const wantTags = parseTagList(f.topicTags);
  if (wantTags.length && !tagMatches(post.tag, wantTags, f.tagMatch)) {
    return { ok: false, reason: post.tag ? `tag "${post.tag.name}" tidak cocok` : 'tanpa topic tag' };
  }
  const exTags = parseTagList(f.excludeTags);
  if (exTags.length && post.tag && tagMatches(post.tag, exTags, f.tagMatch)) {
    return { ok: false, reason: `tag "${post.tag.name}" dihindari` };
  }

  if (splitList(f.excludeUsers).includes(post.username.toLowerCase())) return { ok: false, reason: 'user dikecualikan' };
  const text = normalizeText(post.text);
  const hit = splitList(f.excludeWords).map(normalizeText).find((w) => text.includes(w));
  if (hit) return { ok: false, reason: `mengandung kata terlarang "${hit}"` };

  const tagText = post.tag ? ` #${post.tag.name} #${post.tag.display}` : '';
  if (ast && !evalExpr(ast, `${post.text} @${post.username}${tagText}`)) return { ok: false, reason: 'tidak cocok kata kunci' };
  return { ok: true };
}

export function hasMetricFilter(f: PostFilter): boolean {
  return [f.minLikes, f.minReplies, f.minReposts, f.minShares, f.minQuotes].some((v) => Number(v) > 0);
}

export function engagementScore(p: Post): number {
  return p.likes + p.replies * 3 + p.reposts * 4 + p.shares * 2 + p.quotes * 4;
}
