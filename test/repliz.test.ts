import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentToPost, missingKeysMessage, normalizeKeys } from '../src/lib/repliz';
import { checkPost, hasMetricFilter } from '../src/lib/filters';

test('contentToPost: objek konten Repliz → Post', () => {
  const p = contentToPost({
    id: '18082157540400777',
    description: 'Ada rekomendasi kopi enak di Bogor?',
    topic: 'Kuliner Bogor',
    type: 'text',
    owner: { id: '', name: 'kopilover', picture: '' },
    url: 'https://www.threads.com/@kopilover/post/DfmMobMz8kB',
    createdAt: '2026-11-18T07:58:00.000Z',
  });
  assert.equal(p.contentId, '18082157540400777');
  assert.equal(p.username, 'kopilover');
  assert.equal(p.code, 'DfmMobMz8kB');
  assert.equal(p.tag?.name, 'Kuliner Bogor');
  assert.equal(p.takenAt, Math.floor(Date.parse('2026-11-18T07:58:00.000Z') / 1000));
  assert.equal(p.isReply, false);
  assert.equal(p.likes, 0);
});

test('contentToPost: link threads.net, lampiran teks, dan balasan', () => {
  const p = contentToPost({
    id: '1', description: 'utama', textAttachment: { text: 'artikel panjang' },
    owner: { name: 'fallback' }, url: 'https://www.threads.net/@asli/post/ABC?x=1', reply: { id: '9' },
  });
  assert.equal(p.username, 'asli');
  assert.equal(p.code, 'ABC');
  assert.equal(p.text, 'utama\n\nartikel panjang');
  assert.equal(p.isReply, true);
  assert.equal(contentToPost({ id: '7', owner: { name: 'tanpa_url' } }).username, 'tanpa_url');
});

test('skipMetrics: tahap 1 mengabaikan syarat viral, tahap 2 menerapkannya', () => {
  const now = Math.floor(Date.now() / 1000);
  const post = contentToPost({ id: '1', description: 'kuliner bogor', url: 'https://www.threads.com/@a/post/X', createdAt: new Date().toISOString() });
  const f = { minLikes: 100, metricLogic: 'all' };
  assert.equal(hasMetricFilter(f), true);
  assert.equal(hasMetricFilter({ minLikes: 0 }), false);
  assert.equal(checkPost(post, f, { now, skipMetrics: true }).ok, true);
  assert.equal(checkPost(post, f, { now }).ok, false);
  assert.equal(checkPost({ ...post, likes: 150 }, f, { now }).ok, true);
});

test('normalizeKeys: format AccessKey:SecretKey di satu kolom dipecah', () => {
  assert.deepEqual(normalizeKeys(' AK123:SK456 ', ''), { accessKey: 'AK123', secretKey: 'SK456' });
  assert.deepEqual(normalizeKeys('', 'AK123:SK456'), { accessKey: 'AK123', secretKey: 'SK456' });
  assert.deepEqual(normalizeKeys('AK123', ' SK456 '), { accessKey: 'AK123', secretKey: 'SK456' });
  assert.deepEqual(normalizeKeys('AK123', undefined), { accessKey: 'AK123', secretKey: '' });
});

test('missingKeysMessage menyebut kunci yang kosong', () => {
  assert.match(missingKeysMessage({ accessKey: 'AK', secretKey: '' }), /Secret Key belum tersimpan/);
  assert.equal(missingKeysMessage({ accessKey: 'AK', secretKey: 'SK' }), '');
});
