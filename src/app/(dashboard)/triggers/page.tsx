'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Copy, Eye, Lightbulb, Pencil, Play, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Empty, LastStatus, Pill, TagPill } from '@/components/app/common';
import { SwitchField, TextareaField, TextField } from '@/components/app/fields';
import { emptyTrigger, toForm, TriggerDialog } from '@/components/app/trigger-dialog';
import {
  activeHoursLabel, type AccountJ, type AppSettings, type EvaluatedPost, type Preview, type ProviderJ, type TriggerJ,
} from '@/components/app/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ago, api, num, useAction, useApi } from '@/lib/client';
import { earlyQueries, guessKeyword, keywordExpr } from '@/lib/recommend';

export default function TriggersPage() {
  const trigs = useApi<TriggerJ[]>('/triggers');
  const accs = useApi<AccountJ[]>('/accounts');
  const provs = useApi<ProviderJ[]>('/providers');
  const settings = useApi<AppSettings>('/settings');
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<{ open: boolean; editId: number | null; initial: ReturnType<typeof emptyTrigger>; key: number }>({
    open: false, editId: null, initial: emptyTrigger(0), key: 0,
  });
  const openDlg = (editId: number | null, initial: ReturnType<typeof emptyTrigger>) => setDlg((d) => ({ open: true, editId, initial, key: d.key + 1 }));
  const [preview, setPreview] = useState<{ t: TriggerJ; data: Preview } | null>(null);
  const [recommend, setRecommend] = useState<TriggerJ | null>(null);

  const accounts = accs.data || [];
  const accName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `#${id}`;

  function openNew() {
    if (!accounts.length) { toast.error('Tambahkan akun Threads dulu'); return; }
    openDlg(null, emptyTrigger(accounts[0].id));
  }

  return (
    <>
      <PageHeader title="Trigger" description="Kata kunci / topic tag + filter viralitas & waktu + jadwal → komentar AI otomatis">
        <Button onClick={openNew}><Plus />Trigger baru</Button>
      </PageHeader>
      {accs.data && !accounts.length ? (
        <Alert className="mb-4"><AlertDescription>Tambahkan akun Threads dulu di <Link className="underline" href="/accounts">Akun Threads</Link>.</AlertDescription></Alert>
      ) : null}
      {provs.data && !provs.data.length ? (
        <Alert className="mb-4"><AlertDescription>Tambahkan AI provider dulu di <Link className="underline" href="/providers">AI Provider</Link>.</AlertDescription></Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        {trigs.data && !trigs.data.length ? <Empty>Belum ada trigger</Empty> : null}
        {(trigs.data || []).map((t) => {
          const metrics = ([['suka', t.minLikes], ['balasan', t.minReplies], ['repost', t.minReposts], ['share', t.minShares], ['quote', t.minQuotes]] as const)
            .filter(([, v]) => v > 0).map(([n, v]) => `${n} ≥ ${num(v)}`).join(t.metricLogic === 'any' ? ' atau ' : ' & ');
          const tags = t.topicTags.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
          return (
            <Card key={t.id} className="py-4">
              <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    {t.enabled ? <Pill t="ok">aktif</Pill> : <Pill>nonaktif</Pill>}
                    {t.dryRun ? <Pill t="info">dry-run</Pill> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Akun: <b className="text-foreground">{accName(t.accountId)}</b></span>
                    <span>Cari: <b className="text-foreground">{t.queries.join(' · ') || (tags.length && t.tagAsSource ? '(halaman tag)' : '(dari ekspresi)')}</b></span>
                    {t.matchExpr ? <span>Filter: <b className="font-mono text-foreground">{t.matchExpr}</b></span> : null}
                    <span>Viral: <b className="text-foreground">{metrics || 'tanpa syarat'}</b></span>
                    <span>Umur: <b className="text-foreground">{t.maxAgeHours ? `≤ ${t.maxAgeHours} jam` : 'bebas'}</b></span>
                    <span>Jadwal: <b className="text-foreground">{t.actionsPerRun}× tiap {t.intervalMinutes} menit</b></span>
                    <span>Jam aktif: <b className="text-foreground">{activeHoursLabel(t.activeHours, settings.data)}</b></span>
                  </div>
                  {tags.length ? <div className="flex flex-wrap gap-1">{tags.map((x) => <TagPill key={x} name={x.replace(/^#/, '')} />)}{t.tagMatch === 'contains' ? <span className="text-xs text-muted-foreground">(mengandung)</span> : null}</div> : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <LastStatus status={t.lastStatus} /> terakhir {ago(t.lastRunAt)} · berikutnya {t.enabled ? ago(t.nextRunAt) : '—'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 lg:max-w-sm lg:justify-end">
                  <label className="mr-1 flex items-center gap-2 text-xs">
                    <Switch checked={t.enabled} onCheckedChange={(v) => run(`tog${t.id}`, async () => {
                      await api(`/triggers/${t.id}`, { method: 'PUT', body: { enabled: v } }); await trigs.reload();
                    })} />Aktif
                  </label>
                  <Button size="sm" variant="outline" disabled={busy === `prev${t.id}`} onClick={() => run(`prev${t.id}`, async () => {
                    setPreview({ t, data: await api<Preview>(`/triggers/${t.id}/preview`, { method: 'POST' }) });
                  })}><Eye />{busy === `prev${t.id}` ? 'Scraping…' : 'Preview'}</Button>
                  <Button size="sm" variant="outline" disabled={busy === `run${t.id}`} onClick={() => run(`run${t.id}`, async () => {
                    const r = await api<{ status: string }>(`/triggers/${t.id}/run`, { method: 'POST' });
                    toast.success(`Selesai: ${r.status}`); await trigs.reload();
                  })}><Play />{busy === `run${t.id}` ? 'Berjalan…' : 'Jalankan'}</Button>
                  <Button size="sm" variant="outline" onClick={() => setRecommend(t)}><Lightbulb />Rekomendasi</Button>
                  <Button size="sm" variant="ghost" onClick={() => openDlg(t.id, toForm(t))}><Pencil />Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => openDlg(null, { ...toForm(t), name: `${t.name} (salinan)` })}><Copy />Duplikat</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                    if (!confirm(`Hapus trigger "${t.name}"?`)) return;
                    void run(`del${t.id}`, async () => { await api(`/triggers/${t.id}`, { method: 'DELETE' }); await trigs.reload(); });
                  }}><Trash2 />Hapus</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TriggerDialog key={dlg.key} open={dlg.open} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} initial={dlg.initial} editId={dlg.editId}
        accounts={accounts} providers={provs.data || []} settings={settings.data} onSaved={() => void trigs.reload()} />
      {preview ? <PreviewDialog t={preview.t} data={preview.data} onClose={() => setPreview(null)} /> : null}
      {recommend ? <RecommendDialog key={recommend.id} t={recommend} onClose={() => setRecommend(null)} onDone={() => void trigs.reload()} /> : null}
    </>
  );
}

function PreviewDialog({ t, data, onClose }: { t: TriggerJ; data: Preview; onClose: () => void }) {
  const [gen, setGen] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  const ok = data.posts.filter((p) => p.ok).length;
  const tagCount = new Map<string, number>();
  for (const p of data.posts) if (p.tag) tagCount.set(p.tag.name, (tagCount.get(p.tag.name) || 0) + 1);
  const tagSummary = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const testGen = (p: EvaluatedPost) => run(p.code, async () => {
    const r = await api<{ text: string }>(`/triggers/${t.id}/test-generate`, { method: 'POST', body: { post: p } });
    setGen((g) => ({ ...g, [p.code]: r.text }));
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Preview: {t.name}</DialogTitle>
          <DialogDescription>
            Dicari: {data.queries.join(' · ')} — <b>{data.posts.length}</b> postingan, <b>{ok}</b> lolos filter. Tidak ada yang dikirim dari sini.
          </DialogDescription>
          {tagSummary.length ? (
            <div className="flex flex-wrap items-center gap-1 pt-1 text-xs text-muted-foreground">
              Topic tag di hasil: {tagSummary.map(([n, c]) => <Pill key={n} t="info">#{n} · {c}</Pill>)}
            </div>
          ) : null}
          {data.errors.length ? <p className="text-xs text-amber-600">{data.errors.join(' | ')}</p> : null}
        </DialogHeader>
        <div className="overflow-y-auto p-2">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Status</TableHead><TableHead>Penulis</TableHead><TableHead>Teks</TableHead><TableHead>Metrik</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {data.posts.map((p) => (
                <TableRow key={p.code} className="align-top">
                  <TableCell className="w-36 whitespace-normal">{p.ok ? <Pill t="ok">lolos</Pill> : <Pill>{p.reason}</Pill>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">@{p.username}</a>
                    <div className="text-xs text-muted-foreground">{ago(p.takenAt)}</div>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    {p.tag ? <TagPill name={p.tag.name} /> : null}
                    <p className="line-clamp-3 text-sm">{p.text}</p>
                    {gen[p.code] ? <p className="mt-1 rounded-md bg-sky-500/10 p-2 text-sm"><b>AI:</b> {gen[p.code]}</p> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {p.metricsChecked
                      ? <>❤ {num(p.likes)}<br />💬 {num(p.replies)}<br />🔁 {num(p.reposts)}<br />↗ {num(p.shares)}</>
                      : <span className="font-sans text-muted-foreground" title="Repliz tidak memberi angka like/balasan/share; dicek via Lightpanda hanya bila trigger punya syarat viral dan postingan lolos filter lain">— belum dicek</span>}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" disabled={busy === p.code} onClick={() => testGen(p)}>
                      <Wand2 />{busy === p.code ? '…' : 'Tes komentar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Terapkan aturan yang disarankan (hasil uji pada data Threads asli) dalam 1–2 ketukan. */
function RecommendDialog({ t, onClose, onDone }: { t: TriggerJ; onClose: () => void; onDone: () => void }) {
  const [kw, setKw] = useState(() => guessKeyword(t));
  const [applyViral, setApplyViral] = useState(true);
  const [createEarly, setCreateEarly] = useState(true);
  const [queriesText, setQueriesText] = useState(() => earlyQueries(t, guessKeyword(t) || 'kata').join('\n'));
  const { busy, run } = useAction();
  const k = kw.trim().toLowerCase();
  const changeKw = (v: string) => { setKw(v); setQueriesText(earlyQueries(t, v.trim().toLowerCase() || 'kata').join('\n')); };

  const apply = () => run('rec', async () => {
    const r = await api<{ message: string }>(`/triggers/${t.id}/recommend`, {
      method: 'POST',
      body: { keyword: k, applyViral, createEarly, earlyQueries: queriesText.split('\n').map((s) => s.trim()).filter(Boolean) },
    });
    toast.success(`Diterapkan: ${r.message}. Tekan Preview untuk melihat hasilnya.`);
    onDone();
    onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Rekomendasi: {t.name}</DialogTitle>
          <DialogDescription>Aturan yang terbukti menghasilkan kandidat pada data Threads asli. Nama, akun, instruksi AI & dry-run trigger ini tidak diubah.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          <TextField label="Kata utama (lokasi/topik)" value={kw} onChange={changeKw} placeholder="bogor"
            help="Postingan harus memuat kata ini. Biasanya nama kota, mis. bogor." />

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <SwitchField label={`Perbarui aturan "${t.name}"`} checked={applyViral} onChange={setApplyViral} />
            <ul className="ml-1 list-disc pl-4 text-xs text-muted-foreground">
              <li>Topic tag mengandung &quot;{k || '…'}&quot;, hindari tag &quot;Loker …&quot;</li>
              <li>Teks harus cocok: <code>{k ? keywordExpr(k) : '…'}</code></li>
              <li>Viral: suka ≥ 20 <b>atau</b> balasan ≥ 5</li>
              <li>Terbaru dulu, umur ≤ 72 jam, 3 komentar tiap 15 menit</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <SwitchField label={`Buat trigger "Komentator awal${k ? ` ${k[0].toUpperCase()}${k.slice(1)}` : ''}"`} checked={createEarly} onChange={setCreateEarly} />
            <ul className="ml-1 list-disc pl-4 text-xs text-muted-foreground">
              <li>Postingan baru (≤ 24 jam) tanpa syarat viral — jadi pengomentar awal</li>
              <li>Mulai dalam <b>dry-run</b>; matikan setelah hasilnya pas</li>
            </ul>
            {createEarly ? (
              <TextareaField label="Kata pencarian (satu per baris)" value={queriesText} onChange={setQueriesText} rows={3} />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Bila &quot;maks postingan dicek metrik&quot; di Pengaturan masih di bawah 30, ikut dinaikkan ke 30.</p>
        </div>
        <DialogFooter className="m-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={apply} disabled={busy === 'rec' || k.length < 2 || (!applyViral && !createEarly)}>
            {busy === 'rec' ? 'Menerapkan…' : 'Terapkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
