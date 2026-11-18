'use client';

import { useState } from 'react';
import { Copy, FlaskConical, KeyRound, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Pill } from '@/components/app/common';
import { Field, NumberField, Section, SelectField, SwitchField, TextField } from '@/components/app/fields';
import type { AppSettings, ReplizStatus } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, useAction, useApi } from '@/lib/client';

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
