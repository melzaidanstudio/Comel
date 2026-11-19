import { test } from 'node:test';
import assert from 'node:assert/strict';
import { languageFilter, parseLangList, wordsOf } from '../src/lib/lang';

// Sebagian besar diambil dari hasil pencarian Threads asli lewat Repliz (Nov 2026).
const INDONESIAN = [
  'Ada yang tau tempat makan enak di Bogor yang buka sampe malem? Lagi laper banget nih',
  'Kenapa ya tiap gajian langsung habis buat checkout shopee wkwkwk',
  'Selamat pagi semuanya, semoga hari ini lancar rezekinya',
  'Info loker Bogor terbaru, kirim CV ke email di bio',
  'Scroll drama FOMO tiap hari kuat 3 jam, giliran disuruh konsisten ngetik buat affiliate 15 menit aja bilangnya capek. https://lynk.id/x',
  'Hadir udh 9th usaha pizza n masih tetap jualan walaupun via online aj.. in this economi pembeli agak berkurang tapi tetap semangat',
  'INFO HARIANKRIPTO JUST IN: Kepala IMF memperingatkan bahwa meningkatnya permintaan terhadap AI berpotensi mendorong kenaikan suku bunga global.',
  'Permisi min 🙏 WTS !! Ready Stock, trusted 101% Order Tanya stock ready',
  'Honestly this place is so good, harganya juga affordable banget',
  // jualan UMKM campur Inggris, dulu salah dibaca sebagai bahasa Inggris (preview trigger asli, Nov 2026)
  'Alhamdulillah sold out harga agen',
  'In this economy mentai hrg 35k dibalikpapan',
  'Spill supplier tangan pertama untuk custom hardbox premium souvenir/hampers',
  'hii guyss! sesama business owner mutualan yukk di threads and instagram',
  'Mom, please recommend pompa asi handsfree yang gk berisik under 1jt 🙏🏻',
  'MOMS! Minta Rekomendasi swaddle newborn for baby boyy',
  'Body and Hair Wash no SLS, no parfum/fragrance merk apa ajaa Bu?',
  'WARGAAAA BLOK M, THIS IS FOR YOU!! Lady Bug is officially opening tomorrow',
  'CALLING OUT SURABAYA TIMURR PEOPLEE‼️ ES GABIN 11 RIBU??!!! READY JUMAT 20/11',
  'Happy bgt nyobain bikin new menu salt bread yaitu cheese garlic',
  'Sunco nya qaqa',
];
const MALAY = [
  'Hiii korang !! New affiliate heree 🙋🏻‍♀️ . . Jom follow saya',
  'Dah 2 pagi ni baru performance updated. Boleh check dah',
];
const OTHER: Array<[string, string]> = [
  ['en', 'Check out Multi-Purpose 3 Tier Plastic Trolley Utility Cart for RM43.08. Get it on Shopee now! https://s.shopee.com.my/x'],
  ['en', 'Registered nurses at the hospital voted decisively to join the union, an affiliate of National Nurses United.'],
  ['en', 'Does anyone know a good place to eat in Bogor that is open late at night?'],
  ['vi', 'Giới thiệu tiện ích mở rộng Chrome mang tên Mobile View giúp kiểm tra độ tương thích giao diện website trên nhiều màn hình'],
  ['pt', 'Muito além de proteger contra os raios UV, o novo protetor solar aposta em uma fórmula poderosa com hidratação prolongada!'],
  ['es', '¿Sabes para que sirve el tónico Facial? Quédate que te lo cuento #skincare'],
  ['ru', 'Вашей команде нужен BUSINESS ENGLISH! Профессиональные истории, ролевые игры и практика реальных рабочих ситуаций.'],
  ['ar', 'أكتب هذا في اي ذكاء صناعي حوّل حياتي لمسلسل، واختَر اسمه ونوعه وقصته ووصف شخصيتي'],
  ['tl', 'Sino dito ang may alam ng magandang kainan sa Manila?'],
];
// bahasa lain yang mirip/bercampur: harus tetap ditolak (bahasanya tidak diperiksa persis)
const OTHER_MIXED = [
  'OPEN NA PO ULIT KAMI TODAY! Beef Rice Bowl and Enoki Rice Bowl available',
  'Sino have okada here? Fast pay po pm lang',
  'Kalim-aw JAPANESE SWEET POTATO available po for everyone. We are open for orders',
  'ang lambooottttt!!! 8 each lang yannn?? Collecting orders for sunday and monday',
  'Dan and Ada went to the market this morning to buy fresh bread',
  'Andrew Yang said the economy is changing fast for small business owners',
  'Hey everyone, I am looking for someone experienced with Meta Ads to help me scale',
];
const TOO_SHORT =['Up', 'Fresh 🚬', 'mantap', 'https://affiliate.meesho.com/collection/abc', ''];

test('parseLangList', () => {
  assert.deepEqual(parseLangList(''), []);
  assert.deepEqual(parseLangList('id'), ['id']);
  assert.deepEqual(parseLangList('id, en,ms'), ['id', 'en']); // Melayu digabung ke Indonesia
  assert.deepEqual(parseLangList('indonesia,xx1'), []);
});

test('wordsOf membuang link, mention, hashtag, angka & emoji', () => {
  assert.deepEqual(wordsOf('Cek @akun #promo 50% di https://x.co/a 🔥 mantap'), ['cek', 'di', 'mantap']);
});

test('tanpa filter bahasa', async () => {
  assert.equal(await languageFilter(''), null);
});

test('hanya bahasa Indonesia', async () => {
  const check = (await languageFilter('id'))!;
  for (const t of [...INDONESIAN, ...MALAY]) assert.equal(check(t).ok, true, t);
  for (const t of TOO_SHORT) assert.equal(check(t).ok, true, `pendek: ${t}`);
  for (const [lang, t] of OTHER) {
    const v = check(t);
    assert.equal(v.ok, false, t);
    assert.equal(v.lang, lang, t);
    assert.match(v.reason!, /bukan Indonesia$/);
  }
  for (const t of OTHER_MIXED) assert.equal(check(t).ok, false, t);
});

test('Indonesia & Inggris', async () => {
  const check = (await languageFilter('id,en'))!;
  for (const t of INDONESIAN) assert.equal(check(t).ok, true, t);
  for (const [lang, t] of OTHER) assert.equal(check(t).ok, lang === 'en', t);
  assert.equal(check(OTHER[3][1]).reason, 'bahasa Vietnam, bukan Indonesia/Inggris');
});
