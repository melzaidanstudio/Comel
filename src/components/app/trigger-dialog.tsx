'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, useAction } from '@/lib/client';
import {
  ActiveHoursField, IdSelectField, NumberField, Section, SelectField, SwitchField, TextField, TextareaField,
} from './fields';
import { defaultHoursLabel, type AccountJ, type AppSettings, type ProviderJ, type TagJ, type TriggerJ } from './types';

type Form = Omit<TriggerJ, 'id' | 'createdAt' | 'nextRunAt' | 'lastRunAt' | 'lastStatus' | 'queries'> & { queriesText: string };

export function emptyTrigger(accountId: number): Form {
  return {
    name: '', accountId, enabled: true, queriesText: '', matchExpr: '', excludeWords: '', excludeUsers: '', includeReplies: false,
    topicTags: '', excludeTags: '', tagMatch: 'exact', tagAsSource: true,
    minLikes: 100, minReplies: 50, minReposts: 0, minShares: 50, minQuotes: 0, metricLogic: 'all',
    maxAgeHours: 72, minAgeMinutes: 0, activeHours: '', sortBy: 'newest',
    actionsPerRun: 3, intervalMinutes: 15, authorCooldownHours: 168, instruction: '', providerId: null, dryRun: true,
  };
}

export function toForm(t: TriggerJ): Form {
  const { id: _i, createdAt: _c, nextRunAt: _n, lastRunAt: _l, lastStatus: _s, queries, ...rest } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, queriesText: (queries || []).join('\n') };
}

function TagChips({ onPick }: { onPick: (name: string) => void }) {
  const [tags, setTags] = useState<TagJ[] | null>(null);
  useEffect(() => { api<TagJ[]>('/tags?limit=40').then(setTags).catch(() => setTags([])); }, []);
  if (tags === null) return <p className="text-xs text-muted-foreground">Memuat saran tag…</p>;
  if (!tags.length) return <p className="text-xs text-muted-foreground">Belum ada saran — tag terkumpul otomatis setiap kali Preview/trigger berjalan.</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Tag yang pernah terlihat:</span>
      {tags.map((t) => (
        <button key={t.norm} type="button" title={`terlihat ${t.seenCount}×`} onClick={() => onPick(t.name)}
          className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted">#{t.name}{t.isCommunity ? ' ★' : ''}</button>
      ))}
    </div>
  );
}

export function TriggerDialog({ open, onOpenChange, initial, editId, accounts, providers, settings, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Form; editId: number | null;
  accounts: AccountJ[]; providers: ProviderJ[]; settings?: AppSettings; onSaved: () => void;
}) {
  const [f, setF] = useState<Form>(initial); // dialog di-mount ulang (key) setiap dibuka
  const { busy, run } = useAction();
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const addTag = (name: string) => setF((p) => {
    const cur = p.topicTags.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (!cur.some((x) => x.toLowerCase() === name.toLowerCase())) cur.push(name);
    return { ...p, topicTags: cur.join(', ') };
  });

  async function save() {
    await run('save', async () => {
      const { queriesText, ...rest } = f;
      const payload = { ...rest, queries: queriesText.split('\n').map((s) => s.trim()).filter(Boolean) };
      if (editId) await api(`/triggers/${editId}`, { method: 'PUT', body: payload });
      else await api('/triggers', { method: 'POST', body: payload });
      toast.success('Trigger disimpan');
      onOpenChange(false);
      onSaved();
    });
  }

  const provOpts = providers.map((p) => [p.id, `${p.name} (${p.model})`] as [number, string]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>{editId ? `Edit trigger: ${initial.name}` : 'Trigger baru'}</DialogTitle>
          <DialogDescription>Kata kunci / topic tag + filter viralitas & waktu + jadwal → komentar AI otomatis.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 overflow-y-auto p-5">
          <Section title="Umum">
            <TextField label="Nama trigger" value={f.name} onChange={set('name')} placeholder="Kuliner Bogor viral" required />
            <IdSelectField label="Akun Threads" value={f.accountId} noneLabel={false}
              options={accounts.map((a) => [a.id, `${a.name}${a.username ? ` (@${a.username})` : ''}`])} onChange={(v) => set('accountId')(v ?? f.accountId)} />
            <IdSelectField label="AI provider" value={f.providerId} options={provOpts} onChange={set('providerId')} help="Kosong = provider akun / default" />
            <SwitchField label="Aktif (jalan otomatis sesuai jadwal)" checked={f.enabled} onChange={set('enabled')} />
          </Section>

          <Section title="Kata kunci">
            <TextareaField className="sm:col-span-2" label="Kata pencarian di Threads (satu per baris)" value={f.queriesText} onChange={set('queriesText')} rows={3}
              placeholder={'kuliner bogor\nmakanan enak bogor'} help="Dicari lewat Repliz (Threads Research). Kosong = diambil dari ekspresi / topic tag." />
            <TextField className="sm:col-span-2" label="Ekspresi kata kunci (filter teks)" value={f.matchExpr} onChange={set('matchExpr')}
              placeholder='kuliner AND (bogor OR "kota hujan") -promo' help="AND/DAN, OR/ATAU, NOT/BUKAN atau -kata, kurung, &quot;frasa&quot;. Nama topic tag ikut dicocokkan." />
            <TextField label="Kata yang dihindari" value={f.excludeWords} onChange={set('excludeWords')} placeholder="giveaway, judi" help="Dipisah koma" />
            <TextField label="User yang dihindari" value={f.excludeUsers} onChange={set('excludeUsers')} placeholder="@akunpesaing" help="Dipisah koma" />
            <SwitchField className="sm:col-span-2" label="Ikutkan postingan yang berupa balasan (bukan utas utama)" checked={f.includeReplies} onChange={set('includeReplies')}
              help="Repliz tidak menandai balasan; balasan baru terdeteksi bila metrik viral dicek (trigger punya syarat viral)." />
          </Section>

          <Section title="Topic tag" description="Threads mengizinkan satu topic tag per postingan, mis. Kuliner Bogor.">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <TextareaField label="Topic tag (wajib salah satu)" value={f.topicTags} onChange={set('topicTags')} rows={2}
                placeholder="Kuliner Bogor, Food Threads" help="Hanya postingan ber-tag ini yang dikomentari. Kosong = tanpa filter tag." />
              <TagChips onPick={addTag} />
            </div>
            <SelectField label="Cara mencocokkan tag" value={f.tagMatch as 'exact' | 'contains'} onChange={set('tagMatch')}
              options={[['exact', 'Sama persis ("Kuliner Bogor" = "kulinerbogor")'], ['contains', 'Mengandung kata ("bogor" ⊂ "Kuliner Bogor")']]} />
            <TextField label="Tag yang dihindari" value={f.excludeTags} onChange={set('excludeTags')} placeholder="Loker Bogor, Politik" />
            <SwitchField className="sm:col-span-2" label="Cari juga berdasarkan topic tag (trigger by tag)" checked={f.tagAsSource} onChange={set('tagAsSource')}
              help="Membuka halaman tag di Threads untuk tiap tag. Kata pencarian boleh dikosongkan." />
          </Section>

          <Section title="Filter viralitas" description="0 = tidak dipakai. Repliz tidak memberi angka ini, jadi diambil via Lightpanda untuk sejumlah kandidat teratas per putaran (atur di Pengaturan).">
            <NumberField label="Minimal suka" value={f.minLikes} onChange={set('minLikes')} />
            <NumberField label="Minimal balasan/komentar" value={f.minReplies} onChange={set('minReplies')} />
            <NumberField label="Minimal repost" value={f.minReposts} onChange={set('minReposts')} />
            <NumberField label="Minimal share" value={f.minShares} onChange={set('minShares')} />
            <NumberField label="Minimal quote" value={f.minQuotes} onChange={set('minQuotes')} />
            <SelectField label="Logika syarat viralitas" value={f.metricLogic as 'all' | 'any'} onChange={set('metricLogic')}
              options={[['all', 'Semua syarat terpenuhi (AND)'], ['any', 'Salah satu cukup (OR)']]} />
          </Section>

          <Section title="Filter waktu">
            <NumberField label="Umur postingan maksimal (jam)" value={f.maxAgeHours} onChange={set('maxAgeHours')} help="0 = tanpa batas. Juga dipakai sebagai rentang tanggal pencarian di Repliz." />
            <NumberField label="Umur postingan minimal (menit)" value={f.minAgeMinutes} onChange={set('minAgeMinutes')} />
            <ActiveHoursField label="Jam aktif" value={f.activeHours} onChange={set('activeHours')} defaultLabel={defaultHoursLabel(settings)}
              help="Di luar jam ini trigger tidak berjalan. Default diatur di Pengaturan." />
            <SelectField label="Urutan pencarian" value={f.sortBy as 'engagement' | 'newest'} onChange={set('sortBy')}
              options={[['newest', 'Terbaru dulu (Recent)'], ['engagement', 'Teratas / paling viral (Top)']]}
              help="Terbaru = cocok untuk jadi pengomentar awal; Teratas = postingan yang sedang ramai." />
          </Section>

          <Section title="Jadwal">
            <NumberField label="Jumlah komentar per putaran" value={f.actionsPerRun} onChange={set('actionsPerRun')} />
            <NumberField label="Setiap (menit)" value={f.intervalMinutes} min={1} onChange={set('intervalMinutes')} />
            <NumberField label="Jeda per penulis (jam)" value={f.authorCooldownHours} onChange={set('authorCooldownHours')}
              help="Tidak mengomentari orang yang sama lebih dari sekali dalam rentang ini" />
          </Section>

          <Section title="AI">
            <TextareaField className="sm:col-span-2" label="Instruksi khusus trigger ini" value={f.instruction} onChange={set('instruction')} rows={4}
              placeholder="Komentari makanannya secara spesifik dan antusias. Jangan promosi." />
            <SwitchField className="sm:col-span-2" label="Dry run: buat komentar tapi JANGAN kirim (uji coba)" checked={f.dryRun} onChange={set('dryRun')} />
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
