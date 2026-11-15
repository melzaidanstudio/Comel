'use client';

import { useEffect, useState } from 'react';
import { KeyRound, MessageCircleReply, Pencil, Plug, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Empty, LastStatus, Pill } from '@/components/app/common';
import {
  ActiveHoursField, IdSelectField, NumberField, Section, SelectField, SwitchField, TextField, TextareaField,
} from '@/components/app/fields';
import { defaultHoursLabel, type AccountJ, type AppSettings, type ProviderJ } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, useAction, useApi } from '@/lib/client';

type Form = {
  name: string; username: string; method: 'api' | 'browser';
  accessToken: string; clearAccessToken: boolean;
  cookies: string; clearCookies: boolean;
  browserEngine: 'chromium' | 'lightpanda'; loginEngine: 'chromium' | 'lightpanda'; scrapeWithCookies: boolean;
  loginUsername: string; loginPassword: string; totpSecret: string; clearLoginSecrets: boolean; autoLogin: boolean;
  dailyLimit: number; providerId: number | null; enabled: boolean;
  replyEnabled: boolean; replyIntervalMinutes: number; replyPerRun: number; replyScope: 'both' | 'own_posts' | 'my_comments';
  replyMaxAgeHours: number; replyInstruction: string; replyDryRun: boolean; replyActiveHours: string;
};

const EMPTY: Form = {
  name: '', username: '', method: 'browser', accessToken: '', clearAccessToken: false, cookies: '', clearCookies: false,
  browserEngine: 'chromium', loginEngine: 'lightpanda', scrapeWithCookies: false,
  loginUsername: '', loginPassword: '', totpSecret: '', clearLoginSecrets: false, autoLogin: true,
  dailyLimit: 50, providerId: null, enabled: true,
  replyEnabled: false, replyIntervalMinutes: 30, replyPerRun: 5, replyScope: 'both', replyMaxAgeHours: 48,
  replyInstruction: '', replyDryRun: false, replyActiveHours: '',
};

function toForm(a: AccountJ): Form {
  return {
    ...EMPTY,
    name: a.name, username: a.username, method: a.method as Form['method'],
    browserEngine: a.browserEngine as Form['browserEngine'], loginEngine: a.loginEngine as Form['loginEngine'],
    scrapeWithCookies: a.scrapeWithCookies, loginUsername: a.loginUsername, autoLogin: a.autoLogin,
    dailyLimit: a.dailyLimit, providerId: a.providerId, enabled: a.enabled,
    replyEnabled: a.replyEnabled, replyIntervalMinutes: a.replyIntervalMinutes, replyPerRun: a.replyPerRun,
    replyScope: a.replyScope as Form['replyScope'], replyMaxAgeHours: a.replyMaxAgeHours, replyInstruction: a.replyInstruction,
    replyDryRun: a.replyDryRun, replyActiveHours: a.replyActiveHours,
  };
}

export default function AccountsPage() {
  const accs = useApi<AccountJ[]>('/accounts');
  const provs = useApi<ProviderJ[]>('/providers');
  const settings = useApi<AppSettings>('/settings');
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<{ open: boolean; account: AccountJ | null; key: number }>({ open: false, account: null, key: 0 });
  const openEdit = (account: AccountJ | null) => setEdit((e) => ({ open: true, account, key: e.key + 1 }));
  const [twofa, setTwofa] = useState<{ id: number; message: string } | null>(null);
  const [persona, setPersona] = useState<AccountJ | null>(null);

  const login = (a: AccountJ) => run(`login${a.id}`, async () => {
    const r = await api<{ ok: boolean; needs2fa?: boolean; message?: string }>(`/accounts/${a.id}/login`, { method: 'POST' });
    if (r.needs2fa) setTwofa({ id: a.id, message: r.message || '' });
    else toast.success('Login berhasil, sesi disimpan');
  }).finally(() => accs.reload());

  return (
    <>
      <PageHeader title="Akun Threads" description="Login via API resmi, atau browser dengan username + password / cookie">
        <Button onClick={() => openEdit(null)}><Plus />Akun baru</Button>
      </PageHeader>
      <div className="flex flex-col gap-3">
        {accs.data && !accs.data.length ? <Empty>Belum ada akun</Empty> : null}
        {(accs.data || []).map((a) => {
          const auth = a.method === 'api'
            ? (a.hasToken ? `token ${a.tokenMasked}` : 'token belum diisi')
            : [a.hasLoginPassword ? `password tersimpan ✓${a.hasTotp ? ' · 2FA otomatis ✓' : ''}` : null,
              a.cookieInfo.hasSession ? 'sesi aktif ✓' : 'belum ada sesi'].filter(Boolean).join(' · ');
          return (
            <Card key={a.id} className="py-4">
              <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{a.name}</h3>
                    {a.username ? <span className="text-sm text-muted-foreground">@{a.username}</span> : null}
                    {!a.enabled ? <Pill>nonaktif</Pill> : null}
                    {a.loginPaused ? <Pill t="warn">login otomatis dijeda</Pill> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Metode: <b className="text-foreground">{a.method === 'api' ? 'API resmi' : 'Browser'}</b></span>
                    <span>Login: <b className="text-foreground">{auth}</b></span>
                    <span>Terkirim 24 jam: <b className="text-foreground">{a.sent24h} / {a.dailyLimit}</b></span>
                    <span>Balas komentar: <b className="text-foreground">{a.replyEnabled ? `aktif, tiap ${a.replyIntervalMinutes} mnt` : 'nonaktif'}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.statusNote ? <Pill t={/^ERROR/.test(a.statusNote) ? 'err' : /Menunggu/.test(a.statusNote) ? 'warn' : 'ok'}>{a.statusNote}</Pill> : <Pill>belum dites</Pill>}
                    {a.replyEnabled && a.lastReplyStatus ? <LastStatus status={`balas: ${a.lastReplyStatus}`} /> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 lg:max-w-md lg:justify-end">
                  {a.method === 'browser' && a.hasLoginPassword ? (
                    <Button size="sm" variant="outline" disabled={busy === `login${a.id}`} onClick={() => login(a)}>
                      <KeyRound />{busy === `login${a.id}` ? 'Login…' : 'Login sekarang'}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={busy === `ver${a.id}`} onClick={() => run(`ver${a.id}`, async () => {
                    const r = await api<{ username?: string }>(`/accounts/${a.id}/verify`, { method: 'POST' });
                    toast.success(r.username ? `Terhubung sebagai @${r.username}` : 'Sesi valid');
                  }).finally(() => accs.reload())}><Plug />{busy === `ver${a.id}` ? 'Mengecek…' : 'Tes koneksi'}</Button>
                  <Button size="sm" variant="outline" disabled={busy === `rep${a.id}`} onClick={() => run(`rep${a.id}`, async () => {
                    const r = await api<{ status: string }>(`/accounts/${a.id}/run-replies`, { method: 'POST' });
                    toast.success(`Balas komentar: ${r.status}`);
                  }).finally(() => accs.reload())}><MessageCircleReply />{busy === `rep${a.id}` ? 'Berjalan…' : 'Balas komentar'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPersona(a)}><Sparkles />Persona</Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil />Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                    if (!confirm(`Hapus akun "${a.name}" beserta trigger-triggernya?`)) return;
                    void run(`del${a.id}`, async () => { await api(`/accounts/${a.id}`, { method: 'DELETE' }); await accs.reload(); });
                  }}><Trash2 />Hapus</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AccountDialog key={edit.key} state={edit} onOpenChange={(o) => setEdit((s) => ({ ...s, open: o }))} providers={provs.data || []}
        settings={settings.data} onSaved={() => void accs.reload()} />
      <TwoFaDialog key={twofa ? `2fa-${twofa.id}-${twofa.message}` : '2fa-none'} state={twofa} onClose={() => setTwofa(null)} onDone={() => void accs.reload()} />
      <PersonaDialog key={persona ? `p${persona.id}` : 'persona-none'} account={persona} onClose={() => setPersona(null)} />
    </>
  );
}

function AccountDialog({ state, onOpenChange, providers, settings, onSaved }: {
  state: { open: boolean; account: AccountJ | null }; onOpenChange: (o: boolean) => void;
  providers: ProviderJ[]; settings?: AppSettings; onSaved: () => void;
}) {
  const a = state.account;
  const [f, setF] = useState<Form>(() => (a ? toForm(a) : EMPTY)); // di-mount ulang (key) setiap dibuka
  const { busy, run } = useAction();
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const saved = '•••••••• (tersimpan — isi untuk mengganti)';

  const save = () => run('save', async () => {
    if (a) await api(`/accounts/${a.id}`, { method: 'PUT', body: f });
    else await api('/accounts', { method: 'POST', body: f });
    toast.success(f.method === 'browser' && f.loginPassword ? 'Akun disimpan. Klik "Login sekarang".' : 'Akun disimpan. Klik "Tes koneksi".');
    onOpenChange(false);
    onSaved();
  });

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>{a ? `Edit akun: ${a.name}` : 'Akun baru'}</DialogTitle>
          <DialogDescription>Rahasia (token, password, cookie) disimpan terenkripsi/tersembunyi dan tidak ditampilkan lagi.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 overflow-y-auto p-5">
          <Section title="Umum">
            <TextField label="Nama (label)" value={f.name} onChange={set('name')} placeholder="Akun utama" required />
            <TextField label="Username Threads (tanpa @)" value={f.username} onChange={set('username')} placeholder="namakamu"
              help="Wajib untuk browser; otomatis terisi untuk API setelah Tes koneksi." />
            <SelectField label="Metode kirim" value={f.method} onChange={set('method')}
              options={[['browser', 'Browser (login password / cookie)'], ['api', 'API resmi Threads']]} />
            <NumberField label="Batas komentar per 24 jam" value={f.dailyLimit} onChange={set('dailyLimit')} help="Komentar + balasan. Terlalu banyak = risiko spam." />
            <IdSelectField label="AI provider akun" value={f.providerId} onChange={set('providerId')}
              options={providers.map((p) => [p.id, `${p.name} (${p.model})`])} />
            <SwitchField label="Akun aktif" checked={f.enabled} onChange={set('enabled')} />
          </Section>

          {f.method === 'api' ? (
            <Section title="API resmi Threads">
              <TextField className="sm:col-span-2" type="password" label="Access token" value={f.accessToken} onChange={set('accessToken')}
                placeholder={a?.hasToken ? `${a.tokenMasked} (tersimpan — isi untuk mengganti)` : ''}
                help="Long-lived token dari Meta for Developers (lihat README). Diperbarui otomatis tiap minggu." />
            </Section>
          ) : (
            <>
              <Section title="Login otomatis (username & password)">
                <TextField label="Username / email / no. HP" value={f.loginUsername} onChange={set('loginUsername')} placeholder="username Instagram/Threads" />
                <TextField type="password" label="Password" value={f.loginPassword} onChange={set('loginPassword')}
                  placeholder={a?.hasLoginPassword ? saved : ''} help="Disimpan terenkripsi (AES-256)." />
                <TextField type="password" label="Kunci 2FA authenticator (opsional)" value={f.totpSecret} onChange={set('totpSecret')}
                  placeholder={a?.hasTotp ? saved : 'JBSWY3DPEHPK3PXP'} help="Kode 2FA dibuat otomatis. Untuk 2FA SMS, kosongkan." />
                <SelectField label="Browser untuk login" value={f.loginEngine} onChange={set('loginEngine')}
                  options={[['lightpanda', 'Lightpanda (default)'], ['chromium', 'Chromium']]} />
                <SwitchField label="Login ulang otomatis bila sesi kedaluwarsa" checked={f.autoLogin} onChange={set('autoLogin')}
                  help="Maks 1×/30 menit; dijeda otomatis bila password salah / diminta verifikasi." />
                {a?.hasLoginPassword ? <SwitchField label="Hapus password & kunci 2FA tersimpan" checked={f.clearLoginSecrets} onChange={set('clearLoginSecrets')} /> : null}
              </Section>
              <Section title="Sesi browser">
                <SelectField label="Browser untuk kirim komentar" value={f.browserEngine} onChange={set('browserEngine')}
                  options={[['chromium', 'Chromium (paling andal)'], ['lightpanda', 'Lightpanda (eksperimental)']]} />
                <SwitchField label="Scrape juga pakai cookie akun ini" checked={f.scrapeWithCookies} onChange={set('scrapeWithCookies')}
                  help="Default scrape tanpa login (lebih aman)." />
                <TextareaField className="sm:col-span-2" label="Cookie threads.com (opsional)" value={f.cookies} onChange={set('cookies')} rows={3} mono
                  placeholder={a?.cookieInfo.hasSession ? 'sesi tersimpan — tempel untuk mengganti' : '[{"name":"sessionid","value":"..."}]  atau  sessionid=...; csrftoken=...'}
                  help="Alternatif tanpa password (ekspor dari Cookie-Editor). Terisi otomatis setelah login berhasil." />
              </Section>
            </>
          )}

          <Section title="Balas komentar otomatis">
            <SwitchField className="sm:col-span-2" label="Aktifkan balas komentar otomatis" checked={f.replyEnabled} onChange={set('replyEnabled')} />
            <SelectField label="Balas komentar di" value={f.replyScope} onChange={set('replyScope')}
              options={[['both', 'Postingan saya + komentar saya'], ['own_posts', 'Postingan saya saja'], ['my_comments', 'Balasan untuk komentar saya']]} />
            <NumberField label="Cek setiap (menit)" value={f.replyIntervalMinutes} min={5} onChange={set('replyIntervalMinutes')} />
            <NumberField label="Maks balasan per putaran" value={f.replyPerRun} onChange={set('replyPerRun')} />
            <NumberField label="Hanya komentar ≤ (jam)" value={f.replyMaxAgeHours} min={1} onChange={set('replyMaxAgeHours')} />
            <ActiveHoursField label="Jam aktif balas komentar" value={f.replyActiveHours} onChange={set('replyActiveHours')} defaultLabel={defaultHoursLabel(settings)} />
            <TextareaField className="sm:col-span-2" label="Instruksi membalas" value={f.replyInstruction} onChange={set('replyInstruction')} rows={3}
              placeholder="Balas dengan ramah dan nyambung. Kalau ditanya lokasi/harga, jawab sesuai memory.md." />
            <SwitchField className="sm:col-span-2" label="Dry run balasan (buat tapi jangan kirim)" checked={f.replyDryRun} onChange={set('replyDryRun')} />
          </Section>
        </div>
        <DialogFooter className="m-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={save} disabled={busy === 'save' || !f.name}>{busy === 'save' ? 'Menyimpan…' : 'Simpan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TwoFaDialog({ state, onClose, onDone }: { state: { id: number; message: string } | null; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const { busy, run } = useAction();
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Kode 2FA</DialogTitle>
          <DialogDescription>{state?.message || 'Masukkan kode dari SMS / aplikasi authenticator. Berlaku 5 menit.'}</DialogDescription>
        </DialogHeader>
        <TextField label="Kode verifikasi" value={code} onChange={setCode} placeholder="123456" />
        <DialogFooter>
          <Button disabled={!code || busy === '2fa'} onClick={() => run('2fa', async () => {
            await api(`/accounts/${state!.id}/login/2fa`, { method: 'POST', body: { code } });
            toast.success('Login berhasil, sesi disimpan');
            onClose();
          }).finally(onDone)}>{busy === '2fa' ? 'Mengirim…' : 'Kirim kode'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonaDialog({ account, onClose }: { account: AccountJ | null; onClose: () => void }) {
  const [p, setP] = useState<{ soul: string; memory: string } | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (account) api<{ soul: string; memory: string }>(`/accounts/${account.id}/persona`).then(setP).catch((e) => toast.error(e.message));
  }, [account]);
  return (
    <Dialog open={Boolean(account)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Persona akun: {account?.name}</DialogTitle>
          <DialogDescription>Kosongkan untuk memakai soul.md / memory.md global.</DialogDescription>
        </DialogHeader>
        {p ? (
          <div className="flex flex-col gap-4 overflow-y-auto">
            <TextareaField label="soul.md khusus akun ini" value={p.soul} onChange={(v) => setP({ ...p, soul: v })} rows={10} mono />
            <TextareaField label="memory.md khusus akun ini" value={p.memory} onChange={(v) => setP({ ...p, memory: v })} rows={10} mono />
          </div>
        ) : <p className="text-sm text-muted-foreground">Memuat…</p>}
        <DialogFooter>
          <Button disabled={!p || busy === 'p'} onClick={() => run('p', async () => {
            await api(`/accounts/${account!.id}/persona`, { method: 'PUT', body: p });
            toast.success('Persona akun disimpan');
            onClose();
          })}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
