import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPost, evalExpr, parseExpr, positiveTerms, normTag, parseTagList, tagMatches } from '../src/lib/filters';
import type { Post } from '../src/lib/types';

const now = Math.floor(Date.now() / 1000);
const post = (p: Partial<Post> = {}): Post => ({
  code: 'x', pk: '', fbid: '', mediaId: '', username: 'a', userId: '', text: 'Kuliner Bogor mantap',
  likes: 150, replies: 60, reposts: 10, shares: 55, quotes: 0, takenAt: now - 3600, isReply: false,
  replyToUser: null, url: '', tag: null, ...p,
});

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

test('filter viralitas & waktu', () => {
  const f = { minLikes: 100, minReplies: 50, minShares: 50, metricLogic: 'all', maxAgeHours: 24 };
  assert.deepEqual(checkPost(post(), f, { ast: parseExpr('kuliner AND bogor') }), { ok: true });
  assert.equal(checkPost(post({ shares: 10 }), f).ok, false);
  assert.equal(checkPost(post({ shares: 10 }), { ...f, metricLogic: 'any' }).ok, true);
  assert.equal(checkPost(post({ takenAt: now - 86400 * 2 }), f).ok, false);
  assert.equal(checkPost(post(), f, { ownUsername: 'A' }).ok, false);
  assert.equal(checkPost(post({ isReply: true }), f).ok, false);
  assert.equal(checkPost(post(), { ...f, excludeWords: 'mantap' }).ok, false);
});

test('topic tag', () => {
  assert.equal(normTag('#Kuliner Bogor'), 'kulinerbogor');
  assert.deepEqual(parseTagList('#Kuliner Bogor, Food Threads\nBogor'), ['Kuliner Bogor', 'Food Threads', 'Bogor']);
  const tag = { id: '1', name: 'Kuliner Bogor', display: 'kulinerbogor', community: false };
  assert.equal(tagMatches(tag, ['kulinerbogor']), true);
  assert.equal(tagMatches(tag, ['bogor']), false);
  assert.equal(tagMatches(tag, ['bogor'], 'contains'), true);
  const f = { topicTags: 'Kuliner Bogor, Food Threads', tagMatch: 'exact' };
  assert.equal(checkPost(post({ tag: { ...tag, name: 'Food Threads', display: 'Food Threads' } }), f).ok, true);
  assert.equal(checkPost(post({ tag: { ...tag, name: 'Bogor', display: 'Bogor' } }), f).ok, false);
  assert.equal(checkPost(post({ tag: null }), f).reason, 'tanpa topic tag');
  assert.equal(checkPost(post({ tag: { ...tag, name: 'Politik', display: 'politik' } }), { excludeTags: 'politik' }).ok, false);
  assert.equal(checkPost(post({ text: 'enak', tag }), {}, { ast: parseExpr('"kuliner bogor"') }).ok, true);
});
