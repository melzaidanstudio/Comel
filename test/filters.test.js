import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpr, evalExpr, checkPost, positiveTerms } from '../src/filters.js';

test('ekspresi boolean', () => {
  const ast = parseExpr('kuliner AND (bogor OR "kota hujan") -promo');
  assert.equal(evalExpr(ast, 'Kuliner enak di Bogor!'), true);
  assert.equal(evalExpr(ast, 'kuliner di kota hujan'), true);
  assert.equal(evalExpr(ast, 'kuliner jakarta'), false);
  assert.equal(evalExpr(ast, 'promo kuliner bogor'), false);
  assert.deepEqual(positiveTerms(ast), ['kuliner', 'bogor', 'kota hujan']);
});

test('operator bahasa Indonesia & implicit AND', () => {
  assert.equal(evalExpr(parseExpr('kuliner ATAU bogor'), 'jalan2 ke bogor'), true);
  assert.equal(evalExpr(parseExpr('kuliner bogor'), 'jalan2 ke bogor'), false);
  assert.equal(evalExpr(parseExpr('makan BUKAN diet'), 'makan siang diet'), false);
  assert.equal(parseExpr('   '), null);
  assert.throws(() => parseExpr('(kuliner OR bogor'), /Kurung/);
  assert.throws(() => parseExpr('kuliner OR'), /terpotong/);
});

const post = { username: 'a', text: 'Kuliner Bogor mantap', likes: 150, replies: 60, reposts: 10, shares: 55, quotes: 0, takenAt: Math.floor(Date.now()/1000) - 3600, isReply: false };
const trig = { min_likes: 100, min_replies: 50, min_shares: 50, metric_logic: 'all', max_age_hours: 24 };

test('filter viralitas & waktu', () => {
  assert.deepEqual(checkPost(post, trig, { ast: parseExpr('kuliner AND bogor') }), { ok: true });
  assert.equal(checkPost({ ...post, shares: 10 }, trig).ok, false);
  assert.equal(checkPost({ ...post, shares: 10 }, { ...trig, metric_logic: 'any' }).ok, true);
  assert.equal(checkPost({ ...post, takenAt: post.takenAt - 86400 * 2 }, trig).ok, false);
  assert.equal(checkPost(post, trig, { ownUsername: 'A' }).ok, false);
  assert.equal(checkPost({ ...post, isReply: true }, trig).ok, false);
  assert.equal(checkPost(post, { ...trig, exclude_words: 'mantap' }).ok, false);
});
