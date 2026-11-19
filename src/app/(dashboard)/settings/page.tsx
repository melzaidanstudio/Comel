'use client';

import { useState } from 'react';
import { Copy, FlaskConical, KeyRound, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Pill } from '@/components/app/common';
import { Field, NumberField, Section, SelectField, SwitchField, TextField } from '@/components/app/fields';
import type { AppSettings, ReplizStatus } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ago, api, useAction, useApi } from '@/lib/client';

type TestResult = { name: string; plan: string; expiredAt: string | null; isGold: boolean; threadsAccounts: number; connectedThreadsAccounts: number };

async function copy(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin`); } catch { toast.error('Gagal menyalin, salin manual'); }
}

function ReplizCard() {
  const st = useApi<ReplizStatus>('/repliz');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  const { busy, run } = useAction();
  const s = st.data;
  const webhookUrl = typeof window !== 'undefined' && s ? `${window.location.origin}${s.webhookPath}` : '';
  const fromEnv = s?.source === 'env';

  const runTest = () => run('test', async () => {
    const r = await api<TestResult>('/repliz/test', { method: 'POST' });
    setTest(r);
    if (r.isGold) toast.success(`Terhubung sebagai ${r.name} (Gold)`);
    else toast.error(`Terhubung, tapi paket ${r.plan}. Fitur Comel butuh paket Gold.`);
  });

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex flex-wrap items-center gap-2">
          Koneksi Repliz
          {s ? (s.hasKeys ? <Pill t="ok">kunci tersimpan{fromEnv ? ' (dari .env)' : ''}</Pill> : <Pill t="err">belum terhubung</Pill>) : null}
        </CardTitle>
        <CardDescription>
          Repliz menjadi jembatan ke Threads. Ambil kunci di dashboard Repliz → Settings → Public API. Butuh paket <b>Gold</b>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-5">
        <Section title="Kunci API">
          <TextField label="Access Key" value={accessKey} onChange={setAccessKey}
            placeholder={s?.accessKeyMasked ? `${s.accessKeyMasked} (tersimpan — isi untuk mengganti)` : ''}
            help="Boleh juga tempel format AccessKey:SecretKey di sini." />
          <TextField type="password" label="Secret Key" value={secretKey} onChange={setSecretKey}
            placeholder={s?.hasKeys ? '•••••••• (tersimpan — isi untuk mengganti)' : ''} help="Disimpan terenkripsi di server." />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button disabled={fromEnv || busy === 'save' || (!accessKey && !secretKey)} onClick={() => run('save', async () => {
              await api('/repliz', { method: 'PUT', body: { accessKey, secretKey } });
              setAccessKey(''); setSecretKey('');
              await st.reload();
              toast.success('Kunci Repliz disimpan');
              await runTest();
            })}><KeyRound />{busy === 'save' ? 'Menyimpan…' : 'Simpan kunci'}</Button>
            <Button variant="outline" disabled={!s?.hasKeys || busy === 'test'} onClick={runTest}>
              <FlaskConical />{busy === 'test' ? 'Mengetes…' : 'Tes koneksi'}
            </Button>
            {s?.hasKeys && !fromEnv ? (
              <Button variant="ghost" className="text-destructive" onClick={() => {
                if (!confirm('Hapus kunci Repliz dari Comel?')) return;
                void run('clear', async () => { await api('/repliz', { method: 'PUT', body: { clear: true } }); setTest(null); await st.reload(); });
              }}>Hapus kunci</Button>
            ) : null}
          </div>
          {test ? (
            <div className="rounded-lg border p-3 text-sm sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <b>{test.name}</b>
                <Pill t={test.isGold ? 'ok' : 'err'}>paket {test.plan}</Pill>
                {test.expiredAt ? <span className="text-xs text-muted-foreground">berlaku s.d. {new Date(test.expiredAt).toLocaleDateString('id-ID')}</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Akun Threads di Repliz: {test.threadsAccounts} ({test.connectedThreadsAccounts} terhubung).
                {!test.threadsAccounts ? ' Hubungkan dulu di dashboard Repliz → Account Integration.' : ' Tambahkan ke Comel dari menu Akun Threads.'}
              </p>
            </div>
          ) : null}
        </Section>

        <Section title="Webhook (opsional, disarankan)" description="Agar komentar baru di postingan Anda langsung dibalas. Tempel URL & token ini di dashboard Repliz → Settings → Webhook.">
          <Field label="URL webhook" className="sm:col-span-2"
            help="Harus bisa diakses publik lewat HTTPS (mis. domain sslip.io dari profil Caddy). Alamat localhost tidak bisa dipakai Repliz.">
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" aria-label="Salin URL" onClick={() => copy(webhookUrl, 'URL webhook')}><Copy /></Button>
            </div>
          </Field>
          <Field label="Token" className="sm:col-span-2" help="Repliz mengirimnya di header x-token; permintaan dengan token lain ditolak.">
            <div className="flex gap-2">
              <Input readOnly value={s?.webhookToken || ''} className="font-mono text-xs" />
              <Button variant="outline" size="icon" aria-label="Salin token" onClick={() => copy(s?.webhookToken || '', 'Token')}><Copy /></Button>
              <Button variant="outline" size="icon" aria-label="Buat token baru" disabled={s?.webhookTokenFromEnv} onClick={() => {
                if (!confirm('Buat token baru? Token lama langsung tidak berlaku; perbarui juga di dashboard Repliz.')) return;
                void run('tok', async () => { await api('/repliz/webhook-token', { method: 'POST' }); await st.reload(); toast.success('Token baru dibuat'); });
              }}><RefreshCw /></Button>
            </div>
          </Field>
        </Section>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const s = useApi<AppSettings>('/settings');
  const [draft, setF] = useState<AppSettings | null>(null);
  const { busy, run } = useAction();
  const f = draft ?? s.data;

  return (
    <>
      <PageHeader title="Pengaturan" />
      <div className="flex flex-col gap-6">
        <ReplizCard />
        <ApiTokensCard />
        {f ? (
          <Card className="py-5">
            <CardHeader className="flex flex-row items-center justify-between px-5">
              <CardTitle>Umum</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy === 'def'} onClick={() => run('def', async () => {
                  const d = await api<AppSettings>('/settings?defaults=1');
                  setF({ ...d, paused: f.paused });
                  toast.info('Nilai default dimuat. Klik Simpan untuk menerapkan.');
                })}><RotateCcw />Default</Button>
                <Button disabled={busy === 'save'} onClick={() => run('save', async () => {
                  const { paused: _p, ...rest } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
                  setF(await api<AppSettings>('/settings', { method: 'PUT', body: rest }));
                  toast.success('Pengaturan disimpan');
                })}><Save />Simpan</Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 px-5">
              <Section title="Jam aktif default" description='Dipakai trigger & balas komentar yang memilih "Ikuti default". Mulai = selesai berarti 24 jam.'>
                <TextField type="time" label="Mulai" value={f.activeStart} onChange={(v) => setF({ ...f, activeStart: v })} />
                <TextField type="time" label="Selesai" value={f.activeEnd} onChange={(v) => setF({ ...f, activeEnd: v })} help="Boleh lewat tengah malam (mis. 20:00–02:00)" />
                <SelectField label="Zona waktu" value={f.timezone} onChange={(v) => setF({ ...f, timezone: v })}
                  options={[['Asia/Jakarta', 'WIB (Asia/Jakarta)'], ['Asia/Makassar', 'WITA (Asia/Makassar)'], ['Asia/Jayapura', 'WIT (Asia/Jayapura)'], ['UTC', 'UTC']]} />
              </Section>
              <Section title="Komentar">
                <NumberField label="Panjang maksimal komentar (karakter)" value={f.maxChars} onChange={(v) => setF({ ...f, maxChars: v })} help="Threads membatasi 500" />
                <NumberField label="Maks postingan dicek metrik viral per putaran" value={f.metricLookupMax} onChange={(v) => setF({ ...f, metricLookupMax: v })}
                  help="Repliz tidak memberi angka like/balasan/share; angka diambil via Lightpanda (±5 detik per postingan). Disarankan 30; maks 50." />
                <NumberField label="Jeda antar komentar minimal (detik)" value={f.delayMinSeconds} onChange={(v) => setF({ ...f, delayMinSeconds: v })}
                  help="Default 180–600 detik (3–10 menit), sama dengan pacing Repliz." />
                <NumberField label="Jeda antar komentar maksimal (detik)" value={f.delayMaxSeconds} onChange={(v) => setF({ ...f, delayMaxSeconds: v })} />
                <SwitchField className="sm:col-span-2" label="AI melewati postingan sensitif (duka, SARA, politik, dewasa)" checked={f.skipSensitive} onChange={(v) => setF({ ...f, skipSensitive: v })} />
              </Section>
            </CardContent>
          </Card>
        ) : <p className="text-sm text-muted-foreground">Memuat…</p>}
      </div>
    </>
  );
}

type ApiTokenJ = { id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

/** Token akses API untuk alat otomatis (mis. sesi Claude) — Authorization: Bearer comel_… */
function ApiTokensCard() {
  const list = useApi<ApiTokenJ[]>('/tokens');
  const [name, setName] = useState('Claude');
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const { busy, run } = useAction();

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>Token akses API</CardTitle>
        <CardDescription>
          Untuk memberi alat otomatis (mis. sesi Claude) akses ke Comel lewat API, tanpa password.
          Token punya akses penuh seperti admin — simpan di tempat rahasia, jangan ditempel di chat. Cabut kapan saja.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5">
        {fresh ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">Token &quot;{fresh.name}&quot; — salin sekarang, tidak akan ditampilkan lagi:</p>
            <div className="flex gap-2">
              <Input readOnly value={fresh.token} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Salin token API" onClick={() => copy(fresh.token, 'Token API')}><Copy /></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Untuk Claude: simpan di pengaturan environment sesi Claude (menu environment → Edit) sebagai environment variable <code>COMEL_API_TOKEN</code>, lalu buka sesi baru.
            </p>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setFresh(null)}>Sudah disimpan, tutup</Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1"><TextField label="Nama token" value={name} onChange={setName} placeholder="Claude" /></div>
          <Button disabled={busy === 'new' || !name.trim()} onClick={() => run('new', async () => {
            const r = await api<ApiTokenJ & { token: string }>('/tokens', { method: 'POST', body: { name: name.trim() } });
            setFresh({ name: r.name, token: r.token });
            await list.reload();
          })}><Plus />{busy === 'new' ? 'Membuat…' : 'Buat token'}</Button>
        </div>

        {list.data && !list.data.length ? <p className="text-sm text-muted-foreground">Belum ada token.</p> : null}
        {list.data?.length ? <div className="flex flex-col divide-y rounded-lg border">
          {list.data.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.name} <span className="font-mono text-xs text-muted-foreground">{t.prefix}…</span></p>
                <p className="text-xs text-muted-foreground">dibuat {ago(t.createdAt)} · terakhir dipakai {t.lastUsedAt ? ago(t.lastUsedAt) : 'belum pernah'}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === `del${t.id}`} onClick={() => {
                if (!confirm(`Cabut token "${t.name}"? Alat yang memakainya langsung tidak bisa masuk.`)) return;
                void run(`del${t.id}`, async () => { await api(`/tokens/${t.id}`, { method: 'DELETE' }); await list.reload(); toast.success('Token dicabut'); });
              }}><Trash2 />Cabut</Button>
            </div>
          ))}
        </div> : null}
      </CardContent>
    </Card>
  );
}
