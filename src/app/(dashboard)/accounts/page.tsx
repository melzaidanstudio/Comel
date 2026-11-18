'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MessageCircleReply, Pencil, Plug, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Empty, LastStatus, Pill } from '@/components/app/common';
import {
  ActiveHoursField, IdSelectField, NumberField, Section, SwitchField, TextField, TextareaField,
} from '@/components/app/fields';
import { defaultHoursLabel, type AccountJ, type AppSettings, type ProviderJ, type ReplizAccountOption } from '@/components/app/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, useAction, useApi } from '@/lib/client';

type Form = {
  name: string; username: string; replizAccountId: string;
  dailyLimit: number; hourlyLimit: number; providerId: number | null; enabled: boolean;
  replyEnabled: boolean; replyIntervalMinutes: number; replyPerRun: number;
  replyMaxAgeHours: number; replyInstruction: string; replyDryRun: boolean; replyActiveHours: string;
};

const EMPTY: Form = {
  name: '', username: '', replizAccountId: '',
  dailyLimit: 50, hourlyLimit: 10, providerId: null, enabled: true,
  replyEnabled: false, replyIntervalMinutes: 30, replyPerRun: 5, replyMaxAgeHours: 48,
  replyInstruction: '', replyDryRun: false, replyActiveHours: '',
};

function toForm(a: AccountJ): Form {
  return {
    name: a.name, username: a.username, replizAccountId: a.replizAccountId,
    dailyLimit: a.dailyLimit, hourlyLimit: a.hourlyLimit, providerId: a.providerId, enabled: a.enabled,
    replyEnabled: a.replyEnabled, replyIntervalMinutes: a.replyIntervalMinutes, replyPerRun: a.replyPerRun,
    replyMaxAgeHours: a.replyMaxAgeHours, replyInstruction: a.replyInstruction, replyDryRun: a.replyDryRun,
    replyActiveHours: a.replyActiveHours,
  };
}

function Avatar({ src, name }: { src: string; name: string }) {
  if (!src) return <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">{name.slice(0, 1).toUpperCase()}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="size-9 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />;
}

export default function AccountsPage() {
  const accs = useApi<AccountJ[]>('/accounts');
  const provs = useApi<ProviderJ[]>('/providers');
  const settings = useApi<AppSettings>('/settings');
  const conn = useApi<{ hasKeys: boolean }>('/repliz');
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<{ open: boolean; account: AccountJ | null; key: number }>({ open: false, account: null, key: 0 });
  const [picker, setPicker] = useState(0);
  const [persona, setPersona] = useState<AccountJ | null>(null);
  const [preset, setPreset] = useState<ReplizAccountOption | null>(null);
  const openEdit = (account: AccountJ | null, from: ReplizAccountOption | null = null) => {
    setPreset(from);
    setEdit((e) => ({ open: true, account, key: e.key + 1 }));
  };

  return (
    <>
      <PageHeader title="Akun Threads" description="Akun Threads yang terhubung lewat Repliz">
        <Button variant="outline" disabled={busy === 'sync' || !conn.data?.hasKeys} onClick={() => run('sync', async () => {
          const r = await api<{ updated: number; missing: number }>('/accounts/sync', { method: 'POST' });
          toast.success(`Disinkronkan: ${r.updated} akun${r.missing ? `, ${r.missing} tidak ditemukan di Repliz` : ''}`);
          await accs.reload();
        })}><RefreshCw />{busy === 'sync' ? 'Sinkron…' : 'Sinkron dari Repliz'}</Button>
        <Button disabled={!conn.data?.hasKeys} onClick={() => setPicker((n) => n + 1)}><Plus />Tambah dari Repliz</Button>
      </PageHeader>

      {conn.data && !conn.data.hasKeys ? (
        <Alert className="mb-4"><AlertDescription>
          Hubungkan Repliz dulu: isi Access Key & Secret Key di <Link className="underline" href="/settings">Pengaturan</Link>.
          Akun Threads dihubungkan di dashboard Repliz (Account Integration → Connect account → Threads).
        </AlertDescription></Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        {accs.data && !accs.data.length ? <Empty>Belum ada akun. Klik &quot;Tambah dari Repliz&quot;.</Empty> : null}
        {(accs.data || []).map((a) => (
          <Card key={a.id} className="py-4">
            <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-3">
                <Avatar src={a.picture} name={a.name} />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{a.name}</h3>
                    {a.username ? <span className="text-sm text-muted-foreground">@{a.username}</span> : null}
                    {!a.replizAccountId ? <Pill t="err">belum terhubung ke Repliz</Pill>
                      : a.isConnected ? <Pill t="ok">terhubung</Pill> : <Pill t="err">terputus di Repliz</Pill>}
                    {!a.enabled ? <Pill>nonaktif</Pill> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Terkirim: <b className="text-foreground">{a.sent1h}/{a.hourlyLimit} per jam · {a.sent24h}/{a.dailyLimit} per hari</b></span>
                    <span>Balas komentar: <b className="text-foreground">{a.replyEnabled ? `aktif, tiap ${a.replyIntervalMinutes} mnt` : 'nonaktif'}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.statusNote ? <Pill t={/^ERROR|Terputus|Tidak ditemukan/.test(a.statusNote) ? 'err' : 'ok'}>{a.statusNote}</Pill> : null}
                    {a.replyEnabled && a.lastReplyStatus ? <LastStatus status={`balas: ${a.lastReplyStatus}`} /> : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:max-w-md lg:justify-end">
                <Button size="sm" variant="outline" disabled={busy === `ver${a.id}`} onClick={() => run(`ver${a.id}`, async () => {
                  const r = await api<{ ok: boolean; message: string }>(`/accounts/${a.id}/verify`, { method: 'POST' });
                  if (r.ok) toast.success(r.message); else toast.error(r.message);
                }).finally(() => accs.reload())}><Plug />{busy === `ver${a.id}` ? 'Mengecek…' : 'Tes koneksi'}</Button>
                <Button size="sm" variant="outline" disabled={busy === `rep${a.id}`} onClick={() => run(`rep${a.id}`, async () => {
                  const r = await api<{ status: string }>(`/accounts/${a.id}/run-replies`, { method: 'POST' });
                  toast.success(`Balas komentar: ${r.status}`);
                }).finally(() => accs.reload())}><MessageCircleReply />{busy === `rep${a.id}` ? 'Berjalan…' : 'Balas komentar'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setPersona(a)}><Sparkles />Persona</Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil />Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                  if (!confirm(`Hapus akun "${a.name}" dari Comel beserta trigger-triggernya? (Akun di Repliz tidak dihapus.)`)) return;
                  void run(`del${a.id}`, async () => { await api(`/accounts/${a.id}`, { method: 'DELETE' }); await accs.reload(); });
                }}><Trash2 />Hapus</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {picker ? <ReplizPicker key={picker} onPick={(r) => { setPicker(0); openEdit(null, r); }} onClose={() => setPicker(0)} /> : null}
      <AccountDialog key={edit.key} state={edit} preset={preset} providers={provs.data || []} settings={settings.data}
        onOpenChange={(o) => setEdit((s) => ({ ...s, open: o }))} onSaved={() => void accs.reload()} />
      <PersonaDialog key={persona ? `p${persona.id}` : 'persona-none'} account={persona} onClose={() => setPersona(null)} />
    </>
  );
}

function ReplizPicker({ onPick, onClose }: { onPick: (r: ReplizAccountOption) => void; onClose: () => void }) {
  const list = useApi<ReplizAccountOption[]>('/repliz/accounts');
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pilih akun Threads dari Repliz</DialogTitle>
          <DialogDescription>
            Belum ada di daftar? Hubungkan dulu di dashboard Repliz: Account Integration → Connect account → Threads, lalu buka lagi daftar ini.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60svh] flex-col gap-2 overflow-y-auto">
          {list.error ? <p className="text-sm text-destructive">{list.error}</p> : null}
          {!list.data && !list.error ? <p className="text-sm text-muted-foreground">Memuat akun dari Repliz…</p> : null}
          {list.data && !list.data.length ? <p className="text-sm text-muted-foreground">Tidak ada akun Threads di workspace Repliz Anda.</p> : null}
          {(list.data || []).map((r) => (
            <button key={r.id} type="button" disabled={r.added} onClick={() => onPick(r)}
              className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
              <Avatar src={r.picture} name={r.name || r.username} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">@{r.username}</div>
              </div>
              {r.added ? <Pill>sudah ditambahkan</Pill> : r.isConnected ? <Pill t="ok">terhubung</Pill> : <Pill t="err">terputus</Pill>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({ state, preset, onOpenChange, providers, settings, onSaved }: {
  state: { open: boolean; account: AccountJ | null }; preset: ReplizAccountOption | null; onOpenChange: (o: boolean) => void;
  providers: ProviderJ[]; settings?: AppSettings; onSaved: () => void;
}) {
  const a = state.account;
  // di-mount ulang (key) setiap dibuka
  const [f, setF] = useState<Form>(() => (a ? toForm(a)
    : { ...EMPTY, name: preset?.name || '', username: preset?.username || '', replizAccountId: preset?.id || '' }));
  const { busy, run } = useAction();
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = () => run('save', async () => {
    if (a) {
      const { replizAccountId: _r, ...rest } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
      await api(`/accounts/${a.id}`, { method: 'PUT', body: rest });
    } else {
      await api('/accounts', { method: 'POST', body: f });
    }
    toast.success('Akun disimpan');
    onOpenChange(false);
    onSaved();
  });

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>{a ? `Edit akun: ${a.name}` : `Tambah akun @${f.username}`}</DialogTitle>
          <DialogDescription>Login & koneksi ke Threads diurus Repliz. Di sini hanya pengaturan cara Comel memakai akun ini.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 overflow-y-auto p-5">
          <Section title="Umum">
            <TextField label="Nama (label)" value={f.name} onChange={set('name')} placeholder="Akun utama" required />
            <TextField label="Username Threads" value={f.username} onChange={set('username')}
              help="Diambil dari Repliz; dipakai agar postingan sendiri tidak dikomentari." />
            <IdSelectField label="AI provider akun" value={f.providerId} onChange={set('providerId')}
              options={providers.map((p) => [p.id, `${p.name} (${p.model})`])} />
            <SwitchField label="Akun aktif" checked={f.enabled} onChange={set('enabled')} />
          </Section>

          <Section title="Batas aman" description="Komentar + balasan dihitung bersama. Default mengikuti pacing Repliz: 10 per jam, 50 per hari.">
            <NumberField label="Maks per jam" value={f.hourlyLimit} onChange={set('hourlyLimit')} />
            <NumberField label="Maks per 24 jam" value={f.dailyLimit} onChange={set('dailyLimit')} />
          </Section>

          <Section title="Balas komentar otomatis" description="Komentar orang di postingan akun ini (antrean komentar Repliz).">
            <SwitchField className="sm:col-span-2" label="Aktifkan balas komentar otomatis" checked={f.replyEnabled} onChange={set('replyEnabled')}
              help="Dengan webhook Repliz aktif, komentar baru langsung diproses; tanpa webhook dicek sesuai interval." />
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
          <Button onClick={save} disabled={busy === 'save' || !f.name || !f.replizAccountId}>{busy === 'save' ? 'Menyimpan…' : 'Simpan'}</Button>
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
