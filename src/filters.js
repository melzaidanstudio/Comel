/**
 * Ekspresi kata kunci sederhana:
 *   kuliner AND (bogor OR "kota bogor") NOT promo
 * Operator: AND / OR / NOT (juga DAN / ATAU / BUKAN, &, |, -kata).
 * Dua kata yang berdampingan tanpa operator dianggap AND.
 */

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function tokenize(expr) {
  const tokens = [];
  const re = /(-?)"([^"]*)"|\(|\)|[^\s()"]+/g;
  let m;
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

/** Parse menjadi AST. Lempar Error dengan pesan yang jelas jika sintaks salah. */
export function parseExpr(expr) {
  const tokens = tokenize(expr);
  if (!tokens.length) return null;
  let i = 0;
  const peek = () => tokens[i];

  function parseOr() {
    let left = parseAnd();
    while (peek()?.t === 'OR') { i++; left = { op: 'OR', a: left, b: parseAnd() }; }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    for (;;) {
      const p = peek();
      if (p?.t === 'AND') { i++; left = { op: 'AND', a: left, b: parseNot() }; }
      else if (p && (p.t === 'term' || p.t === '(' || p.t === 'NOT')) { left = { op: 'AND', a: left, b: parseNot() }; }
      else break;
    }
    return left;
  }
  function parseNot() {
    if (peek()?.t === 'NOT') { i++; return { op: 'NOT', a: parseNot() }; }
    return parseAtom();
  }
  function parseAtom() {
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

export function evalExpr(ast, text) {
  if (!ast) return true;
  const hay = normalizeText(text);
  const ev = (n) => {
    switch (n.op) {
      case 'TERM': return hay.includes(n.v);
      case 'AND': return ev(n.a) && ev(n.b);
      case 'OR': return ev(n.a) || ev(n.b);
      case 'NOT': return !ev(n.a);
      default: return false;
    }
  };
  return ev(ast);
}

/** Kata-kata positif dari ekspresi (untuk query pencarian otomatis bila query kosong). */
export function positiveTerms(ast, neg = false, out = []) {
  if (!ast) return out;
  if (ast.op === 'TERM') { if (!neg) out.push(ast.v); }
  else if (ast.op === 'NOT') positiveTerms(ast.a, !neg, out);
  else { positiveTerms(ast.a, neg, out); positiveTerms(ast.b, neg, out); }
  return out;
}

/** "Kuliner Bogor", "#kulinerbogor", "kuliner-bogor" → "kulinerbogor" */
export function normTag(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export function parseTagList(s) {
  return String(s || '').split(/[,\n]/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean);
}

/** Apakah tag postingan cocok dengan salah satu tag di daftar. mode: exact | contains */
export function tagMatches(postTag, wanted, mode = 'exact') {
  if (!postTag) return false;
  const names = [normTag(postTag.name), normTag(postTag.display)].filter(Boolean);
  return wanted.map(normTag).filter(Boolean).some((w) => names.some((n) => (mode === 'contains' ? n.includes(w) : n === w)));
}

function splitList(s) {
  return String(s || '').split(/[,\n]/).map((x) => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
}

/**
 * Cek satu postingan terhadap filter trigger.
 * Return { ok: boolean, reason?: string }
 */
export function checkPost(post, trigger, { ast, now = Math.floor(Date.now() / 1000), ownUsername = '' } = {}) {
  if (ownUsername && post.username.toLowerCase() === ownUsername.toLowerCase()) return { ok: false, reason: 'postingan sendiri' };
  if (!trigger.include_replies && post.isReply) return { ok: false, reason: 'postingan berupa balasan' };

  const age = now - (post.takenAt || now);
  if (trigger.max_age_hours > 0 && age > trigger.max_age_hours * 3600) return { ok: false, reason: 'terlalu lama' };
  if (trigger.min_age_minutes > 0 && age < trigger.min_age_minutes * 60) return { ok: false, reason: 'terlalu baru' };

  const conds = [
    ['suka', post.likes, trigger.min_likes],
    ['balasan', post.replies, trigger.min_replies],
    ['repost', post.reposts, trigger.min_reposts],
    ['share', post.shares, trigger.min_shares],
    ['quote', post.quotes, trigger.min_quotes],
  ].filter(([, , min]) => Number(min) > 0);
  if (conds.length) {
    const pass = conds.map(([, val, min]) => val >= Number(min));
    const ok = trigger.metric_logic === 'any' ? pass.some(Boolean) : pass.every(Boolean);
    if (!ok) {
      const failed = conds.filter((_, idx) => !pass[idx]).map(([n, v, min]) => `${n} ${v}<${min}`);
      return { ok: false, reason: `viralitas kurang (${failed.join(', ')})` };
    }
  }

  const wantTags = parseTagList(trigger.topic_tags);
  if (wantTags.length && !tagMatches(post.tag, wantTags, trigger.tag_match)) {
    return { ok: false, reason: post.tag ? `tag "${post.tag.name}" tidak cocok` : 'tanpa topic tag' };
  }
  const exTags = parseTagList(trigger.exclude_tags);
  if (exTags.length && tagMatches(post.tag, exTags, trigger.tag_match)) {
    return { ok: false, reason: `tag "${post.tag.name}" dihindari` };
  }

  const exUsers = splitList(trigger.exclude_users);
  if (exUsers.includes(post.username.toLowerCase())) return { ok: false, reason: 'user dikecualikan' };
  const text = normalizeText(post.text);
  const exWords = splitList(trigger.exclude_words).map(normalizeText);
  const hit = exWords.find((w) => text.includes(w));
  if (hit) return { ok: false, reason: `mengandung kata terlarang "${hit}"` };

  const tagText = post.tag ? ` #${post.tag.name} #${post.tag.display}` : '';
  if (ast && !evalExpr(ast, `${post.text} @${post.username}${tagText}`)) return { ok: false, reason: 'tidak cocok kata kunci' };
  return { ok: true };
}

export function engagementScore(p) {
  return p.likes + p.replies * 3 + p.reposts * 4 + p.shares * 2 + p.quotes * 4;
}
